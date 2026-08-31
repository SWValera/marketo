import assert from "node:assert/strict";
import test from "node:test";
import { validateMasterCatalog } from "../scripts/validate-master-catalog.mjs";

test("Master Catalog passes structural, semantic, dictionary and filter validation", () => {
  const result = validateMasterCatalog();
  assert.deepEqual(result.failures, []);
  assert.equal(result.ok, true);
  assert.equal(result.categories, 1_356);
  assert.equal(result.leaves, 1_137);
  assert.equal(result.roots, 16);
  assert.equal(result.contextualMetadataAssignments, 1_356 * 3 * 2);
  assert.ok(result.serviceLeaves >= 250);
  assert.ok(result.assertions > 465_706, "semantic assertion coverage unexpectedly shrank");
});
