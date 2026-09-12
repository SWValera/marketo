// A data release may change a stable attribute type only with an explicit,
// reviewed plan. Unknown values abort the enclosing transaction; no guessing.
const quote = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const invariant = (condition, message) => { if (!condition) throw new Error(message); };

export function catalogTypeTransformSql(plan, attributes, options) {
  invariant(Array.isArray(plan), "Catalog type transform plan must be an array");
  const seen = new Set();
  const rows = [], aliases = [];
  for (const transform of plan) {
    const {category, key, from, to, values = []} = transform;
    const identity = `${category}.${key}`;
    invariant(!seen.has(identity), `Duplicate type transform: ${identity}`);
    seen.add(identity);
    invariant(["text", "number"].includes(from) && ["select", "multiselect"].includes(to), `Unsupported type transform: ${identity}`);
    const target = attributes.find(a => a.categorySlug === category && a.key === key);
    invariant(target?.dataType === to, `Type transform target mismatch: ${identity}`);
    invariant(Array.isArray(values), `Invalid value mapping: ${identity}`);
    const knownValues = new Set();
    for (const value of values) {
      invariant(from === "text" && typeof value.text === "string" && value.text.length > 0, `Only reviewed exact text mappings are supported: ${identity}`);
      invariant(!knownValues.has(value.text), `Duplicate text mapping: ${identity}`);
      knownValues.add(value.text);
      invariant(Number.isSafeInteger(value.expectedRows) && value.expectedRows > 0, `Missing expected row count: ${identity}`);
      invariant(!target.dependsOnKey && options.some(o => o.categorySlug === category && o.attributeKey === key && o.value === value.option && o.parentValue === null), `Unverified or dependent mapping target: ${identity}`);
      aliases.push({category_slug: category, key, old_text: value.text, target_value: value.option, expected_rows: value.expectedRows});
    }
    rows.push({category_slug: category, key, from_type: from, to_type: to});
  }
  return {
    setup: `
create temporary table marketo_catalog_type_transforms (
  category_slug text not null, key text not null, from_type text not null, to_type text not null,
  primary key (category_slug, key)
) on commit drop;
insert into marketo_catalog_type_transforms
select * from jsonb_to_recordset(${quote(rows)}) as x(category_slug text, key text, from_type text, to_type text);
create temporary table marketo_catalog_type_aliases (
  category_slug text not null, key text not null, old_text text not null,
  target_value text not null, expected_rows integer not null check (expected_rows > 0),
  primary key (category_slug, key, old_text),
  foreign key (category_slug, key) references marketo_catalog_type_transforms(category_slug, key)
) on commit drop;
insert into marketo_catalog_type_aliases
select * from jsonb_to_recordset(${quote(aliases)}) as x(category_slug text, key text, old_text text, target_value text, expected_rows integer);
`,
    preflight: `
do $catalog_type_preflight$
begin
  if exists (
    select 1 from public.category_attributes a
    join public.categories c on c.id = a.category_id
    join marketo_catalog_0024_attributes t on t.category_slug = c.slug and t.key = a.key
    left join marketo_catalog_type_transforms p on p.category_slug = c.slug and p.key = a.key
      and p.from_type = a.data_type and p.to_type = t.data_type
    where a.data_type <> t.data_type and p.key is null
  ) then raise exception 'Catalog type change is not in the reviewed plan'; end if;

  if exists (
    select 1 from marketo_catalog_type_transforms p
    join public.categories c on c.slug = p.category_slug
    join public.category_attributes a on a.category_id = c.id and a.key = p.key
    where a.data_type not in (p.from_type, p.to_type)
  ) then raise exception 'Catalog type transform baseline changed'; end if;

  if exists (
    select 1 from marketo_catalog_type_transforms p
    join public.categories c on c.slug = p.category_slug
    join public.category_attributes a on a.category_id = c.id and a.key = p.key
    join public.listing_attribute_values v on v.attribute_id = a.id
    left join marketo_catalog_type_aliases m on m.category_slug = c.slug and m.key = a.key and m.old_text = v.text_value
    where a.data_type <> p.from_type or m.key is null
      or v.number_value is not null or v.boolean_value is not null or v.date_value is not null
      or v.number_min_value is not null or v.number_max_value is not null
  ) then raise exception 'Catalog type transform found an unreviewed scalar value'; end if;

  if exists (
    select 1 from marketo_catalog_type_aliases m
    join marketo_catalog_type_transforms p using (category_slug, key)
    join public.categories c on c.slug = m.category_slug
    join public.category_attributes a on a.category_id = c.id and a.key = m.key
    where a.data_type = p.from_type and m.expected_rows <> (
      select count(*) from public.listing_attribute_values v where v.attribute_id = a.id and v.text_value = m.old_text
    )
  ) then raise exception 'Catalog type transform affected row count changed'; end if;

  if exists (
    select 1 from marketo_catalog_type_transforms p
    join public.categories c on c.slug = p.category_slug
    join public.category_attributes a on a.category_id = c.id and a.key = p.key and a.data_type = p.from_type
    join public.listing_attribute_option_values v on v.attribute_id = a.id
  ) then raise exception 'Catalog scalar transform already has option values'; end if;
end;
$catalog_type_preflight$;

-- Transaction-local snapshot only; never returned or logged. The operator must
-- separately verify the approved recovery export before applying this release.
create temporary table marketo_catalog_scalar_backfill on commit drop as
select v.*, m.target_value
from marketo_catalog_type_aliases m
join marketo_catalog_type_transforms p using (category_slug, key)
join public.categories c on c.slug = m.category_slug
join public.category_attributes a on a.category_id = c.id and a.key = m.key and a.data_type = p.from_type
join public.listing_attribute_values v on v.attribute_id = a.id and v.text_value = m.old_text;
`,
    backfill: `
do $catalog_scalar_backfill$
declare expected_count bigint; changed_count bigint;
begin
  select count(*) into expected_count from marketo_catalog_scalar_backfill;
  insert into public.listing_attribute_option_values (listing_id, attribute_id, option_id, created_at)
  select s.listing_id, s.attribute_id, o.id, s.created_at
  from marketo_catalog_scalar_backfill s
  join public.category_attribute_options o on o.attribute_id = s.attribute_id and o.value = s.target_value and o.is_active;
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then raise exception 'Catalog scalar backfill target count mismatch'; end if;

  -- Delete only the exact rows whose equivalent option was inserted above.
  -- Any failure rolls back both operations together with the entire release.
  delete from public.listing_attribute_values v
  using marketo_catalog_scalar_backfill s
  where v.listing_id = s.listing_id and v.attribute_id = s.attribute_id
    and v.text_value = s.text_value and v.created_at = s.created_at and v.updated_at = s.updated_at
    and v.number_value is null and v.boolean_value is null and v.date_value is null
    and v.number_min_value is null and v.number_max_value is null
    and exists (
      select 1 from public.listing_attribute_option_values actual
      join public.category_attribute_options o on o.id = actual.option_id and o.attribute_id = actual.attribute_id
      where actual.listing_id = s.listing_id and actual.attribute_id = s.attribute_id
        and o.value = s.target_value and actual.created_at = s.created_at
    );
  get diagnostics changed_count = row_count;
  if changed_count <> expected_count then raise exception 'Catalog scalar backfill source count mismatch'; end if;
end;
$catalog_scalar_backfill$;
`,
    postflight: `
do $catalog_type_postflight$
begin
  if exists (
    select 1 from marketo_catalog_type_transforms p
    join public.categories c on c.slug = p.category_slug
    join public.category_attributes a on a.category_id = c.id and a.key = p.key
    where a.data_type <> p.to_type or exists (
      select 1 from public.listing_attribute_values v where v.attribute_id = a.id
    )
  ) then raise exception 'Catalog type transform postflight mismatch'; end if;
end;
$catalog_type_postflight$;
`
  };
}
