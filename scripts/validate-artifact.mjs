import { access, readFile, readdir } from "node:fs/promises";
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

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function artifactError(message) {
  const error = new Error(message);
  error.exitCode = 66;
  return error;
}

export async function validateArtifact(environment = createSitesEnvironment().environment) {
  const root = environment.SITES_PROJECT_ROOT;
  const workerPath = join(root, "dist", "server", "index.js");
  const workerConfigPath = join(root, "dist", "server", "wrangler.json");
  const clientPath = join(root, "dist", "client");
  const clientManifestPath = join(clientPath, ".vite", "manifest.json");
  const webManifestPath = join(clientPath, "manifest.webmanifest");
  const serviceWorkerPath = join(clientPath, "sw.js");
  const hostingPath = join(root, "dist", ".openai", "hosting.json");
  const sourceHostingPath = join(root, ".openai", "hosting.json");
  const hasSourceHosting = await isFile(sourceHostingPath);

  if (!(await isFile(workerPath))) {
    throw artifactError("Missing Sites Worker entry: dist/server/index.js");
  }
  if (hasSourceHosting && !(await isFile(hostingPath))) {
    throw artifactError("Missing packaged Sites manifest: dist/.openai/hosting.json");
  }
  for (const [path, label] of [
    [workerConfigPath, "generated Worker configuration"],
    [clientManifestPath, "client Vite manifest"],
    [webManifestPath, "web app manifest"],
    [serviceWorkerPath, "service worker"],
  ]) {
    if (!(await isFile(path))) throw artifactError(`Missing ${label}: ${path.slice(root.length + 1)}`);
  }

  const sourceHosting = hasSourceHosting ? JSON.parse(await readFile(sourceHostingPath, "utf8")) : null;
  const packagedHosting = await isFile(hostingPath) ? JSON.parse(await readFile(hostingPath, "utf8")) : null;
  if (sourceHosting && JSON.stringify(packagedHosting) !== JSON.stringify(sourceHosting)) {
    throw artifactError("Packaged Sites manifest differs from .openai/hosting.json.");
  }

  const clientManifest = JSON.parse(await readFile(clientManifestPath, "utf8"));
  if (!clientManifest || typeof clientManifest !== "object" || Object.keys(clientManifest).length === 0) {
    throw artifactError("Client Vite manifest is empty.");
  }
  JSON.parse(await readFile(webManifestPath, "utf8"));

  const workerConfig = JSON.parse(await readFile(workerConfigPath, "utf8"));
  if (workerConfig.main !== "index.js" || workerConfig.assets?.binding !== "ASSETS" || workerConfig.assets?.directory !== "../client") {
    throw artifactError("Generated Worker configuration has an invalid entry or assets binding.");
  }
  if (workerConfig.images !== undefined) {
    throw artifactError("Generated Worker configuration must not depend on a Cloudflare Images binding.");
  }
  if (sourceHosting?.r2) {
    const bindings = (workerConfig.r2_buckets ?? []).filter((item) => item?.binding === sourceHosting.r2);
    if (bindings.length !== 1 || typeof bindings[0]?.bucket_name !== "string" || !bindings[0].bucket_name.trim()) {
      throw artifactError(`Generated Worker configuration must contain exactly one ${sourceHosting.r2} R2 binding.`);
    }
  }

  const clientFiles = await listFiles(clientPath);
  if (!clientFiles.some((path) => /[\\/]assets[\\/].+\.js$/i.test(path))
    || !clientFiles.some((path) => /[\\/]assets[\\/].+\.css$/i.test(path))) {
    throw artifactError("Client artifact must contain JavaScript and CSS assets.");
  }
  const serverOnlyMarkers = /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY|sb_secret_[A-Za-z0-9_-]{12,}/;
  for (const path of clientFiles.filter((item) => /\.(?:js|css|html|json|webmanifest)$/i.test(item))) {
    if (serverOnlyMarkers.test(await readFile(path, "utf8"))) {
      throw artifactError(`Server-only credential marker found in client artifact: ${path.slice(clientPath.length + 1)}`);
    }
  }

  const workerUrl = pathToFileURL(resolve(workerPath));
  workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
  const worker = await import(workerUrl.href);
  if (!worker.default || typeof worker.default.fetch !== "function") {
    throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
  }

  if (hasSourceHosting) {
    console.log("Validated Sites artifact: server, client, manifests, bindings and browser-secret scan passed.");
  } else {
    console.log("Validated distributable artifact: ESM Worker default.fetch is present (internal Sites manifest intentionally absent).");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateArtifact().catch(reportFailure);
}
