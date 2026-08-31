-- Marketo v1.0 category metadata foundation.
-- Adds reusable buyer-filter metadata and normalized option dependencies.
-- No existing rows are deleted and no RLS policy or grant is weakened.

begin;

alter table public.category_attributes
  add column if not exists filter_mode text not null default 'exact',
  add column if not exists options_load_mode text not null default 'eager',
  add column if not exists depends_on_key text,
  add column if not exists is_visible boolean not null default true;

alter table public.category_attributes
  drop constraint if exists category_attributes_filter_mode_check,
  add constraint category_attributes_filter_mode_check
    check (filter_mode in ('exact', 'range', 'search')),
  drop constraint if exists category_attributes_options_load_mode_check,
  add constraint category_attributes_options_load_mode_check
    check (options_load_mode in ('eager', 'deferred')),
  drop constraint if exists category_attributes_dependency_not_self,
  add constraint category_attributes_dependency_not_self
    check (depends_on_key is null or depends_on_key <> key),
  drop constraint if exists category_attributes_dependency_fk,
  add constraint category_attributes_dependency_fk
    foreign key (category_id, depends_on_key)
    references public.category_attributes (category_id, key)
    on delete restrict
    deferrable initially deferred;

alter table public.category_attribute_options
  add column if not exists parent_option_id uuid;

alter table public.category_attribute_options
  drop constraint if exists category_attribute_options_parent_not_self,
  add constraint category_attribute_options_parent_not_self
    check (parent_option_id is null or parent_option_id <> id),
  drop constraint if exists category_attribute_options_parent_option_id_fkey,
  add constraint category_attribute_options_parent_option_id_fkey
    foreign key (parent_option_id)
    references public.category_attribute_options (id)
    on delete restrict;

create index if not exists category_attribute_options_parent_lookup_idx
  on public.category_attribute_options (attribute_id, parent_option_id, sort_order, id)
  where is_active;

create index if not exists category_attributes_category_visible_sort_idx
  on public.category_attributes (category_id, is_active, is_visible, sort_order, id);

comment on column public.category_attributes.filter_mode is
  'Buyer-filter widget: exact value, min/max range, or normalized text search.';
comment on column public.category_attributes.options_load_mode is
  'Eager options travel with attribute metadata; deferred options load on demand.';
comment on column public.category_attributes.depends_on_key is
  'Attribute key in the same category that controls this attribute.';
comment on column public.category_attributes.is_visible is
  'Allows a category layer to suppress a composable attribute without deleting history.';
comment on column public.category_attribute_options.parent_option_id is
  'Optional parent option for reusable dependencies such as brand to model.';

commit;
