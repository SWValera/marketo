import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { categoryOptions } from "../lib/catalog-config.ts";
import { resolveCategoryAttributeSchema } from "../lib/reference-data/category-attribute-schemas.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputArgumentIndex = process.argv.indexOf("--output");
if (outputArgumentIndex >= 0 && !process.argv[outputArgumentIndex + 1]) {
  throw new Error("--output requires a destination path.");
}
const outputPath = outputArgumentIndex >= 0
  ? resolve(projectRoot, process.argv[outputArgumentIndex + 1])
  : resolve(projectRoot, "supabase/migrations/0024_catalog_completeness.sql");

// These profiles are the reviewed forward-only completeness release. The
// migration manages the full category catalog as one authoritative snapshot;
// this set is retained as a coverage assertion so a declared release profile
// cannot silently disappear from all resolved category assignments.
const changedProfiles = new Set([
  "productCore",
  "goods",
  "goodsBrand",
  "consumableLot",
  "deviceSpecs",
  "tabletDeviceSpecs",
  "videoCamera",
  "actionCamera",
  "projector",
  "vehicleCompliance",
  "passengerCarExchange",
  "motorcycleExchange",
  "propertyDocsUtilities",
  "commercialRentalProperty",
  "houseRenovationCompatible",
  "professionalRequirements",
  "regulatedSafety",
  "motoPart",
  "commercialPart",
  "dismantling",
  "serviceProfessional",
  "smartWatch",
  "computerDeviceSpecs",
  "appliance",
  "energyRatedAppliance",
  "genericAppliance",
  "laundryAppliance",
  "dryingAppliance",
  "refrigeratorAppliance",
  "freezerAppliance",
  "dishwasherAppliance",
  "cookerHobAppliance",
  "ovenAppliance",
  "hoodAppliance",
  "smallKitchenAppliance",
  "microwaveAppliance",
  "vacuumAppliance",
  "climateAppliance",
  "heatingAppliance",
  "airTreatmentAppliance",
  "fanAppliance",
  "waterHeaterAppliance",
  "ironSteamerAppliance",
  "sewingAppliance",
  "hairStylingAppliance",
  "groomingAppliance",
  "skinCareAppliance",
  "toothbrushAppliance",
  "healthAppliance",
  "breastPumpAppliance",
  "sterilizerWarmerAppliance",
  "babyMonitoringAppliance",
  "bookMedia",
  "collectible",
  "outdoorGear",
  "fishingGear",
  "huntingGear",
  "handmadeMaterial",
  "liveAnimalDetails",
  "animalSupply",
  "petConsumable",
  "businessCommercials",
  "rentalGoods",
  "rentalCostumeDecor",
  "rentalStrollerSeat",
  "rentalComputerProjector",
  "rentalSoundLight",
  "rentalSportsTourism",
  "rentalBicycleScooter",
  "rentalEventFurniture",
  "rentalPhotoVideo",
  "rentalGeneratorCompressor",
  "rentalGamingDevice",
  "freeKidsGear",
  "freePhoneComputer",
  "exchangeMobileDevice",
  "exchangePropertyMixed",
  "exchangeGaming",
]);

const q = (value) => value === null || value === undefined
  ? "null"
  : `'${String(value).replaceAll("'", "''")}'`;
const chunks = (rows, size = 250) => Array.from(
  { length: Math.ceil(rows.length / size) },
  (_, index) => rows.slice(index * size, (index + 1) * size),
);
const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

const targetCategories = [];
const attributeRows = [];
const optionRows = [];
const coveredChangedProfiles = new Set();

for (const category of categoryOptions) {
  const resolved = resolveCategoryAttributeSchema(category.slug, category.rootSlug);
  const matchingProfiles = resolved.profileNames.filter((profile) => changedProfiles.has(profile));

  matchingProfiles.forEach((profile) => coveredChangedProfiles.add(profile));
  targetCategories.push({ slug: category.slug, profileNames: resolved.profileNames });

  resolved.attributes.forEach((attribute, attributeIndex) => {
    const sortOrder = (attributeIndex + 1) * 10;
    attributeRows.push({
      categorySlug: category.slug,
      key: attribute.key,
      labelRu: attribute.label.ru,
      labelKk: attribute.label.kk,
      dataType: attribute.dataType,
      unitRu: attribute.unit?.ru ?? null,
      unitKk: attribute.unit?.kk ?? null,
      isRequired: Boolean(attribute.required),
      isFilterable: Boolean(attribute.filterable),
      isSearchable: Boolean(attribute.searchable),
      inheritsToChildren: false,
      validation: attribute.validation ?? {},
      filterMode: attribute.filterMode ?? "exact",
      optionsLoadMode: attribute.optionsLoadMode ?? "eager",
      dependsOnKey: attribute.dependsOnKey ?? null,
      isVisible: true,
      sortOrder,
    });

    (attribute.options ?? []).forEach((option, optionIndex) => optionRows.push({
      categorySlug: category.slug,
      attributeKey: attribute.key,
      value: option.value,
      labelRu: option.label.ru,
      labelKk: option.label.kk,
      parentValue: option.parentValue ?? null,
      sortOrder: (optionIndex + 1) * 10,
    }));
  });
}

