import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationDir = resolve(root, "supabase/migrations");
const expectedMigrations = [
  "0001_extensions_and_helpers.sql",
  "0002_geography.sql",
  "0003_profiles_and_roles.sql",
  "0004_categories_and_attributes.sql",
  "0005_listings.sql",
  "0006_favorites.sql",
  "0007_chat.sql",
  "0008_notifications.sql",
  "0009_reports_moderation_and_audit.sql",
  "0010_rls_and_grants.sql",
  "0011_indexes_and_search.sql",
  "0012_realtime.sql",
];

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
check(JSON.stringify(files) === JSON.stringify(expectedMigrations), "Migration filenames/order do not match the reviewed sequence.");

const migrations = new Map();
for (const file of files) migrations.set(file, await readFile(resolve(migrationDir, file), "utf8"));
const allSql = [...migrations.values()].join("\n");
for (const [file, sql] of migrations) {
  check(/^\s*--[\s\S]*?\bbegin;/i.test(sql), `${file} must start a transaction.`);
  check(/commit;\s*$/i.test(sql), `${file} must commit its transaction.`);
}

const createdTables = [...allSql.matchAll(/create table public\.([a-z_]+)/gi)].map((match) => match[1]);
const rlsSql = migrations.get("0010_rls_and_grants.sql") ?? "";
const rlsTables = [...rlsSql.matchAll(/alter table public\.([a-z_]+) enable row level security/gi)].map((match) => match[1]);
check(new Set(createdTables).size === createdTables.length, "A public table is created more than once.");
check(
  JSON.stringify([...new Set(createdTables)].sort()) === JSON.stringify([...new Set(rlsTables)].sort()),
  "Every public table must have RLS enabled exactly in the reviewed policy migration.",
);
check(!/\b(?:using|with check)\s*\(\s*true\s*\)/i.test(rlsSql), "Unrestricted RLS policy found.");

for (const match of allSql.matchAll(/security definer/gi)) {
  const nearby = allSql.slice(match.index, match.index + 220);
  check(/set search_path\s*=\s*''/i.test(nearby), `SECURITY DEFINER near offset ${match.index} has no empty search_path.`);
}
check(/grant select \(id, display_name, avatar_path, bio, settlement_id, verified_at, created_at\)[\s\S]*?to anon, authenticated;/i.test(rlsSql), "Authenticated public profile access must remain column-limited.");
check(!/grant select on table[\s\S]{0,500}public\.profiles[\s\S]{0,500}to authenticated;/i.test(rlsSql), "Authenticated role has table-wide profile SELECT access.");
check(!/grant select on table[\s\S]{0,500}public\.profile_private[\s\S]{0,80}to anon;/i.test(rlsSql), "Private profile data is exposed to anon.");
check(/get_my_profile\(\)/.test(allSql), "Self-profile RPC is missing.");
check(/get_profile_for_staff\(target_profile_id uuid\)/.test(allSql), "Staff profile RPC is missing.");
check(/message_type = 'text'/.test(rlsSql), "Direct authenticated chat inserts must be text-only.");
check(!/grant\s+(?:insert|update|delete)[\s\S]{0,240}on public\.listing_images to authenticated/i.test(rlsSql), "Browser role can mutate unverified R2 image metadata.");
check(!/create policy listing_images_owner_(?:insert|update|delete)/i.test(rlsSql), "R2 image metadata has a client mutation policy.");
for (const table of ["listing_attribute_values", "listing_attribute_option_values", "listing_images"]) {
  const escaped = table.replaceAll("_", "_");
  check(
    new RegExp(`create policy [a-z_]+_anon_active_read[\\s\\S]{0,900}on public\\.${escaped}[\\s\\S]{0,900}listings\\.status = 'active'[\\s\\S]{0,500}listings\\.deleted_at is null`, "i").test(rlsSql),
    `${table} has no explicit active-parent anonymous SELECT policy.`,
  );
  check(
    new RegExp(`create policy [a-z_]+_authenticated_read[\\s\\S]{0,1500}on public\\.${escaped}[\\s\\S]{0,1500}listings\\.owner_id = \\(select auth\\.uid\\(\\)\\)`, "i").test(rlsSql),
    `${table} has no explicit owner-aware authenticated SELECT policy.`,
  );
}

const moderationSql = migrations.get("0009_reports_moderation_and_audit.sql") ?? "";
for (const transition of [
  "decision = 'approve' and old_status = 'pending'",
  "decision = 'reject' and old_status = 'pending'",
  "decision = 'hide' and old_status = 'active'",
  "decision = 'restore' and old_status = 'archived'",
]) check(moderationSql.includes(transition), `Moderation transition is missing: ${transition}.`);
check(/next_status is null[\s\S]{0,240}not allowed/i.test(moderationSql), "Moderation function does not reject an invalid transition.");

const profileSql = migrations.get("0003_profiles_and_roles.sql") ?? "";
check((profileSql.match(/on conflict \((?:id|user_id)\) do nothing/gi) ?? []).length >= 2, "Auth profile trigger is not idempotent for both profile tables.");
check(!/raw_user_meta_data\s*->>\s*'(?:status|role|verified_at|is_verified|admin)'/i.test(profileSql), "Auth signup metadata can influence a protected profile field.");

