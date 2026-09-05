import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { prepareNodeRuntimeEnvironment } from "../scripts/lib/node-runtime.mjs";
import { CATEGORY_REFERENCE_VERSION } from "../lib/reference-data/release.ts";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const generatorEnvironment = prepareNodeRuntimeEnvironment(process.env);

async function fileFingerprint(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { size: (await stat(path)).size, sha256: hash.digest("hex") };
}

async function scanTextFile(path, { includes = [], excludes = [] }) {
  const matches = new Set();
  const longestNeedle = Math.max(1, ...includes.map((value) => value.length), ...excludes.map((value) => value.length));
  let tail = "";
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    const window = tail + chunk;
    for (const expected of includes) {
      if (window.includes(expected)) matches.add(expected);
    }
    for (const forbidden of excludes) {
      assert.equal(window.includes(forbidden), false, `generated file must not contain: ${forbidden}`);
    }
    tail = window.slice(-(longestNeedle - 1));
  }
  for (const expected of includes) {
    assert.equal(matches.has(expected), true, `generated file must contain: ${expected}`);
  }
}

test("reference seed and catalog data release generators are protected and byte-reproducible", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "marketo-generators-"));
  const generatedSeedPath = join(temporaryDirectory, "001_marketo_reference.sql");
  const generatedCatalogReleasePath = join(temporaryDirectory, "catalog-release.sql");
  const regeneratedCatalogReleasePath = join(temporaryDirectory, "catalog-release-regenerated.sql");
  const catalogCandidatePath = join(temporaryDirectory, "next-master-catalog.candidate.sql");
  const catalogReleaseId = CATEGORY_REFERENCE_VERSION;
  const releasedMigrationUrl = new URL("supabase/migrations/0017_master_catalog.sql", root);
  const releasedCompletenessUrl = new URL("supabase/migrations/0024_catalog_completeness.sql", root);

  try {
    const releasedMigrationBefore = await fileFingerprint(releasedMigrationUrl);
    const releasedCompletenessBefore = await fileFingerprint(releasedCompletenessUrl);
    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-reference-seeds.mjs", root)),
      "--output",
      generatedSeedPath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    assert.deepEqual(
      await fileFingerprint(generatedSeedPath),
      await fileFingerprint(new URL("supabase/seeds/001_marketo_reference.sql", root)),
      "reference seed generator output must be byte-identical",
    );

    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
      "--release-id",
      catalogReleaseId,
      "--output",
      generatedCatalogReleasePath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
      "--release-id",
      catalogReleaseId,
      "--output",
      regeneratedCatalogReleasePath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    assert.deepEqual(
      await fileFingerprint(generatedCatalogReleasePath),
      await fileFingerprint(regeneratedCatalogReleasePath),
      "the same catalog release id and source must generate byte-identical SQL",
    );
    const generatedCatalogReleaseBeforeOverwriteAttempt = await fileFingerprint(generatedCatalogReleasePath);
    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
        "--release-id",
        catalogReleaseId,
        "--output",
        generatedCatalogReleasePath,
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /Refusing to overwrite existing catalog data release/,
    );
    assert.deepEqual(
      await fileFingerprint(generatedCatalogReleasePath),
      generatedCatalogReleaseBeforeOverwriteAttempt,
      "an existing catalog release artifact must remain byte-identical",
    );
    await scanTextFile(generatedCatalogReleasePath, {
      includes: [
        `Marketo catalog data release: ${catalogReleaseId}.`,
        "versioned reference-data synchronization,",
        "not a schema migration",
        "set local lock_timeout = '5s'",
        "set local statement_timeout = '15min'",
        "insert into public.categories (",
        "requires migration 0027 before applying conditional catalog data",
        "requires the reviewed requiredWhen-aware submit_listing contract from migration 0027",
        "86357b7d7fd5d43a17f7182e40009406",
        "refuses to deactivate a category referenced by a listing",
        "refuses to deactivate obsolete category metadata referenced by a listing",
        "target tree would make a referenced listing category non-leaf",
        "conditional requirement would invalidate an existing listing",
        "nullif(btrim(value.text_value), '') is not null",
        "Soft-deactivate every option absent from the complete managed snapshot",
        "left an obsolete category active",
      ],
      excludes: [
        "create or replace function private.validate_listing_leaf_category",
        "marketo_catalog_0024",
      ],
    });

    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
        "--output",
        generatedCatalogReleasePath,
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /--release-id is required/,
    );
    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
        "--release-id",
        `${CATEGORY_REFERENCE_VERSION}-mismatch`,
        "--output",
        join(temporaryDirectory, "mismatched-release.sql"),
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /must match CATEGORY_REFERENCE_VERSION/,
    );
    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
        "--release-id",
        "x".repeat(29),
        "--output",
        join(temporaryDirectory, "too-long-release.sql"),
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /must be 1-28 characters/,
    );
    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-catalog-completeness-migration.mjs", root)),
        "--release-id",
        catalogReleaseId,
        "--output",
        fileURLToPath(releasedCompletenessUrl),
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /Refusing to write a catalog data release under supabase\/migrations/,
    );
    assert.deepEqual(await fileFingerprint(releasedCompletenessUrl), releasedCompletenessBefore);

    await execFileAsync(process.execPath, [
      fileURLToPath(new URL("scripts/generate-category-normalization.mjs", root)),
      "--output",
      catalogCandidatePath,
    ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment });
    assert.deepEqual(await fileFingerprint(releasedMigrationUrl), releasedMigrationBefore);
    await scanTextFile(catalogCandidatePath, {
      includes: ["CANDIDATE ONLY", "Never replace released migration 0017"],
    });

    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL("scripts/generate-category-normalization.mjs", root)),
        "--output",
        fileURLToPath(new URL("supabase/migrations/0017_master_catalog.sql", root)),
      ], { cwd: fileURLToPath(new URL(".", root)), env: generatorEnvironment }),
      /Refusing to overwrite a released migration/,
    );
    assert.deepEqual(await fileFingerprint(releasedMigrationUrl), releasedMigrationBefore);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