invariant(targetCategories.length > 0, "No categories matched the catalog completeness profiles.");
for (const profile of changedProfiles) {
  invariant(coveredChangedProfiles.has(profile), `Changed profile is not assigned to any category: ${profile}`);
}

const categorySlugs = new Set();
for (const category of targetCategories) {
  invariant(!categorySlugs.has(category.slug), `Duplicate target category: ${category.slug}`);
  categorySlugs.add(category.slug);
}

const attributesByCategory = new Map();
for (const attribute of attributeRows) {
  const attributes = attributesByCategory.get(attribute.categorySlug) ?? new Map();
  invariant(!attributes.has(attribute.key), `Duplicate attribute ${attribute.categorySlug}.${attribute.key}`);
  invariant(
    ![...attributes.values()].some((candidate) => candidate.sortOrder === attribute.sortOrder),
    `Duplicate attribute sort order ${attribute.categorySlug}.${attribute.sortOrder}`,
  );
  invariant(attribute.sortOrder >= 0, `Negative attribute sort order ${attribute.categorySlug}.${attribute.key}`);
  attributes.set(attribute.key, attribute);
  attributesByCategory.set(attribute.categorySlug, attributes);
}

const optionsByAttribute = new Map();
for (const option of optionRows) {
  const compositeKey = `${option.categorySlug}\u0000${option.attributeKey}`;
  const options = optionsByAttribute.get(compositeKey) ?? new Map();
  invariant(!options.has(option.value), `Duplicate option ${option.categorySlug}.${option.attributeKey}.${option.value}`);
  invariant(
    ![...options.values()].some((candidate) => candidate.sortOrder === option.sortOrder),
    `Duplicate option sort order ${option.categorySlug}.${option.attributeKey}.${option.sortOrder}`,
  );
  options.set(option.value, option);
  optionsByAttribute.set(compositeKey, options);
}

for (const [categorySlug, attributes] of attributesByCategory) {
  for (const attribute of attributes.values()) {
    if (attribute.dependsOnKey) {
      invariant(attributes.has(attribute.dependsOnKey), `Missing dependency ${categorySlug}.${attribute.dependsOnKey}`);
      const seen = new Set([attribute.key]);
      let nextKey = attribute.dependsOnKey;
      while (nextKey) {
        invariant(!seen.has(nextKey), `Dependency cycle in ${categorySlug} at ${nextKey}`);
        seen.add(nextKey);
        nextKey = attributes.get(nextKey)?.dependsOnKey ?? null;
      }
    }

    const options = optionsByAttribute.get(`${categorySlug}\u0000${attribute.key}`) ?? new Map();
    if (["select", "multiselect"].includes(attribute.dataType)) {
      invariant(options.size > 0, `Select attribute has no options: ${categorySlug}.${attribute.key}`);
    } else {
      invariant(options.size === 0, `Non-select attribute has options: ${categorySlug}.${attribute.key}`);
    }

    for (const option of options.values()) {
      if (option.parentValue === null) continue;
      invariant(attribute.dependsOnKey, `Option has a parent without dependsOnKey: ${categorySlug}.${attribute.key}.${option.value}`);
      const parentOptions = optionsByAttribute.get(`${categorySlug}\u0000${attribute.dependsOnKey}`) ?? new Map();
      invariant(
        parentOptions.has(option.parentValue),
        `Missing parent option ${categorySlug}.${attribute.dependsOnKey}.${option.parentValue}`,
      );
    }
  }
}

const sql = [];
const add = (value) => sql.push(value.trim());