const seed = await readFile(resolve(root, "supabase/seeds/001_marketo_reference.sql"), "utf8");
check(/Contains no users, listings, chats/.test(seed), "Reference seed provenance header is missing.");
check(/initial Marketo reference taxonomy/i.test(seed), "Reference seed must identify the category taxonomy as initial/reviewable.");
check(/90-city bootstrap/i.test(seed), "Reference seed must identify geography as a 90-city bootstrap.");
check(!/insert into public\.(?:profiles|profile_private|listings|favorites|conversations|messages|notifications|reports)\b/i.test(seed), "Reference seed contains product/user data.");
check((seed.match(/insert into public\.categories \(/g) ?? []).length === 228, "Reference seed category count drifted from the frontend contract.");
check((seed.match(/insert into public\.settlements \(/g) ?? []).length === 90, "Reviewed city baseline must contain exactly 90 cities.");

const drizzleConfig = await readFile(resolve(root, "drizzle.config.ts"), "utf8");
const databaseTypes = await readFile(resolve(root, "lib/supabase/database.types.ts"), "utf8");
check(/dialect:\s*"postgresql"/.test(drizzleConfig), "Drizzle is not configured for PostgreSQL.");
check(!/dialect:\s*"sqlite"/.test(drizzleConfig), "Legacy SQLite/D1 Drizzle config remains active.");
check(/dbColumnNames:\s*true/.test(databaseTypes), "PostgREST types must use database column names.");

const wrangler = await readFile(resolve(root, "wrangler.jsonc"), "utf8");
const vite = await readFile(resolve(root, "vite.config.ts"), "utf8");
check((wrangler.match(/nodejs_compat/g) ?? []).length === 1, "wrangler.jsonc must contain one nodejs_compat flag.");
check(!/nodejs_compat|compatibility_flags/.test(vite), "vite.config.ts duplicates Cloudflare compatibility flags.");
check(!/d1_databases|D1Database/.test(vite), "Legacy D1 binding remains in the active Vite runtime.");

const browserFiles = [
  "lib/supabase/browser.ts",
  "lib/supabase/public-env.ts",
].map((file) => [file, null]);
for (const item of browserFiles) item[1] = await readFile(resolve(root, item[0]), "utf8");
for (const [file, source] of browserFiles) {
  check(!/SERVICE_ROLE|SECRET_KEY|DATABASE_URL|POSTGRES_PASSWORD/.test(source), `${file} references a server secret.`);
}
for (const directory of ["app", "components"]) {
  const names = await readdir(resolve(root, directory), { recursive: true });
  for (const name of names.filter((item) => /\.(?:ts|tsx)$/.test(item))) {
    const file = `${directory}/${name}`;
    const source = await readFile(resolve(root, file), "utf8");
    check(!/@\/lib\/(?:catalog-config|geography)/.test(source), `${file} still imports a seed-only reference module.`);
  }
}
for (const file of [
  "lib/reference-data/server.ts",
  "lib/data/supabase/geography.ts",
  "lib/data/supabase/categories.ts",
  "app/api/reference/categories/[id]/attributes/route.ts",
]) {
  const source = await readFile(resolve(root, file), "utf8");
  check(!/SERVICE_ROLE|SUPABASE_SECRET_KEY|createSupabaseAdminClient/.test(source), `${file} references an elevated Supabase client.`);
}
for (const directory of ["app", "components", "lib"]) {
  const names = await readdir(resolve(root, directory), { recursive: true });
  for (const name of names.filter((item) => /\.(?:ts|tsx)$/.test(item))) {
    const file = `${directory}/${name}`;
    const source = await readFile(resolve(root, file), "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    check(!/lib\/supabase\/(?:admin|server|server-env)/.test(source), `${file} imports a server Supabase module.`);
    check(!/SERVICE_ROLE|SUPABASE_SECRET_KEY|DATABASE_URL|POSTGRES_PASSWORD/.test(source), `${file} references a server credential name.`);
  }
}

const credentialPatterns = [
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const ignoredSourceSegments = new Set([".git", ".next", ".sites-runtime", ".vinext", ".wrangler", "dist", "node_modules"]);
const sourceNames = (await readdir(root, { recursive: true }))
  .filter((name) => !name.split("/").some((segment) => ignoredSourceSegments.has(segment)))
  .filter((name) => /(?:^|\/)(?:\.env\.example|[^/]+\.(?:ts|tsx|js|mjs|cjs|json|jsonc|sql|md|sh|yml|yaml))$/.test(name));
for (const name of sourceNames) {
  const source = await readFile(resolve(root, name), "utf8").catch(() => "");
  check(!credentialPatterns.some((pattern) => pattern.test(source)), `${name} contains a credential-like value.`);
}
const envExample = await readFile(resolve(root, ".env.example"), "utf8").catch(() => "");
check(Boolean(envExample), ".env.example is missing.");
check(!/^NEXT_PUBLIC_.*(?:SERVICE|SECRET|DATABASE|PASSWORD)/m.test(envExample), "A secret-like variable is marked NEXT_PUBLIC.");
check(!/sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(envExample), ".env.example contains a value that resembles a real credential.");

const checksumFile = await readFile(resolve(root, "supabase/CHECKSUMS.sha256"), "utf8").catch(() => "");
const checksumEntries = checksumFile.trim().split("\n").filter(Boolean);
const reviewedSqlPaths = [
  ...files.map((name) => `migrations/${name}`),
  ...(await readdir(resolve(root, "supabase/seeds"))).filter((name) => name.endsWith(".sql")).sort().map((name) => `seeds/${name}`),
];
check(checksumEntries.length === reviewedSqlPaths.length, "Supabase SQL checksum manifest is missing or incomplete.");
for (const relativePath of reviewedSqlPaths) {
  const bytes = await readFile(resolve(root, "supabase", relativePath));
  const expected = createHash("sha256").update(bytes).digest("hex");
  check(checksumEntries.includes(`${expected}  ${relativePath}`), `Checksum mismatch for supabase/${relativePath}.`);
}

if (failures.length) {
  process.stderr.write(`Supabase foundation validation failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Supabase foundation validation passed: ${createdTables.length} RLS tables, ${files.length} migrations, deterministic reference seed.\n`);
}
