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
import { mapCategoryReferenceRows } from "../lib/data/supabase/categories.ts";
import {
  createSingleFlightTtlLoader,
  isPublishLoadRetryable,
  publishEditorPath,
  publishLoadFailureForStatus,
  publishLoginHref,
  readPublishDraftResponse,
} from "../lib/publish/loader.ts";

const categoryId = "10000000-0000-4000-8000-000000000001";
const settlementId = "20000000-0000-4000-8000-000000000002";
const userA = "30000000-0000-4000-8000-000000000003";
const userB = "40000000-0000-4000-8000-000000000004";

function ownerDraftBundle(overrides = {}) {
  return {
    id: categoryId,
    slug: "draft-listing",
    status: "draft",
    categoryId,
    categorySlug: "jobs-logistics",
    settlementId,
    title: "Рабочий заголовок",
    description: "Достаточно подробное описание",
    price: 1000,
    currencyCode: "KZT",
    contactName: "Алия",
    contactPhone: "+77001234567",
    allowMessages: true,
    attributes: {},
    images: [],
    rejectionReasonCode: null,
    rejectedAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("publish loader preserves status semantics and safe edit return paths", () => {
  assert.deepEqual(
    [401, 404, 409, 503, 500].map((status) => [status, publishLoadFailureForStatus(status)]),
    [
      [401, "authentication"],
      [404, "not_found"],
      [409, "not_editable"],
      [503, "temporary"],
      [500, "unexpected"],
    ],
  );
  assert.equal(isPublishLoadRetryable("temporary"), true);
  for (const reason of ["authentication", "not_found", "not_editable", "unexpected"]) {
    assert.equal(isPublishLoadRetryable(reason), false);
  }
  assert.equal(publishEditorPath(null), "/publish");
  assert.equal(publishEditorPath(categoryId), `/publish?listing=${categoryId}`);
  assert.equal(publishLoginHref(null), "/login?next=%2Fpublish");
  assert.equal(
    publishLoginHref(categoryId),
    `/login?next=${encodeURIComponent(`/publish?listing=${categoryId}`)}`,
  );
});

test("publish draft response parser preserves HTTP failures and rejects malformed success bodies", async () => {
  for (const [status, reason] of [[401, "authentication"], [404, "not_found"], [409, "not_editable"], [503, "temporary"]]) {
    await assert.rejects(
      readPublishDraftResponse(new Response(null, { status })),
      (error) => error?.reason === reason,
    );
  }
  await assert.rejects(
    readPublishDraftResponse(new Response("not-json", { status: 200 })),
    (error) => error?.reason === "unexpected",
  );
  await assert.rejects(
    readPublishDraftResponse(new Response(JSON.stringify({}), { status: 200 })),
    (error) => error?.reason === "unexpected",
  );
  for (const listing of ["invalid", [], { id: categoryId }]) {
    await assert.rejects(
      readPublishDraftResponse(new Response(JSON.stringify({ listing }), { status: 200 })),
      (error) => error?.reason === "unexpected",
    );
  }
  const listing = ownerDraftBundle();
  assert.deepEqual(
    await readPublishDraftResponse(new Response(JSON.stringify({ listing }), { status: 200 })),
    listing,
  );
});

test("publish catalog cache deduplicates, expires, and never caches failures", async () => {
  let now = 1000;
  let calls = 0;
  const load = createSingleFlightTtlLoader(async () => {
    calls += 1;
    return { generation: calls };
  }, 500, () => now);

  const first = load();
  const concurrent = load();
  assert.equal(first, concurrent);
  assert.deepEqual(await first, { generation: 1 });
  assert.deepEqual(await load(), { generation: 1 });
  assert.equal(calls, 1);

  now += 501;
  assert.deepEqual(await load(), { generation: 2 });
  assert.equal(calls, 2);

  let failingCalls = 0;
  const retryable = createSingleFlightTtlLoader(async () => {
    failingCalls += 1;
    if (failingCalls === 1) throw new Error("temporary reference failure");
    return "ready";
  }, 500, () => now);
  await assert.rejects(retryable(), /temporary reference failure/);
  assert.equal(await retryable(), "ready");
  assert.equal(failingCalls, 2);
});

test("shared category mapper preserves catalog identity, hierarchy, RU/KK, and presentation", () => {
  const childId = "10000000-0000-4000-8000-000000000009";
  assert.deepEqual(mapCategoryReferenceRows([
    {
      id: categoryId,
      parent_id: null,
      slug: "jobs",
      name_ru: "Работа",
      name_kk: "Жұмыс",
      icon_key: "briefcase",
      tone_key: "green",
      search_placeholder_ru: null,
      search_placeholder_kk: null,
      title_placeholder_ru: null,
      title_placeholder_kk: null,
      description_hint_ru: null,
      description_hint_kk: null,
      price_mode: "salary",
      sort_order: 16,
    },
    {
      id: childId,
      parent_id: categoryId,
      slug: "jobs-logistics",
      name_ru: "Логистика",
      name_kk: "Логистика",
      icon_key: "truck",
      tone_key: "blue",
      search_placeholder_ru: "Найти вакансию",
      search_placeholder_kk: "Жұмыс табу",
      title_placeholder_ru: "Водитель",
      title_placeholder_kk: "Жүргізуші",
      description_hint_ru: "Опишите условия",
      description_hint_kk: "Шарттарды сипаттаңыз",
      price_mode: "salary",
      sort_order: 17,
    },
  ]), {
    categories: [{
      id: categoryId,
      parentId: null,
      slug: "jobs",
      name: { ru: "Работа", kk: "Жұмыс" },
      icon: "briefcase",
      tone: "green",
      searchPlaceholder: null,
      titlePlaceholder: null,
      descriptionHint: null,
      priceMode: "salary",
      sortOrder: 16,
    }, {
      id: childId,
      parentId: categoryId,
      slug: "jobs-logistics",
      name: { ru: "Логистика", kk: "Логистика" },
      icon: "truck",
      tone: "blue",
      searchPlaceholder: { ru: "Найти вакансию", kk: "Жұмыс табу" },
      titlePlaceholder: { ru: "Водитель", kk: "Жүргізуші" },
      descriptionHint: { ru: "Опишите условия", kk: "Шарттарды сипаттаңыз" },
      priceMode: "salary",
      sortOrder: 17,
    }],
  });
});

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
    assert.equal(publicMediaUrl("listings/a/photo.webp"), "/api/media/listings/a/photo.webp");
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
