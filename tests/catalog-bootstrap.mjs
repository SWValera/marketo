import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CATEGORY_REFERENCE_VERSION } from "../lib/reference-data/release.ts";

// Fresh test databases have no production user's scalar record. Reuse the
// reviewed type transitions, but do not pretend the production backfill exists.
export async function emptyCatalogTransformPlan(db, directory) {
  const result = await db.query("select (select count(*) from public.listing_attribute_values) + (select count(*) from public.listing_attribute_option_values) as n");
  assert.equal(Number(result.rows[0].n), 0, "Empty catalog bootstrap must never transform existing listing data");
  const plan = JSON.parse(await readFile(new URL(`../supabase/catalog-releases/${CATEGORY_REFERENCE_VERSION}-type-transforms.json`, import.meta.url), "utf8"));
  const path = join(directory, "empty-test-type-transforms.json");
  await writeFile(path, JSON.stringify(plan.map(({ category, key, from, to }) => ({category,key,from,to}))), "utf8");
  return path;
}
