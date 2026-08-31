import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSitesEnvironment, reportFailure } from "./lib/sites-runtime.mjs";
import "./lib/register-cloudflare-node-shim.mjs";

async function isFile(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function validateArtifact(environment = createSitesEnvironment().environment) {
  const root = environment.SITES_PROJECT_ROOT;
  const workerPath = join(root, "dist", "server", "index.js");
  const hostingPath = join(root, "dist", ".openai", "hosting.json");
  const sourceHostingPath = join(root, ".openai", "hosting.json");
  const hasSourceHosting = await isFile(sourceHostingPath);

  if (!(await isFile(workerPath))) {
    const error = new Error("Missing Sites Worker entry: dist/server/index.js");
    error.exitCode = 66;
    throw error;
  }
  if (hasSourceHosting && !(await isFile(hostingPath))) {
    const error = new Error("Missing packaged Sites manifest: dist/.openai/hosting.json");
    error.exitCode = 66;
    throw error;
  }
  if (await isFile(hostingPath)) JSON.parse(await readFile(hostingPath, "utf8"));

  const workerUrl = pathToFileURL(resolve(workerPath));
  workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
  const worker = await import(workerUrl.href);
  if (!worker.default || typeof worker.default.fetch !== "function") {
    throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
  }

  if (hasSourceHosting) {
    console.log("Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.");
  } else {
    console.log("Validated distributable artifact: ESM Worker default.fetch is present (internal Sites manifest intentionally absent).");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateArtifact().catch(reportFailure);
}
