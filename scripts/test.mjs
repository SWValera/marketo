import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createSitesEnvironment, projectRoot, reportFailure, runNodeScript, runProcess } from "./lib/sites-runtime.mjs";

async function main() {
  const { environment } = createSitesEnvironment();
  // Production bundles may inline NEXT_PUBLIC_* values at build time. Tests use a
  // deterministic public-only Supabase endpoint that rendered-html.test.mjs mocks,
  // so a developer's .env.local can never make the suite depend on live data.
  environment.NEXT_PUBLIC_SUPABASE_URL = "https://reference-test.supabase.co";
  environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_reference_test";
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

  await runProcess(process.execPath, [
    "--import",
    new URL("./lib/register-cloudflare-node-shim.mjs", import.meta.url).href,
    "--test",
    "--test-concurrency=1",
    ...testFiles,
  ], {
    environment,
    cwd: projectRoot,
    label: "Node test suite",
  });
}

main().catch(reportFailure);
