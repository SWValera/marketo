import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPriceDigits,
  isPublishValueMissing,
  parsePriceDigits,
  priceCaretPosition,
  validatePublishAttributes,
  validatePublishDraft,
} from "../lib/publish/contract.ts";
import {
  createPublishRecovery,
  PUBLISH_RECOVERY_TTL_MS,
  publishRecoveryKey,
  readPublishRecovery,
  removePublishRecovery,
  savePublishRecovery,
} from "../lib/publish/recovery.ts";
import { protectedMediaUrl, publicMediaUrl } from "../lib/media/public-url.ts";
import { translate } from "../lib/i18n/messages.ts";

const categoryId = "10000000-0000-4000-8000-000000000001";
const settlementId = "20000000-0000-4000-8000-000000000002";
const userA = "30000000-0000-4000-8000-000000000003";
const userB = "40000000-0000-4000-8000-000000000004";

function attribute(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    categoryId,
    key: "value",
    label: { ru: "Значение", kk: "Мән" },
    dataType: "text",
    unit: null,
    required: false,
    filterable: true,
    searchable: false,
    inheritsToChildren: false,
    validation: {},
    filterMode: "exact",
    optionsLoadMode: "eager",
    dependsOnKey: null,
    visible: true,
    sortOrder: 10,
    options: [],
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    categoryId,
    settlementId,
    title: "Рабочий заголовок",
    description: "Достаточно подробное описание товара",
    price: 10_000_000,
    currencyCode: "KZT",
    contactName: "Алия",
    contactPhone: "+7 700 123 45 67",
    allowMessages: true,
    attributes: {},
    ...overrides,
  };
}

test("shared publish contract enforces the same base field limits", () => {
  const options = { priceMode: "price", attributes: [] };
  assert.deepEqual(validatePublishDraft(draft({ title: "ab" }), options).title, ["min_length"]);
  assert.equal(validatePublishDraft(draft({ title: "abc" }), options).title, undefined);
  assert.deepEqual(validatePublishDraft(draft({ description: "коротко" }), options).description, ["min_length"]);
  assert.deepEqual(validatePublishDraft(draft({ price: -1 }), options).price, ["invalid"]);
  assert.deepEqual(validatePublishDraft(draft({ price: 90_000_000_001 }), options).price, ["max"]);
  assert.equal(validatePublishDraft(draft({ price: null }), options).price?.[0], "required");
  assert.equal(validatePublishDraft(draft({ price: null }), { ...options, priceMode: "free" }).price, undefined);
  assert.equal(validatePublishDraft(draft({ contactPhone: "123" }), options).contactPhone?.[0], "invalid");
});

test("dynamic attribute validation is type-safe and metadata-driven", () => {
  const optional = attribute({ key: "optional" });
  const required = attribute({ key: "required", required: true });
  const boolean = attribute({ key: "confirmed", dataType: "boolean", required: true });
  assert.deepEqual(validatePublishAttributes({ optional: "" }, [optional]), {});
  assert.deepEqual(validatePublishAttributes({}, [required]), { "attributes.required": ["required"] });
  assert.equal(isPublishValueMissing(false), false);
  assert.deepEqual(validatePublishAttributes({ confirmed: false }, [boolean]), {});

  const number = attribute({
    key: "year",
    dataType: "number",
    required: true,
    validation: { min: 2000, max: 2026, step: 2 },
  });
  assert.deepEqual(validatePublishAttributes({ year: 1999 }, [number]), { "attributes.year": ["min", "step"] });
  assert.deepEqual(validatePublishAttributes({ year: 2027 }, [number]), { "attributes.year": ["max", "step"] });
  assert.deepEqual(validatePublishAttributes({ year: 2025 }, [number]), { "attributes.year": ["step"] });
  assert.deepEqual(validatePublishAttributes({ year: 2026 }, [number]), {});

  const text = attribute({ key: "serial", validation: { maxLength: 4 } });
  assert.deepEqual(validatePublishAttributes({ serial: "12345" }, [text]), { "attributes.serial": ["max_length"] });

  const hiddenRequired = attribute({
    key: "manual",
    required: true,
    validation: { visibleWhen: { key: "mode", values: ["other"] } },
  });
  assert.deepEqual(validatePublishAttributes({}, [hiddenRequired]), {});
});