add(`
-- Marketo v1.0 catalog completeness: category-specific seller fields and buyer filters.
-- Generated by scripts/generate-catalog-completeness-migration.mjs from the reviewed
-- runtime catalog source. All catalog categories are managed as one authoritative
-- snapshot. Stable attribute and option keys preserve UUIDs. Obsolete rows are
-- softly deactivated only after proving that no listing references them.
-- Required fields are released in two phases: this migration preserves an existing
-- true requirement, permits an explicit demotion, and keeps every new/past-optional
-- field optional. Promotion requires a later draft audit/backfill migration. The
-- clean-database reference seed remains the canonical required-state snapshot.

begin;

lock table
  public.categories,
  public.category_attributes,
  public.category_attribute_options,
  public.listings,
  public.listing_attribute_values,
  public.listing_attribute_option_values
in share row exclusive mode;

create temporary table marketo_catalog_0024_categories (
  category_slug text primary key
) on commit drop;

create temporary table marketo_catalog_0024_attributes (
  category_slug text not null,
  key text not null,
  label_ru text not null,
  label_kk text not null,
  data_type text not null check (data_type in ('text', 'number', 'boolean', 'select', 'multiselect', 'range', 'date')),
  unit_ru text,
  unit_kk text,
  is_required boolean not null,
  is_filterable boolean not null,
  is_searchable boolean not null,
  inherits_to_children boolean not null,
  validation jsonb not null check (jsonb_typeof(validation) = 'object'),
  filter_mode text not null check (filter_mode in ('exact', 'range', 'search')),
  options_load_mode text not null check (options_load_mode in ('eager', 'deferred')),
  depends_on_key text,
  is_visible boolean not null,
  sort_order integer not null check (sort_order >= 0),
  primary key (category_slug, key),
  unique (category_slug, sort_order),
  foreign key (category_slug) references marketo_catalog_0024_categories(category_slug)
) on commit drop;

create temporary table marketo_catalog_0024_options (
  category_slug text not null,
  attribute_key text not null,
  value text not null,
  label_ru text not null,
  label_kk text not null,
  parent_value text,
  sort_order integer not null check (sort_order >= 0),
  primary key (category_slug, attribute_key, value),
  unique (category_slug, attribute_key, sort_order),
  foreign key (category_slug, attribute_key)
    references marketo_catalog_0024_attributes(category_slug, key)
) on commit drop;
`);

for (const chunk of chunks(targetCategories)) {
  const payload = chunk.map((row) => [row.slug]);
  add(`
insert into marketo_catalog_0024_categories (category_slug)
select payload.value ->> 0
from pg_catalog.jsonb_array_elements(${q(JSON.stringify(payload))}::jsonb) as payload(value);
`);
}

for (const chunk of chunks(attributeRows)) {
  const payload = chunk.map((row) => [
    row.categorySlug,
    row.key,
    row.labelRu,
    row.labelKk,
    row.dataType,
    row.unitRu,
    row.unitKk,
    row.isRequired,
    row.isFilterable,
    row.isSearchable,
    row.inheritsToChildren,
    row.validation,
    row.filterMode,
    row.optionsLoadMode,
    row.dependsOnKey,
    row.isVisible,
    row.sortOrder,
  ]);
  add(`
insert into marketo_catalog_0024_attributes (
  category_slug, key, label_ru, label_kk, data_type, unit_ru, unit_kk,
  is_required, is_filterable, is_searchable, inherits_to_children,
  validation, filter_mode, options_load_mode, depends_on_key, is_visible,
  sort_order
)
select
  payload.value ->> 0,
  payload.value ->> 1,
  payload.value ->> 2,
  payload.value ->> 3,
  payload.value ->> 4,
  payload.value ->> 5,
  payload.value ->> 6,
  (payload.value ->> 7)::boolean,
  (payload.value ->> 8)::boolean,
  (payload.value ->> 9)::boolean,
  (payload.value ->> 10)::boolean,
  payload.value -> 11,
  payload.value ->> 12,
  payload.value ->> 13,
  payload.value ->> 14,
  (payload.value ->> 15)::boolean,
  (payload.value ->> 16)::integer
from pg_catalog.jsonb_array_elements(${q(JSON.stringify(payload))}::jsonb) as payload(value);
`);
}

for (const chunk of chunks(optionRows)) {
  const payload = chunk.map((row) => [
    row.categorySlug,
    row.attributeKey,
    row.value,
    row.labelRu,
    row.labelKk,
    row.parentValue,
    row.sortOrder,
  ]);
  add(`
insert into marketo_catalog_0024_options (
  category_slug, attribute_key, value, label_ru, label_kk, parent_value, sort_order
)
select
  payload.value ->> 0,
  payload.value ->> 1,
  payload.value ->> 2,
  payload.value ->> 3,
  payload.value ->> 4,
  payload.value ->> 5,
  (payload.value ->> 6)::integer
from pg_catalog.jsonb_array_elements(${q(JSON.stringify(payload))}::jsonb) as payload(value);
`);
}

