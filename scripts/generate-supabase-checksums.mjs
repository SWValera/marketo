import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const supabaseRoot = resolve(root, "supabase");
const migrationNames = (await readdir(resolve(supabaseRoot, "migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => `migrations/${name}`);
const seedNames = (await readdir(resolve(supabaseRoot, "seeds")))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => `seeds/${name}`);

const lines = [];
for (const name of [...migrationNames, ...seedNames]) {
  const bytes = await readFile(resolve(supabaseRoot, name));
  const digest = createHash("sha256").update(bytes).digest("hex");
  lines.push(`${digest}  ${name}`);
}

await writeFile(resolve(supabaseRoot, "CHECKSUMS.sha256"), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`Wrote supabase/CHECKSUMS.sha256 for ${lines.length} reviewed SQL files.\n`);

