import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/use-category-attributes.ts", import.meta.url), "utf8");

test("category attribute requests are single-flight and survive consumer cleanup", () => {
  assert.match(source, /const inFlightRequests = new Map<string, Promise<CategoryAttributeReferenceData>>\(\)/);
  assert.match(source, /const cacheKey = `\$\{CATEGORY_REFERENCE_VERSION\}:\$\{categoryId\}`/);
  assert.match(source, /const pending = inFlightRequests\.get\(cacheKey\);\s*if \(pending\) return pending;/);
  assert.match(source, /inFlightRequests\.set\(cacheKey, request\)/);
  assert.match(source, /if \(inFlightRequests\.get\(cacheKey\) === request\) inFlightRequests\.delete\(cacheKey\)/);
  assert.match(source, /attributes\?v=\$\{encodeURIComponent\(CATEGORY_REFERENCE_VERSION\)\}/);
  assert.equal(source.match(/\bfetchWithDeadline\s*\(/g)?.length ?? 0, 1, "one shared bounded loader owns the network request");
  assert.doesNotMatch(source, /\bfetch\s*\(/, "no unbounded bypass of the shared loader");
  assert.doesNotMatch(source, /AbortController/, "one consumer must not abort a request shared by another consumer");
  assert.match(source, /return \(\) => \{ active = false; \}/);
});
