import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { prepareNodeRuntimeEnvironment } from "../scripts/lib/node-runtime.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const generatorEnvironment = prepareNodeRuntimeEnvironment(process.env);

test("reference seed and catalog completeness migration are byte-reproducible", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "marketo-generators-"));
  const generatedSeedPath = join(temporaryDirectory, "001_marketo_reference.sql");
  const generatedCompletenessPath = join(temporaryDirectory, "0024_catalog_completeness.sql");
  const catalogCandidatePath = join(temporaryDirectory, "next-master-catalog.candidate.sql");
  const releasedMigrationUrl = new URL("supabase/migrations/0017_master_catalog.sql", root);
  const releasedCompletenessUrl = new URL("supabase/migrations/0024_catalog_completeness.sql", root);

  try {
    const releasedMigrationBefore = await readFile(releasedMigrationUrl);
    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-reference-seeds.mjs", root)),
      "--output",
      generatedSeedPath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    assert.deepEqual(
      await readFile(generatedSeedPath),
      await readFile(new URL("supabase/seeds/001_marketo_reference.sql", root)),
      "reference seed generator output must be byte-identical",
    );

    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
      "--output",
      generatedCompletenessPath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    assert.deepEqual(
      await readFile(generatedCompletenessPath),
      await readFile(releasedCompletenessUrl),
      "catalog completeness generator output must be byte-identical",
    );

    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-category-normalization.mjs", root)),
      "--output",
      catalogCandidatePath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    assert.deepEqual(await readFile(releasedMigrationUrl), releasedMigrationBefore);
    assert.match(await readFile(catalogCandidatePath, "utf8"), /CANDIDATE ONLY[\s\S]*Never replace released migration 0017/);

    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-category-normalization.mjs", root)),
        "--output",
        fileURLToPath(new URL("supabase/migrations/0017_master_catalog.sql", root)),
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /Refusing to overwrite a released migration/,
    );
    assert.deepEqual(await readFile(releasedMigrationUrl), releasedMigrationBefore);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
