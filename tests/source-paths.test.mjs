import assert from "node:assert/strict";
import test from "node:test";
import { hasIgnoredSourceSegment, normalizeSourcePath } from "../scripts/lib/source-paths.mjs";

test("ignored source paths normalize Windows and POSIX separators identically", () => {
  const ignored = new Set(["node_modules", "dist"]);

  assert.equal(normalizeSourcePath("node_modules\\wrangler\\file.js"), "node_modules/wrangler/file.js");
  assert.equal(hasIgnoredSourceSegment("node_modules\\wrangler\\file.js", ignored), true);
  assert.equal(hasIgnoredSourceSegment("node_modules/wrangler/file.js", ignored), true);
  assert.equal(hasIgnoredSourceSegment("scripts/wrangler/file.js", ignored), false);
});
