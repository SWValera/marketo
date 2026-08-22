-- Marketo v1.0: indexes for catalog, ownership, chat, notifications and moderation.

begin;

create index locales_active_sort_idx
  on public.locales (is_active, sort_order, code);
create index countries_active_sort_idx
  on public.countries (is_active, sort_order, code);
create index regions_country_active_sort_idx
  on public.regions (country_id, is_active, sort_order, id);
create index settlements_region_active_sort_idx
  on public.settlements (region_id, is_active, is_selectable, sort_order, id);
create index settlements_parent_active_idx
  on public.settlements (parent_id, is_active, sort_order, id);
create index settlements_name_ru_trgm_idx
  on public.settlements using gin (name_ru extensions.gin_trgm_ops);
create index settlements_name_kk_trgm_idx
  on public.settlements using gin (name_kk extensions.gin_trgm_ops);

create index profiles_settlement_idx on public.profiles (settlement_id) where settlement_id is not null;
create index profiles_active_name_idx on public.profiles (display_name, id) where status = 'active';
create index user_roles_role_user_idx on public.user_roles (role, user_id);

create index categories_parent_active_sort_idx
  on public.categories (parent_id, is_active, sort_order, id);
create index categories_name_ru_trgm_idx
  on public.categories using gin (name_ru extensions.gin_trgm_ops);
create index categories_name_kk_trgm_idx
  on public.categories using gin (name_kk extensions.gin_trgm_ops);
create index category_attributes_category_active_sort_idx
  on public.category_attributes (category_id, is_active, sort_order, id);
create index category_attributes_filterable_idx
  on public.category_attributes (category_id, sort_order, id)
  where is_active and is_filterable;
create index category_attribute_options_attribute_active_sort_idx
  on public.category_attribute_options (attribute_id, is_active, sort_order, id);

alter table public.listings
  add column search_document tsvector
  generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

create index listings_active_category_cursor_idx
  on public.listings (category_id, published_at desc, id desc)
  where status = 'active' and deleted_at is null;
create index listings_active_settlement_cursor_idx
  on public.listings (settlement_id, published_at desc, id desc)
  where status = 'active' and deleted_at is null;
create index listings_active_category_settlement_price_idx
  on public.listings (category_id, settlement_id, price_minor, published_at desc, id desc)
  where status = 'active' and deleted_at is null;
create index listings_owner_created_idx
  on public.listings (owner_id, created_at desc, id desc)
  where owner_id is not null;
create index listings_status_created_idx on public.listings (status, created_at, id);
create index listings_search_document_idx on public.listings using gin (search_document);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);

create index listing_attribute_number_filter_idx
  on public.listing_attribute_values (attribute_id, number_value, listing_id)
  where number_value is not null;
create index listing_attribute_text_filter_idx
  on public.listing_attribute_values using gin (text_value extensions.gin_trgm_ops)
  where text_value is not null;
create index listing_attribute_option_filter_idx
  on public.listing_attribute_option_values (attribute_id, option_id, listing_id);
create index favorites_listing_idx on public.favorites (listing_id, created_at desc);
create index conversations_listing_updated_idx on public.conversations (listing_id, updated_at desc, id);
create index conversation_participants_user_updated_idx
  on public.conversation_participants (user_id, conversation_id, last_read_at);
create index messages_conversation_cursor_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc) where sender_id is not null;

create index notifications_user_created_idx on public.notifications (user_id, created_at desc, id desc);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc, id desc)
  where read_at is null;
create index reports_open_queue_idx
  on public.reports (status, created_at, id)
  where status in ('open', 'in_review');
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc) where reporter_id is not null;
create index moderation_actions_listing_created_idx
  on public.moderation_actions (listing_id, created_at desc, id desc)
  where listing_id is not null;
create index admin_audit_actor_created_idx
  on public.admin_audit_log (actor_id, created_at desc, id desc)
  where actor_id is not null;
create index admin_audit_entity_idx on public.admin_audit_log (entity_type, entity_id, created_at desc);

-- Public marketplace identity is exposed through an intentionally narrow
-- security-invoker view. Base-table RLS still decides which profile rows are
-- visible, while column grants keep language, account status and presence data
-- out of cross-user queries.
create or replace view public.seller_profiles
with (security_invoker = true, security_barrier = true)
as
select
  profile.id,
  profile.display_name,
  profile.avatar_path,
  profile.bio,
  profile.settlement_id,
  profile.verified_at,
  profile.created_at
from public.profiles as profile;

revoke all on public.seller_profiles from public;
grant select on public.seller_profiles to anon, authenticated, service_role;

create or replace view public.catalog_listing_cards
with (security_invoker = true)
as
select
  listing.id,
  listing.slug,
  listing.title,
  listing.price_minor,
  listing.currency_code,
  listing.category_id,
  category.slug as category_slug,
  listing.settlement_id,
  settlement.name_ru as location_name_ru,
  settlement.name_kk as location_name_kk,
  listing.published_at,
  (listing.promoted_until is not null and listing.promoted_until > now()) as promoted,
  primary_image.storage_key as primary_image_storage_key
from public.listings as listing
join public.categories as category on category.id = listing.category_id
join public.settlements as settlement on settlement.id = listing.settlement_id
left join lateral (
  select image.storage_key
  from public.listing_images as image
  where image.listing_id = listing.id
  order by image.sort_order, image.id
  limit 1
) as primary_image on true
where listing.status = 'active'
  and listing.published_at is not null
  and listing.deleted_at is null;

revoke all on public.catalog_listing_cards from public;
grant select on public.catalog_listing_cards to anon, authenticated, service_role;

commit;
