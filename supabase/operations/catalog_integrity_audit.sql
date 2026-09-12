-- Read-only production catalog integrity audit. No user text or identifying rows.
-- Run as an authorized database operator. Public/anon counts cannot prove integrity.
begin read only;
set local statement_timeout = '30s';
with metrics as (
  select 'categories.total' as metric, count(*)::bigint as value from public.categories
  union all select 'categories.active',count(*) from public.categories where is_active
  union all select 'categories.active_leaves',count(*) from public.categories c where c.is_active and not exists(select 1 from public.categories child where child.parent_id=c.id and child.is_active)
  union all select 'attributes.total',count(*) from public.category_attributes
  union all select 'attributes.active',count(*) from public.category_attributes where is_active
  union all select 'options.total',count(*) from public.category_attribute_options
  union all select 'options.active',count(*) from public.category_attribute_options where is_active
  union all select 'categories.orphan_parent',count(*) from public.categories c left join public.categories p on p.id=c.parent_id where c.parent_id is not null and p.id is null
  union all select 'attributes.orphan_category',count(*) from public.category_attributes a left join public.categories c on c.id=a.category_id where c.id is null
  union all select 'options.orphan_attribute',count(*) from public.category_attribute_options o left join public.category_attributes a on a.id=o.attribute_id where a.id is null
  union all select 'options.orphan_parent',count(*) from public.category_attribute_options o left join public.category_attribute_options p on p.id=o.parent_option_id where o.parent_option_id is not null and p.id is null
  union all select 'attributes.missing_dependency',count(*) from public.category_attributes a left join public.category_attributes p on p.category_id=a.category_id and p.key=a.depends_on_key where a.depends_on_key is not null and p.id is null
  union all select 'attributes.active_empty_select',count(*) from public.category_attributes a where a.is_active and a.data_type in ('select','multiselect') and not exists(select 1 from public.category_attribute_options o where o.attribute_id=a.id and o.is_active)
  union all select 'options.wrong_parent_attribute',count(*) from public.category_attribute_options o join public.category_attributes a on a.id=o.attribute_id join public.category_attribute_options po on po.id=o.parent_option_id join public.category_attributes pa on pa.id=po.attribute_id where pa.category_id<>a.category_id or pa.key is distinct from a.depends_on_key
  union all select 'options.on_scalar_attribute',count(*) from public.category_attribute_options o join public.category_attributes a on a.id=o.attribute_id where o.is_active and a.is_active and a.data_type not in ('select','multiselect')
  union all select 'listings.on_nonleaf',count(*) from public.listings l where exists(select 1 from public.categories c where c.parent_id=l.category_id and c.is_active)
  union all select 'values.scalar_on_select',count(*) from public.listing_attribute_values v join public.category_attributes a on a.id=v.attribute_id where a.data_type in ('select','multiselect')
  union all select 'values.option_on_scalar',count(*) from public.listing_attribute_option_values v join public.category_attributes a on a.id=v.attribute_id where a.data_type not in ('select','multiselect')
  union all select 'values.option_attribute_mismatch',count(*) from public.listing_attribute_option_values v join public.category_attribute_options o on o.id=v.option_id where o.attribute_id<>v.attribute_id
  union all select 'values.inactive_attribute',count(*) from public.listing_attribute_values v join public.category_attributes a on a.id=v.attribute_id where not a.is_active
  union all select 'values.inactive_option',count(*) from public.listing_attribute_option_values v join public.category_attribute_options o on o.id=v.option_id where not o.is_active
)
select metric,value from metrics order by metric;
commit;
