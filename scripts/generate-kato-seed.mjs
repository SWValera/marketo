import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [, , inputArg, outputArg = "supabase/seeds/002_kato_settlements.sql"] = process.argv;
if (!inputArg) {
  throw new Error("Usage: node scripts/generate-kato-seed.mjs <reviewed-kato.json> [output.sql]");
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const rows = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(rows) || rows.length === 0) throw new Error("KATO input must be a non-empty JSON array.");

const allowedKinds = new Set(["city", "town", "urban_settlement", "village", "district", "city_district", "other"]);
const byCode = new Map();
for (const [index, row] of rows.entries()) {
  for (const key of ["katoCode", "regionCode", "slug", "nameRu", "nameKk", "kind"]) {
    if (typeof row[key] !== "string" || !row[key].trim()) throw new Error(`Row ${index}: ${key} is required.`);
  }
  if (!/^\d{2,20}$/.test(row.katoCode)) throw new Error(`Row ${index}: invalid katoCode.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) throw new Error(`Row ${index}: invalid reviewed slug.`);
  if (!allowedKinds.has(row.kind)) throw new Error(`Row ${index}: invalid kind.`);
  if (byCode.has(row.katoCode)) throw new Error(`Duplicate KATO code ${row.katoCode}.`);
  byCode.set(row.katoCode, row);
}

for (const row of rows) {
  if (row.parentKatoCode && !byCode.has(row.parentKatoCode)) {
    throw new Error(`Missing parent ${row.parentKatoCode} for ${row.katoCode}.`);
  }
  if (row.parentKatoCode && byCode.get(row.parentKatoCode).regionCode !== row.regionCode) {
    throw new Error(`Cross-region parent for ${row.katoCode}.`);
  }
}

const pending = new Map(byCode);
const ordered = [];
while (pending.size) {
  const before = pending.size;
  for (const [code, row] of pending) {
    if (!row.parentKatoCode || ordered.some((item) => item.katoCode === row.parentKatoCode)) {
      ordered.push(row);
      pending.delete(code);
    }
  }
  if (pending.size === before) throw new Error("KATO input contains a hierarchy cycle.");
}

const q = (value) => value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const sql = [
  "-- Generated from a separately reviewed normalized KATO export.",
  "-- Do not apply before validating counts and spot-checking RU/KK names.",
  "begin;",
];
for (const row of ordered) {
  sql.push(`
insert into public.settlements (
  region_id, parent_id, kato_code, slug, name_ru, name_kk, kind,
  is_selectable, is_active, sort_order, source_updated_at
)
values (
  (
    select region_row.id
    from public.regions as region_row
    join public.countries as country on country.id = region_row.country_id
    where country.code = 'KZ' and region_row.code = ${q(row.regionCode)}
  ),
  ${row.parentKatoCode ? `(select id from public.settlements where kato_code = ${q(row.parentKatoCode)})` : "null"},
  ${q(row.katoCode)}, ${q(row.slug)}, ${q(row.nameRu)}, ${q(row.nameKk)}, ${q(row.kind)},
  ${row.isSelectable === false ? "false" : "true"}, ${row.isActive === false ? "false" : "true"},
  ${Number.isInteger(row.sortOrder) && row.sortOrder >= 0 ? row.sortOrder : 0},
  ${q(row.sourceUpdatedAt ?? null)}::date
)
on conflict (kato_code) do update set
  region_id = excluded.region_id,
  parent_id = excluded.parent_id,
  slug = excluded.slug,
  name_ru = excluded.name_ru,
  name_kk = excluded.name_kk,
  kind = excluded.kind,
  is_selectable = excluded.is_selectable,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  source_updated_at = excluded.source_updated_at;
`);
}
sql.push("commit;", "");
await writeFile(outputPath, sql.join("\n"), "utf8");
process.stdout.write(`Generated ${outputPath} with ${ordered.length} reviewed KATO nodes.\n`);
