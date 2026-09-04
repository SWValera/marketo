import assert from "node:assert/strict";
import test from "node:test";
import {
  clearDependentValues,
  isAttributeVisible,
  sanitizeAttributeFilters,
} from "../lib/reference-data/attributes.ts";
import { categorySchemaProfiles } from "../lib/reference-data/category-attribute-schemas.ts";
import { validateMasterCatalog } from "../scripts/validate-master-catalog.mjs";

const attribute = (key, validation = {}, dependsOnKey = null) => ({
  key,
  visible: true,
  validation,
  dependsOnKey,
});

test("changing a discriminator clears values and range bounds that become hidden", () => {
  const attributes = [
    attribute("item_type"),
    attribute("costume_size", { visibleWhen: { key: "item_type", values: ["costume"] } }),
    attribute("decor_width", { visibleWhen: { key: "item_type", values: ["decor"] } }),
  ];
  const next = clearDependentValues("item_type", "decor", attributes, {
    item_type: "costume",
    costume_size: "L",
    costume_size_min: "40",
    costume_size_max: "52",
    decor_width: "120",
  });

  assert.deepEqual(next, {
    item_type: "decor",
    decor_width: "120",
  });
  assert.equal(isAttributeVisible(attributes[1], next), false);
  assert.equal(isAttributeVisible(attributes[2], next), true);
});

test("dependent reference selections are still cleared when their parent changes", () => {
  const attributes = [
    attribute("brand"),
    attribute("model", {}, "brand"),
    attribute("model_other", { visibleWhen: { key: "model", values: ["other-model"] } }),
  ];
  const next = clearDependentValues("brand", "samsung", attributes, {
    brand: "apple",
    model: "other-model",
    model_other: "Legacy value",
  });

  assert.deepEqual(next, { brand: "samsung" });
});

test("server filter sanitization drops unknown, hidden and orphaned dependent URL filters", () => {
  const filterAttribute = (key, validation = {}, overrides = {}) => ({
    ...attribute(key, validation, overrides.dependsOnKey ?? null),
    filterable: overrides.filterable ?? true,
    filterMode: overrides.filterMode ?? "exact",
    visible: overrides.visible ?? true,
  });
  const attributes = [
    filterAttribute("photo_video_type"),
    filterAttribute("camera_type", { visibleWhen: { key: "photo_video_type", values: ["photo"] } }),
    filterAttribute("video_camera_type", { visibleWhen: { key: "photo_video_type", values: ["video"] } }),
    filterAttribute("model", {}, { dependsOnKey: "brand" }),
    filterAttribute("brand"),
    filterAttribute("screen_size", {}, { filterMode: "range" }),
    filterAttribute("internal_note", {}, { filterable: false }),
    filterAttribute("retired_filter", {}, { visible: false }),
    filterAttribute("delivery"),
  ];
  const input = {
    photo_video_type: "photo",
    camera_type: "mirrorless",
    video_camera_type: "camcorder",
    model: "iphone-16",
    screen_size: "6.1",
    screen_size_min: "5",
    screen_size_max: "7",
    internal_note: "secret",
    retired_filter: "old",
    delivery: "false",
    unknown: "value",
  };

  assert.deepEqual(sanitizeAttributeFilters(attributes, input), {
    photo_video_type: "photo",
    camera_type: "mirrorless",
    screen_size_min: "5",
    screen_size_max: "7",
    delivery: "false",
  });
  assert.equal(input.video_camera_type, "camcorder");
  assert.equal(input.model, "iphone-16");
});

test("server filter sanitization removes hidden filters transitively regardless of attribute order", () => {
  const attributes = [
    { ...attribute("third", { visibleWhen: { key: "second", values: ["yes"] } }), filterable: true, filterMode: "exact" },
    { ...attribute("second", { visibleWhen: { key: "first", values: ["yes"] } }), filterable: true, filterMode: "exact" },
    { ...attribute("first"), filterable: true, filterMode: "exact" },
  ];

  assert.deepEqual(sanitizeAttributeFilters(attributes, {
    first: "no",
    second: "yes",
    third: "kept-by-a-single-pass",
  }), { first: "no" });
});

test("dependent-value cleanup terminates defensively when runtime metadata contains a cycle", () => {
  const attributes = [
    attribute("cycle_a", { visibleWhen: { key: "cycle_b", values: ["x"] } }),
    attribute("cycle_b", { visibleWhen: { key: "cycle_a", values: ["x"] } }),
  ];

  assert.deepEqual(
    clearDependentValues("cycle_a", "changed", attributes, { cycle_a: "x", cycle_b: "x" }),
    {},
  );
});

test("catalog validation rejects malformed, non-option and cyclic visibleWhen metadata", () => {
  const profile = categorySchemaProfiles.smartWatch;
  const initialLength = profile.length;
  const label = { ru: "Тест", kk: "Тест" };
  const option = { value: "x", label };
  profile.push(
    { key: "broken_condition", label, dataType: "text", validation: { visibleWhen: "broken" } },
    { key: "empty_condition", label, dataType: "text", validation: { visibleWhen: { key: " ", values: [] } } },
    { key: "text_controller", label, dataType: "text" },
    { key: "text_controlled", label, dataType: "text", validation: { visibleWhen: { key: "text_controller", values: ["x"] } } },
    { key: "self_cycle", label, dataType: "select", options: [option], validation: { visibleWhen: { key: "self_cycle", values: ["x"] } } },
    { key: "cycle_a", label, dataType: "select", options: [option], validation: { visibleWhen: { key: "cycle_b", values: ["x"] } } },
    { key: "cycle_b", label, dataType: "select", options: [option], validation: { visibleWhen: { key: "cycle_a", values: ["x"] } } },
  );

  try {
    const result = validateMasterCatalog();
    assert.equal(result.ok, false);
    assert(result.failures.some((failure) => failure.includes("visibleWhen must be an object: smart-watches.broken_condition")));
    assert(result.failures.some((failure) => failure.includes("visibleWhen has an invalid controller key: smart-watches.empty_condition")));
    assert(result.failures.some((failure) => failure.includes("visibleWhen controller is not option-backed: smart-watches.text_controlled")));
    assert(result.failures.some((failure) => failure.includes("visibleWhen cannot reference itself: smart-watches.self_cycle")));
    assert(result.failures.some((failure) => failure.includes("visibleWhen dependency cycle: smart-watches.cycle_a")));
  } finally {
    profile.splice(initialLength);
  }
});
