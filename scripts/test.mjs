import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { createSitesEnvironment, projectRoot, reportFailure, runNodeScript, runProcess } from "./lib/sites-runtime.mjs";

const PGLITE_TEST_NAMES = new Set([
  "premium-commercial-security.test.mjs",
  "supabase-migrations.test.mjs",
  "supabase-security.test.mjs",
]);

const PGLITE_WASM_FLAGS = [
  "--wasm-num-compilation-tasks=1",
  "--no-wasm-tier-up",
  "--no-wasm-dynamic-tiering",
  "--liftoff-only",
];

async function main() {
  const { environment } = createSitesEnvironment();
  // Production bundles may inline NEXT_PUBLIC_* values at build time. Tests use a
  // deterministic public-only Supabase endpoint that rendered-html.test.mjs mocks,
  // so a developer's .env.local can never make the suite depend on live data.
  environment.NEXT_PUBLIC_SUPABASE_URL = "https://reference-test.supabase.co";
  environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_reference_test";
  environment.MARKETO_MEDIA_BUCKET_NAME = "marketo-test-media";
  delete environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete environment.SUPABASE_SECRET_KEY;
  delete environment.SUPABASE_SERVICE_ROLE_KEY;
  await runNodeScript("scripts/build-verified.mjs", [], { environment, cwd: projectRoot, label: "production build" });

  const testDirectory = join(projectRoot, "tests");
  const testFiles = (await readdir(testDirectory))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => join(testDirectory, name));
  if (testFiles.length === 0) throw new Error("No test files were found.");

  const pgliteTestFiles = testFiles.filter((file) => PGLITE_TEST_NAMES.has(basename(file)));
  if (pgliteTestFiles.length !== PGLITE_TEST_NAMES.size) {
    throw new Error("The bounded PGlite test set is incomplete.");
  }
  const regularTestFiles = testFiles.filter((file) => !PGLITE_TEST_NAMES.has(basename(file)));

  await runProcess(process.execPath, [
    "--import",
    new URL("./lib/register-cloudflare-node-shim.mjs", import.meta.url).href,
    "--test",
    "--test-concurrency=1",
    ...regularTestFiles,
  ], {
    environment,
    cwd: projectRoot,
    label: "regular Node test suite",
  });

  // PGlite embeds PostgreSQL as WebAssembly. Running each database suite in its
  // own process with bounded baseline compilation avoids V8 native Zone OOM on
  // constrained Windows hosts without skipping or changing any test assertion.
  for (const testFile of pgliteTestFiles) {
    await runProcess(process.execPath, [
      ...PGLITE_WASM_FLAGS,
      "--import",
      new URL("./lib/register-cloudflare-node-shim.mjs", import.meta.url).href,
      testFile,
    ], {
      environment,
      cwd: projectRoot,
      label: `PGlite test suite ${basename(testFile)}`,
    });
  }
}

main().catch(reportFailure);