add(`
do $marketo_catalog_0024_preflight$
declare
  actual_count bigint;
begin
  select count(*) into actual_count from marketo_catalog_0024_categories;
  if actual_count <> ${targetCategories.length} then
    raise exception '0024 source category count mismatch: expected ${targetCategories.length}, got %', actual_count;
  end if;

  select count(*) into actual_count from marketo_catalog_0024_attributes;
  if actual_count <> ${attributeRows.length} then
    raise exception '0024 source attribute count mismatch: expected ${attributeRows.length}, got %', actual_count;
  end if;

  select count(*) into actual_count from marketo_catalog_0024_options;
  if actual_count <> ${optionRows.length} then
    raise exception '0024 source option count mismatch: expected ${optionRows.length}, got %', actual_count;
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_categories as target
    left join public.categories as category on category.slug = target.category_slug
    where category.id is null or not category.is_active
  ) then
    raise exception '0024 requires every managed category to exist and be active';
  end if;

  if exists (
    select category_slug, sort_order
    from marketo_catalog_0024_attributes
    group by category_slug, sort_order
    having count(*) > 1
  ) or exists (
    select category_slug, attribute_key, sort_order
    from marketo_catalog_0024_options
    group by category_slug, attribute_key, sort_order
    having count(*) > 1
  ) then
    raise exception '0024 source contains duplicate sort orders';
  end if;

  if exists (
    select attribute.category_id, attribute.sort_order
    from public.category_attributes as attribute
    join public.categories as category on category.id = attribute.category_id
    join marketo_catalog_0024_categories as target on target.category_slug = category.slug
    group by attribute.category_id, attribute.sort_order
    having count(*) > 1
  ) or exists (
    select option.attribute_id, option.sort_order
    from public.category_attribute_options as option
    join public.category_attributes as attribute on attribute.id = option.attribute_id
    join public.categories as category on category.id = attribute.category_id
    join marketo_catalog_0024_categories as target on target.category_slug = category.slug
    group by option.attribute_id, option.sort_order
    having count(*) > 1
  ) then
    raise exception '0024 found duplicate live sort orders in managed categories';
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_attributes as child
    left join marketo_catalog_0024_attributes as parent
      on parent.category_slug = child.category_slug
     and parent.key = child.depends_on_key
    where child.depends_on_key is not null and parent.key is null
  ) then
    raise exception '0024 source contains a missing attribute dependency';
  end if;

  if exists (
    with recursive dependency_walk as (
      select
        attribute.category_slug,
        attribute.key as origin_key,
        attribute.depends_on_key as next_key,
        array[attribute.key]::text[] as path,
        false as has_cycle
      from marketo_catalog_0024_attributes as attribute
      where attribute.depends_on_key is not null

      union all

      select
        walk.category_slug,
        walk.origin_key,
        parent.depends_on_key,
        walk.path || parent.key,
        parent.key = any(walk.path)
      from dependency_walk as walk
      join marketo_catalog_0024_attributes as parent
        on parent.category_slug = walk.category_slug
       and parent.key = walk.next_key
      where walk.next_key is not null and not walk.has_cycle
    )
    select 1 from dependency_walk where has_cycle
  ) then
    raise exception '0024 source contains an attribute dependency cycle';
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_options as target_option
    join marketo_catalog_0024_attributes as target_attribute
      on target_attribute.category_slug = target_option.category_slug
     and target_attribute.key = target_option.attribute_key
    where target_attribute.data_type not in ('select', 'multiselect')
  ) or exists (
    select 1
    from marketo_catalog_0024_attributes as target_attribute
    where target_attribute.data_type in ('select', 'multiselect')
      and not exists (
        select 1 from marketo_catalog_0024_options as target_option
        where target_option.category_slug = target_attribute.category_slug
          and target_option.attribute_key = target_attribute.key
      )
  ) then
    raise exception '0024 source option rows do not match select attribute types';
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_options as child_option
    join marketo_catalog_0024_attributes as child_attribute
      on child_attribute.category_slug = child_option.category_slug
     and child_attribute.key = child_option.attribute_key
    left join marketo_catalog_0024_attributes as parent_attribute
      on parent_attribute.category_slug = child_attribute.category_slug
     and parent_attribute.key = child_attribute.depends_on_key
    left join marketo_catalog_0024_options as parent_option
      on parent_option.category_slug = parent_attribute.category_slug
     and parent_option.attribute_key = parent_attribute.key
     and parent_option.value = child_option.parent_value
    where child_option.parent_value is not null
      and (child_attribute.depends_on_key is null or parent_option.value is null)
  ) then
    raise exception '0024 source contains an invalid parent option mapping';
  end if;

  if exists (
    select 1
    from public.category_attributes as existing
    join public.categories as category on category.id = existing.category_id
    join marketo_catalog_0024_attributes as target
      on target.category_slug = category.slug and target.key = existing.key
    where existing.data_type <> target.data_type
  ) then
    raise exception '0024 refuses to change the data type of an existing stable attribute key';
  end if;

  if exists (
    select 1
    from public.category_attributes as existing
    join public.categories as category on category.id = existing.category_id
    join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
    where not exists (
      select 1 from marketo_catalog_0024_attributes as target
      where target.category_slug = category.slug and target.key = existing.key
    )
      and (
        exists (select 1 from public.listing_attribute_values as value where value.attribute_id = existing.id)
        or exists (select 1 from public.listing_attribute_option_values as value where value.attribute_id = existing.id)
      )
  ) then
    raise exception '0024 refuses to deactivate an attribute referenced by a listing';
  end if;

  if exists (
    select 1
    from public.category_attribute_options as existing_option
    join public.category_attributes as existing_attribute on existing_attribute.id = existing_option.attribute_id
    join public.categories as category on category.id = existing_attribute.category_id
    join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
    where not exists (
      select 1 from marketo_catalog_0024_options as target
      where target.category_slug = category.slug
        and target.attribute_key = existing_attribute.key
        and target.value = existing_option.value
    )
      and exists (
        select 1 from public.listing_attribute_option_values as value
        where value.attribute_id = existing_option.attribute_id
          and value.option_id = existing_option.id
      )
  ) then
    raise exception '0024 refuses to deactivate an option referenced by a listing';
  end if;

  if exists (
    with category_stats as (
      select
        category.id as category_id,
        greatest(
          coalesce((select max(attribute.sort_order) from public.category_attributes as attribute where attribute.category_id = category.id), 0),
          coalesce((select max(target.sort_order) from marketo_catalog_0024_attributes as target where target.category_slug = managed.category_slug), 0)
        )::bigint
          + (select count(*) from public.category_attributes as attribute where attribute.category_id = category.id)::bigint
          as base_sort,
        (select count(*) from public.category_attributes as attribute where attribute.category_id = category.id)::bigint as row_count,
        coalesce((select max(target.sort_order) from marketo_catalog_0024_attributes as target where target.category_slug = managed.category_slug), 0)::bigint as target_max,
        (select count(*) from public.category_attributes as attribute
          where attribute.category_id = category.id
            and not exists (
              select 1 from marketo_catalog_0024_attributes as target
              where target.category_slug = managed.category_slug and target.key = attribute.key
            ))::bigint as obsolete_count
      from marketo_catalog_0024_categories as managed
      join public.categories as category on category.slug = managed.category_slug
    )
    select 1 from category_stats
    where base_sort + row_count > 2147483647
       or target_max + obsolete_count > 2147483647
  ) then
    raise exception '0024 attribute sort-order staging would overflow integer';
  end if;
end;
$marketo_catalog_0024_preflight$;

-- Avoid invalidating existing draft/rejected listings when a source field is new
-- or becomes required. This effective target is also used by the postflight checks.
update marketo_catalog_0024_attributes as target
set is_required = target.is_required
  and coalesce((
    select existing.is_required
    from public.categories as category
    join public.category_attributes as existing
      on existing.category_id = category.id and existing.key = target.key
    where category.slug = target.category_slug
  ), false);
`);

