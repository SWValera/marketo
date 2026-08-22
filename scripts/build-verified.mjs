import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSitesEnvironment,
  parseDuration,
  projectRoot,
  reportFailure,
  runLocalBin,
} from "./lib/sites-runtime.mjs";
import { validateArtifact } from "./validate-artifact.mjs";

export async function buildVerified() {
  const { environment } = createSitesEnvironment();
  const timeoutMilliseconds = parseDuration(environment.SITES_BUILD_TIMEOUT, 180_000);
  const killAfterMilliseconds = parseDuration(environment.SITES_BUILD_KILL_AFTER, 10_000);

  console.log("Running bounded vinext build...");
  for (const generatedDirectory of [join(projectRoot, "dist"), join(projectRoot, ".vinext")]) {
    await rm(generatedDirectory, { recursive: true, force: true });
  }

  await runLocalBin("vinext", "vinext", ["build"], {
    environment,
    cwd: projectRoot,
    timeoutMilliseconds,
    killAfterMilliseconds,
    label: "vinext build",
  });
  await validateArtifact(environment);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) buildVerified().catch(reportFailure);
