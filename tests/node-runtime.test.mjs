import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  MINIMUM_SUPPORTED_NODE_VERSION,
  NATIVE_TYPESCRIPT_STRIP_FLAG,
  prepareNodeRuntimeEnvironment,
} from "../scripts/lib/node-runtime.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);

test("shared Node runtime enables native TypeScript imports with an empty NODE_OPTIONS", async () => {
  assert.equal(MINIMUM_SUPPORTED_NODE_VERSION, "22.13.0");
  const environment = prepareNodeRuntimeEnvironment({ ...process.env, NODE_OPTIONS: "" });
  assert.equal(environment.NODE_OPTIONS, NATIVE_TYPESCRIPT_STRIP_FLAG);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "marketo-node-runtime-"));
  const modulePath = join(temporaryDirectory, "native-strip-probe.ts");
  try {
    await writeFile(modulePath, "export const answer: number = 42;\n", "utf8");
    const result = await execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      `const { answer } = await import(${JSON.stringify(pathToFileURL(modulePath).href)}); process.stdout.write(String(answer));`,
    ], { env: environment });
    assert.equal(result.stdout, "42");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("shared Node runtime preserves options, removes an explicit disable, and stays idempotent", () => {
  const environment = prepareNodeRuntimeEnvironment({
    NODE_OPTIONS: "--max-old-space-size=2048 --no-experimental-strip-types",
  });
  assert.equal(environment.NODE_OPTIONS, `--max-old-space-size=2048 ${NATIVE_TYPESCRIPT_STRIP_FLAG}`);
  assert.deepEqual(prepareNodeRuntimeEnvironment(environment), environment);
});

test("all official TypeScript-importing commands use the shared runtime wrapper", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  for (const command of ["validate:catalog", "seed:reference", "category:migration", "category:coverage", "test"]) {
    assert.match(packageJson.scripts[command], /^node scripts\/run-with-sites-env\.mjs --node /, command);
  }
});