test("option validation rejects unknown and mismatched dependent values", () => {
  const firstParentId = crypto.randomUUID();
  const secondParentId = crypto.randomUUID();
  const brand = attribute({
    key: "brand",
    dataType: "select",
    required: true,
    options: [
      { id: firstParentId, attributeId: "brand", parentOptionId: null, value: "toyota", label: { ru: "Toyota", kk: "Toyota" }, sortOrder: 1 },
      { id: secondParentId, attributeId: "brand", parentOptionId: null, value: "honda", label: { ru: "Honda", kk: "Honda" }, sortOrder: 2 },
    ],
  });
  const model = attribute({
    key: "model",
    dataType: "select",
    required: true,
    dependsOnKey: "brand",
    options: [
      { id: crypto.randomUUID(), attributeId: "model", parentOptionId: secondParentId, value: "civic", label: { ru: "Civic", kk: "Civic" }, sortOrder: 1 },
    ],
  });
  assert.deepEqual(
    validatePublishAttributes({ brand: "unknown", model: "civic" }, [brand, model], { strictOptions: true }),
    { "attributes.brand": ["invalid_option"], "attributes.model": ["dependent_option"] },
  );
  assert.deepEqual(
    validatePublishAttributes({ brand: "toyota", model: "civic" }, [brand, model], { strictOptions: true }),
    { "attributes.model": ["dependent_option"] },
  );
  assert.deepEqual(validatePublishAttributes({ brand: "honda", model: "civic" }, [brand, model], { strictOptions: true }), {});
});

test("price formatting preserves integer meaning and a digit-based caret", () => {
  const visible = formatPriceDigits("10000000");
  assert.equal(visible, "10 000 000");
  assert.equal(parsePriceDigits(`${visible} ₸`), "10000000");
  assert.equal(Number(parsePriceDigits(visible)), 10_000_000);
  assert.equal(priceCaretPosition(visible, 2), 2);
  assert.equal(priceCaretPosition(visible, 3), 4);
  assert.equal(formatPriceDigits(parsePriceDigits("10 000 000")), visible);
});

test("local recovery is user-scoped, consent-readable, expiring and removable", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const fields = {
    categorySlug: "free-other",
    cityId: settlementId,
    title: "Локальный черновик",
    description: "Несохранённые изменения владельца",
    priceDigits: "",
    attributes: { confirmed: false },
    contactName: "Алия",
    contactPhone: "+77001234567",
    allowMessages: true,
  };
  const now = 1_900_000_000_000;
  const serverListingId = "50000000-0000-4000-8000-000000000005";
  const own = createPublishRecovery(userA, fields, serverListingId, now);
  savePublishRecovery(storage, own);

  assert.notEqual(publishRecoveryKey(userA), publishRecoveryKey(userB));
  assert.deepEqual(readPublishRecovery(storage, userA, now), { status: "ready", draft: own });
  assert.deepEqual(readPublishRecovery(storage, userB, now), { status: "empty", draft: null });

  storage.setItem(publishRecoveryKey(userB), JSON.stringify(own));
  assert.deepEqual(readPublishRecovery(storage, userB, now), { status: "foreign", draft: null });
  savePublishRecovery(storage, createPublishRecovery(userA, fields, null, now - PUBLISH_RECOVERY_TTL_MS - 1));
  assert.deepEqual(readPublishRecovery(storage, userA, now), { status: "stale", draft: null });

  removePublishRecovery(storage, userA);
  assert.deepEqual(readPublishRecovery(storage, userA, now), { status: "empty", draft: null });
});

test("protected listing media never uses the configured public CDN", () => {
  const previous = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.example.test/media";
  try {
    assert.equal(publicMediaUrl("listings/a/photo.webp"), "https://cdn.example.test/media/listings/a/photo.webp");
    assert.equal(protectedMediaUrl("listings/a/photo.webp"), "/api/media/listings/a/photo.webp");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = previous;
  }
});

test("owner listing statuses are localized without changing stable DB values", () => {
  assert.deepEqual(
    ["draft", "pending", "active", "rejected", "archived", "sold", "expired"].map((status) => [
      status,
      translate("ru", `profile.status.${status}`),
      translate("kk", `profile.status.${status}`),
    ]),
    [
      ["draft", "Черновик", "Нобай"],
      ["pending", "На модерации", "Модерацияда"],
      ["active", "Активно", "Жарияланды"],
      ["rejected", "Отклонено", "Қабылданбады"],
      ["archived", "В архиве", "Мұрағатта"],
      ["sold", "Продано", "Сатылды"],
      ["expired", "Истекло", "Мерзімі аяқталды"],
    ],
  );
});
