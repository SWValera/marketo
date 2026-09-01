import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const databaseDirectories = new WeakMap();
const temporaryRoot = resolve(tmpdir());

export async function createPGliteTestDatabase(options) {
  const directory = await mkdtemp(join(temporaryRoot, "marketo-pglite-"));
  try {
    const database = new PGlite(directory, options);
    databaseDirectories.set(database, directory);
    return database;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function closePGliteTestDatabase(database) {
  const directory = databaseDirectories.get(database);
  if (!directory) throw new Error("Unknown PGlite test database.");

  const resolvedDirectory = resolve(directory);
  const isSafeTemporaryDirectory =
    resolvedDirectory.toLowerCase().startsWith(`${temporaryRoot.toLowerCase()}${sep}`) &&
    basename(resolvedDirectory).startsWith("marketo-pglite-");
  if (!isSafeTemporaryDirectory) throw new Error("Refusing to remove an unsafe PGlite test directory.");

  try {
    await database.close();
  } finally {
    databaseDirectories.delete(database);
    await rm(resolvedDirectory, { recursive: true, force: true });
  }
}