add(`
-- Move every existing attribute in a managed category above both the current
-- and target canonical ranges. The range is computed per category and guarded
-- against integer overflow in the preflight block.
with category_bounds as (
  select
    category.id as category_id,
    greatest(
      coalesce((select max(attribute.sort_order) from public.category_attributes as attribute where attribute.category_id = category.id), 0),
      coalesce((select max(target.sort_order) from marketo_catalog_0024_attributes as target where target.category_slug = managed.category_slug), 0)
    )::bigint
      + (select count(*) from public.category_attributes as attribute where attribute.category_id = category.id)::bigint
      as base_sort
  from marketo_catalog_0024_categories as managed
  join public.categories as category on category.slug = managed.category_slug
), shifted as (
  select
    attribute.id,
    (bounds.base_sort + row_number() over (
      partition by attribute.category_id
      order by attribute.sort_order, attribute.id
    ))::integer as next_sort_order
  from public.category_attributes as attribute
  join category_bounds as bounds on bounds.category_id = attribute.category_id
)
update public.category_attributes as attribute
set sort_order = shifted.next_sort_order
from shifted
where shifted.id = attribute.id;

insert into public.category_attributes (
  category_id, key, label_ru, label_kk, data_type, unit_ru, unit_kk,
  is_required, is_filterable, is_searchable, inherits_to_children,
  validation, filter_mode, options_load_mode, depends_on_key, is_visible,
  sort_order, is_active
)
select
  category.id,
  target.key,
  target.label_ru,
  target.label_kk,
  target.data_type,
  target.unit_ru,
  target.unit_kk,
  target.is_required,
  target.is_filterable,
  target.is_searchable,
  target.inherits_to_children,
  target.validation,
  target.filter_mode,
  target.options_load_mode,
  target.depends_on_key,
  target.is_visible,
  target.sort_order,
  true
from marketo_catalog_0024_attributes as target
join public.categories as category on category.slug = target.category_slug
on conflict (category_id, key) do update set
  label_ru = excluded.label_ru,
  label_kk = excluded.label_kk,
  data_type = excluded.data_type,
  unit_ru = excluded.unit_ru,
  unit_kk = excluded.unit_kk,
  is_required = excluded.is_required,
  is_filterable = excluded.is_filterable,
  is_searchable = excluded.is_searchable,
  inherits_to_children = excluded.inherits_to_children,
  validation = excluded.validation,
  filter_mode = excluded.filter_mode,
  options_load_mode = excluded.options_load_mode,
  depends_on_key = excluded.depends_on_key,
  is_visible = excluded.is_visible,
  sort_order = excluded.sort_order,
  is_active = true;

do $marketo_catalog_0024_option_sort_preflight$
begin
  if exists (
    with target_attributes as (
      select
        target.category_slug,
        target.key as attribute_key,
        attribute.id as attribute_id
      from marketo_catalog_0024_attributes as target
      join public.categories as category on category.slug = target.category_slug
      join public.category_attributes as attribute
        on attribute.category_id = category.id and attribute.key = target.key
    ), option_stats as (
      select
        target_attribute.attribute_id,
        greatest(
          coalesce((select max(option.sort_order) from public.category_attribute_options as option where option.attribute_id = target_attribute.attribute_id), 0),
          coalesce((select max(target.sort_order) from marketo_catalog_0024_options as target
            where target.category_slug = target_attribute.category_slug
              and target.attribute_key = target_attribute.attribute_key), 0)
        )::bigint
          + (select count(*) from public.category_attribute_options as option
            where option.attribute_id = target_attribute.attribute_id)::bigint
          as base_sort,
        (select count(*) from public.category_attribute_options as option
          where option.attribute_id = target_attribute.attribute_id)::bigint as row_count,
        coalesce((select max(target.sort_order) from marketo_catalog_0024_options as target
          where target.category_slug = target_attribute.category_slug
            and target.attribute_key = target_attribute.attribute_key), 0)::bigint as target_max,
        (select count(*) from public.category_attribute_options as option
          where option.attribute_id = target_attribute.attribute_id
            and not exists (
              select 1 from marketo_catalog_0024_options as target
              where target.category_slug = target_attribute.category_slug
                and target.attribute_key = target_attribute.attribute_key
                and target.value = option.value
            ))::bigint as obsolete_count
      from target_attributes as target_attribute
    )
    select 1 from option_stats
    where base_sort + row_count > 2147483647
       or target_max + obsolete_count > 2147483647
  ) then
    raise exception '0024 option sort-order staging would overflow integer';
  end if;
end;
$marketo_catalog_0024_option_sort_preflight$;

-- Free the canonical option ranges only for attributes in the new target.
with target_attributes as (
  select
    target.category_slug,
    target.key as attribute_key,
    attribute.id as attribute_id
  from marketo_catalog_0024_attributes as target
  join public.categories as category on category.slug = target.category_slug
  join public.category_attributes as attribute
    on attribute.category_id = category.id and attribute.key = target.key
), attribute_bounds as (
  select
    target_attribute.attribute_id,
    greatest(
      coalesce((select max(option.sort_order) from public.category_attribute_options as option where option.attribute_id = target_attribute.attribute_id), 0),
      coalesce((select max(target.sort_order) from marketo_catalog_0024_options as target
        where target.category_slug = target_attribute.category_slug
          and target.attribute_key = target_attribute.attribute_key), 0)
    )::bigint
      + (select count(*) from public.category_attribute_options as option
        where option.attribute_id = target_attribute.attribute_id)::bigint
      as base_sort
  from target_attributes as target_attribute
), shifted as (
  select
    option.id,
    (bounds.base_sort + row_number() over (
      partition by option.attribute_id
      order by option.sort_order, option.id
    ))::integer as next_sort_order
  from public.category_attribute_options as option
  join attribute_bounds as bounds on bounds.attribute_id = option.attribute_id
)
update public.category_attribute_options as option
set sort_order = shifted.next_sort_order
from shifted
where shifted.id = option.id;

insert into public.category_attribute_options (
  attribute_id, value, label_ru, label_kk, parent_option_id, sort_order, is_active
)
select
  attribute.id,
  target.value,
  target.label_ru,
  target.label_kk,
  null,
  target.sort_order,
  true
from marketo_catalog_0024_options as target
join public.categories as category on category.slug = target.category_slug
join public.category_attributes as attribute
  on attribute.category_id = category.id and attribute.key = target.attribute_key
on conflict (attribute_id, value) do update set
  label_ru = excluded.label_ru,
  label_kk = excluded.label_kk,
  parent_option_id = null,
  sort_order = excluded.sort_order,
  is_active = true;

update public.category_attribute_options as child_option
set parent_option_id = parent_option.id
from marketo_catalog_0024_options as target
join public.categories as category on category.slug = target.category_slug
join public.category_attributes as child_attribute
  on child_attribute.category_id = category.id and child_attribute.key = target.attribute_key
join public.category_attributes as parent_attribute
  on parent_attribute.category_id = category.id
 and parent_attribute.key = child_attribute.depends_on_key
join public.category_attribute_options as parent_option
  on parent_option.attribute_id = parent_attribute.id
 and parent_option.value = target.parent_value
where target.parent_value is not null
  and child_option.attribute_id = child_attribute.id
  and child_option.value = target.value;

-- Soft-deactivate every option absent from the complete managed snapshot.
update public.category_attribute_options as option
set is_active = false
from public.category_attributes as attribute
join public.categories as category on category.id = attribute.category_id
join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
where option.attribute_id = attribute.id
  and not exists (
    select 1 from marketo_catalog_0024_options as target
    where target.category_slug = category.slug
      and target.attribute_key = attribute.key
      and target.value = option.value
  );

-- Give obsolete options on retained attributes a deterministic, non-conflicting
-- range after the canonical target. This keeps repeated rehearsals stable.
with target_attributes as (
  select
    target.category_slug,
    target.key as attribute_key,
    attribute.id as attribute_id,
    coalesce((select max(target_option.sort_order)
      from marketo_catalog_0024_options as target_option
      where target_option.category_slug = target.category_slug
        and target_option.attribute_key = target.key), 0)::bigint as target_max
  from marketo_catalog_0024_attributes as target
  join public.categories as category on category.slug = target.category_slug
  join public.category_attributes as attribute
    on attribute.category_id = category.id and attribute.key = target.key
), obsolete_ranked as (
  select
    option.id,
    (target_attribute.target_max + row_number() over (
      partition by option.attribute_id
      order by option.value, option.id
    ))::integer as final_sort_order
  from public.category_attribute_options as option
  join target_attributes as target_attribute on target_attribute.attribute_id = option.attribute_id
  where not exists (
    select 1 from marketo_catalog_0024_options as target
    where target.category_slug = target_attribute.category_slug
      and target.attribute_key = target_attribute.attribute_key
      and target.value = option.value
  )
)
update public.category_attribute_options as option
set sort_order = obsolete_ranked.final_sort_order
from obsolete_ranked
where obsolete_ranked.id = option.id;

-- Soft-deactivate obsolete attributes only after their option rows are settled.
update public.category_attributes as attribute
set is_active = false,
    is_visible = false
from public.categories as category
join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
where attribute.category_id = category.id
  and not exists (
    select 1 from marketo_catalog_0024_attributes as target
    where target.category_slug = category.slug and target.key = attribute.key
  );

-- Keep obsolete attribute sort orders deterministic after the canonical target.
with category_targets as (
  select
    category.id as category_id,
    managed.category_slug,
    coalesce((select max(target.sort_order)
      from marketo_catalog_0024_attributes as target
      where target.category_slug = managed.category_slug), 0)::bigint as target_max
  from marketo_catalog_0024_categories as managed
  join public.categories as category on category.slug = managed.category_slug
), obsolete_ranked as (
  select
    attribute.id,
    (category_target.target_max + row_number() over (
      partition by attribute.category_id
      order by attribute.key, attribute.id
    ))::integer as final_sort_order
  from public.category_attributes as attribute
  join category_targets as category_target on category_target.category_id = attribute.category_id
  where not exists (
    select 1 from marketo_catalog_0024_attributes as target
    where target.category_slug = category_target.category_slug and target.key = attribute.key
  )
)
update public.category_attributes as attribute
set sort_order = obsolete_ranked.final_sort_order
from obsolete_ranked
where obsolete_ranked.id = attribute.id;

do $marketo_catalog_0024_postflight$
declare
  actual_count bigint;
begin
  select count(*) into actual_count
  from public.category_attributes as attribute
  join public.categories as category on category.id = attribute.category_id
  join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
  where attribute.is_active;
  if actual_count <> ${attributeRows.length} then
    raise exception '0024 active attribute count mismatch: expected ${attributeRows.length}, got %', actual_count;
  end if;

  select count(*) into actual_count
  from public.category_attribute_options as option
  join public.category_attributes as attribute on attribute.id = option.attribute_id
  join public.categories as category on category.id = attribute.category_id
  join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
  where option.is_active;
  if actual_count <> ${optionRows.length} then
    raise exception '0024 active option count mismatch: expected ${optionRows.length}, got %', actual_count;
  end if;

  if exists (
    select 1
    from public.category_attribute_options as option
    join public.category_attributes as attribute on attribute.id = option.attribute_id
    where option.is_active and not attribute.is_active
  ) then
    raise exception '0024 found an active option owned by an inactive attribute';
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_attributes as target
    join public.categories as category on category.slug = target.category_slug
    left join public.category_attributes as actual
      on actual.category_id = category.id and actual.key = target.key
    where actual.id is null
       or not actual.is_active
       or actual.label_ru is distinct from target.label_ru
       or actual.label_kk is distinct from target.label_kk
       or actual.data_type is distinct from target.data_type
       or actual.unit_ru is distinct from target.unit_ru
       or actual.unit_kk is distinct from target.unit_kk
       or actual.is_required is distinct from target.is_required
       or actual.is_filterable is distinct from target.is_filterable
       or actual.is_searchable is distinct from target.is_searchable
       or actual.inherits_to_children is distinct from target.inherits_to_children
       or actual.validation is distinct from target.validation
       or actual.filter_mode is distinct from target.filter_mode
       or actual.options_load_mode is distinct from target.options_load_mode
       or actual.depends_on_key is distinct from target.depends_on_key
       or actual.is_visible is distinct from target.is_visible
       or actual.sort_order is distinct from target.sort_order
  ) then
    raise exception '0024 persisted attribute metadata differs from the source snapshot';
  end if;

  if exists (
    select 1
    from public.category_attributes as actual
    join public.categories as category on category.id = actual.category_id
    join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
    where actual.is_active
      and not exists (
        select 1 from marketo_catalog_0024_attributes as target
        where target.category_slug = category.slug and target.key = actual.key
      )
  ) then
    raise exception '0024 left an obsolete managed attribute active';
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_options as target
    join public.categories as category on category.slug = target.category_slug
    join public.category_attributes as attribute
      on attribute.category_id = category.id and attribute.key = target.attribute_key
    left join public.category_attribute_options as actual
      on actual.attribute_id = attribute.id and actual.value = target.value
    where actual.id is null
       or not actual.is_active
       or actual.label_ru is distinct from target.label_ru
       or actual.label_kk is distinct from target.label_kk
       or actual.sort_order is distinct from target.sort_order
  ) then
    raise exception '0024 persisted option metadata differs from the source snapshot';
  end if;

  if exists (
    select 1
    from public.category_attribute_options as actual_option
    join public.category_attributes as actual_attribute on actual_attribute.id = actual_option.attribute_id
    join public.categories as category on category.id = actual_attribute.category_id
    join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
    where actual_option.is_active
      and not exists (
        select 1 from marketo_catalog_0024_options as target
        where target.category_slug = category.slug
          and target.attribute_key = actual_attribute.key
          and target.value = actual_option.value
      )
  ) then
    raise exception '0024 left an obsolete managed option active';
  end if;

  if exists (
    select 1
    from marketo_catalog_0024_options as target
    join marketo_catalog_0024_attributes as child_target
      on child_target.category_slug = target.category_slug
     and child_target.key = target.attribute_key
    join public.categories as category on category.slug = target.category_slug
    join public.category_attributes as child_attribute
      on child_attribute.category_id = category.id and child_attribute.key = target.attribute_key
    join public.category_attribute_options as child_option
      on child_option.attribute_id = child_attribute.id and child_option.value = target.value
    left join public.category_attributes as parent_attribute
      on parent_attribute.category_id = category.id
     and parent_attribute.key = child_target.depends_on_key
    left join public.category_attribute_options as parent_option
      on parent_option.attribute_id = parent_attribute.id
     and parent_option.value = target.parent_value
    where (target.parent_value is null and child_option.parent_option_id is not null)
       or (target.parent_value is not null and child_option.parent_option_id is distinct from parent_option.id)
  ) then
    raise exception '0024 persisted parent option mapping differs from the source snapshot';
  end if;

  if exists (
    select attribute.category_id, attribute.sort_order
    from public.category_attributes as attribute
    join public.categories as category on category.id = attribute.category_id
    join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
    group by attribute.category_id, attribute.sort_order
    having count(*) > 1
  ) or exists (
    select option.attribute_id, option.sort_order
    from public.category_attribute_options as option
    join public.category_attributes as attribute on attribute.id = option.attribute_id
    join public.categories as category on category.id = attribute.category_id
    join marketo_catalog_0024_categories as managed on managed.category_slug = category.slug
    group by option.attribute_id, option.sort_order
    having count(*) > 1
  ) then
    raise exception '0024 postflight found duplicate sort orders';
  end if;
end;
$marketo_catalog_0024_postflight$;

-- Enforce the same leaf-only rule for every direct table/RPC path, not only UI.
create or replace function private.validate_listing_leaf_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $marketo_listing_leaf_guard$
begin
  if not exists (
    select 1
    from public.categories as category
    where category.id = new.category_id
      and category.is_active
      and not exists (
        select 1
        from public.categories as child
        where child.parent_id = category.id and child.is_active
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'listing category must be an active leaf category';
  end if;

  return new;
end;
$marketo_listing_leaf_guard$;

revoke all on function private.validate_listing_leaf_category()
from public, anon, authenticated, service_role;

drop trigger if exists listings_validate_leaf_category on public.listings;
create trigger listings_validate_leaf_category
before insert or update of category_id on public.listings
for each row execute function private.validate_listing_leaf_category();

comment on function private.validate_listing_leaf_category()
is 'Rejects listing writes unless category_id names an active category with no active children.';

commit;
`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${sql.join("\n\n")}\n`, "utf8");

console.log(
  `Generated ${outputPath} with ${targetCategories.length} managed categories, `
  + `${attributeRows.length} attributes and ${optionRows.length} options.`,
);
