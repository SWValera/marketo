// A fresh process releases the previous database's native/WASM allocations.
// Return both required partitions; never inherit a caller's partial-audit mode.
export function pgliteRunScopes(testName) {
  if (testName === "supabase-security.test.mjs") return ["current", "replay"];
  return [null];
}
