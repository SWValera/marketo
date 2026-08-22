-- Marketo v1.0: least-privilege grants and RLS for every exposed table.

begin;

create or replace function private.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and status = 'active'
    ),
    false
  );
$$;

revoke all on function private.current_profile_is_active() from public;

alter table public.locales enable row level security;
alter table public.countries enable row level security;
alter table public.regions enable row level security;
alter table public.settlements enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.category_attributes enable row level security;
alter table public.category_attribute_options enable row level security;
alter table public.listings enable row level security;
alter table public.listing_contacts enable row level security;
alter table public.listing_attribute_values enable row level security;
alter table public.listing_attribute_option_values enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.admin_audit_log enable row level security;

create policy locales_public_read
on public.locales for select to anon, authenticated
using (is_active);

create policy countries_public_read
on public.countries for select to anon, authenticated
using (is_active);

create policy regions_public_read
on public.regions for select to anon, authenticated
using (is_active);

create policy settlements_public_read
on public.settlements for select to anon, authenticated
using (is_active);

create policy profiles_anon_public_read
on public.profiles for select to anon
using (status = 'active');

create policy profiles_authenticated_read
on public.profiles for select to authenticated
using (
  status = 'active'
  or id = (select auth.uid())
);

create policy profiles_owner_update
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy profile_private_owner_read
on public.profile_private for select to authenticated
using (user_id = (select auth.uid()));

create policy profile_private_owner_insert
on public.profile_private for insert to authenticated
with check (user_id = (select auth.uid()));

create policy profile_private_owner_update
on public.profile_private for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy user_roles_owner_or_staff_read
on public.user_roles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_any_role(array['support', 'moderator', 'admin']))
);

create policy categories_public_read
on public.categories for select to anon, authenticated
using (is_active);

create policy category_attributes_public_read
on public.category_attributes for select to anon, authenticated
using (
  is_active
  and exists (
    select 1 from public.categories
    where categories.id = category_attributes.category_id and categories.is_active
  )
);

create policy category_attribute_options_public_read
on public.category_attribute_options for select to anon, authenticated
using (
  is_active
  and exists (
    select 1 from public.category_attributes
    where category_attributes.id = category_attribute_options.attribute_id
      and category_attributes.is_active
  )
);

create policy listings_anon_active_read
on public.listings for select to anon
using (status = 'active' and published_at is not null and deleted_at is null);

create policy listings_authenticated_read
on public.listings for select to authenticated
using (
  (status = 'active' and published_at is not null and deleted_at is null)
  or owner_id = (select auth.uid())
  or (select private.has_any_role(array['support', 'moderator', 'admin']))
);

create policy listings_owner_insert_draft
on public.listings for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'draft'
  and deleted_at is null
  and (select private.current_profile_is_active())
);

create policy listings_owner_update_editable
on public.listings for update to authenticated
using (
  owner_id = (select auth.uid())
  and status in ('draft', 'rejected')
  and (select private.current_profile_is_active())
)
with check (
  owner_id = (select auth.uid())
  and status in ('draft', 'rejected')
  and deleted_at is null
);

create policy listing_contacts_owner_read
on public.listing_contacts for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_contacts.listing_id
      and listings.owner_id = (select auth.uid())
  )
);

create policy listing_contacts_owner_insert
on public.listing_contacts for insert to authenticated
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_contacts.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_contacts_owner_update
on public.listing_contacts for update to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_contacts.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
)
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_contacts.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_attribute_values_anon_active_read
on public.listing_attribute_values for select to anon
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.status = 'active'
      and listings.published_at is not null
      and listings.deleted_at is null
  )
);

create policy listing_attribute_values_authenticated_read
on public.listing_attribute_values for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and (
        (
          listings.status = 'active'
          and listings.published_at is not null
          and listings.deleted_at is null
        )
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['support', 'moderator', 'admin']))
      )
  )
);

create policy listing_attribute_values_owner_insert
on public.listing_attribute_values for insert to authenticated
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_attribute_values_owner_update
on public.listing_attribute_values for update to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
)
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_attribute_values_owner_delete
on public.listing_attribute_values for delete to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_attribute_options_anon_active_read
on public.listing_attribute_option_values for select to anon
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and listings.status = 'active'
      and listings.published_at is not null
      and listings.deleted_at is null
  )
);

create policy listing_attribute_options_authenticated_read
on public.listing_attribute_option_values for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and (
        (
          listings.status = 'active'
          and listings.published_at is not null
          and listings.deleted_at is null
        )
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['support', 'moderator', 'admin']))
      )
  )
);

create policy listing_attribute_options_owner_insert
on public.listing_attribute_option_values for insert to authenticated
with check (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_attribute_options_owner_delete
on public.listing_attribute_option_values for delete to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_attribute_option_values.listing_id
      and listings.owner_id = (select auth.uid())
      and listings.status in ('draft', 'rejected')
  )
);

create policy listing_images_anon_active_read
on public.listing_images for select to anon
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_images.listing_id
      and listings.status = 'active'
      and listings.published_at is not null
      and listings.deleted_at is null
  )
);

create policy listing_images_authenticated_read
on public.listing_images for select to authenticated
using (
  exists (
    select 1 from public.listings
    where listings.id = listing_images.listing_id
      and (
        (
          listings.status = 'active'
          and listings.published_at is not null
          and listings.deleted_at is null
        )
        or listings.owner_id = (select auth.uid())
        or (select private.has_any_role(array['support', 'moderator', 'admin']))
      )
  )
);

create policy favorites_owner_read
on public.favorites for select to authenticated
using (user_id = (select auth.uid()));

create policy favorites_owner_insert
on public.favorites for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.current_profile_is_active())
  and exists (
    select 1 from public.listings
    where listings.id = favorites.listing_id
      and listings.status = 'active'
      and listings.deleted_at is null
  )
);

create policy favorites_owner_delete
on public.favorites for delete to authenticated
using (user_id = (select auth.uid()));

create policy conversations_participant_read
on public.conversations for select to authenticated
using (
  (select private.is_conversation_participant(id))
  or (select private.has_any_role(array['support', 'moderator', 'admin']))
);

create policy conversation_participants_member_read
on public.conversation_participants for select to authenticated
using (
  (select private.is_conversation_participant(conversation_id))
  or (select private.has_any_role(array['support', 'moderator', 'admin']))
);

create policy conversation_participants_self_read_marker_update
on public.conversation_participants for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy messages_participant_read
on public.messages for select to authenticated
using (
  (select private.is_conversation_participant(conversation_id))
  or (select private.has_any_role(array['support', 'moderator', 'admin']))
);

create policy messages_participant_insert
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and message_type = 'text'
  and (select private.current_profile_is_active())
  and (select private.is_conversation_participant(conversation_id))
  and exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id and conversations.status = 'active'
  )
);

create policy notifications_owner_read
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy notifications_owner_read_marker_update
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy reports_reporter_or_staff_read
on public.reports for select to authenticated
using (
  reporter_id = (select auth.uid())
  or (select private.has_any_role(array['moderator', 'admin']))
);

create policy reports_authenticated_insert
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and status = 'open'
  and moderator_id is null
  and resolved_at is null
  and (select private.current_profile_is_active())
);

create policy moderation_actions_staff_read
on public.moderation_actions for select to authenticated
using ((select private.has_any_role(array['moderator', 'admin'])));

create policy admin_audit_log_admin_read
on public.admin_audit_log for select to authenticated
using ((select private.has_any_role(array['admin'])));

revoke all on table
  public.locales, public.countries, public.regions, public.settlements,
  public.profiles, public.profile_private, public.user_roles,
  public.categories, public.category_attributes, public.category_attribute_options,
  public.listings, public.listing_contacts, public.listing_attribute_values,
  public.listing_attribute_option_values, public.listing_images, public.favorites,
  public.conversations, public.conversation_participants, public.messages,
  public.notifications, public.reports, public.moderation_actions, public.admin_audit_log
from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;

grant select on table
  public.locales, public.countries, public.regions, public.settlements,
  public.categories, public.category_attributes,
  public.category_attribute_options, public.listings,
  public.listing_attribute_values, public.listing_attribute_option_values,
  public.listing_images
to anon;

grant select (id, display_name, avatar_path, bio, settlement_id, verified_at, created_at)
on public.profiles to anon, authenticated;

grant select on table
  public.locales, public.countries, public.regions, public.settlements,
  public.profile_private, public.user_roles,
  public.categories, public.category_attributes, public.category_attribute_options,
  public.listings, public.listing_contacts, public.listing_attribute_values,
  public.listing_attribute_option_values, public.listing_images, public.favorites,
  public.conversations, public.conversation_participants, public.messages,
  public.notifications, public.reports, public.moderation_actions, public.admin_audit_log
to authenticated;

grant update (display_name, avatar_path, bio, language_code, settlement_id)
on public.profiles to authenticated;
grant insert (user_id, contact_phone_e164), update (contact_phone_e164)
on public.profile_private to authenticated;

grant insert (owner_id, category_id, settlement_id, slug, title, description, price_minor, currency_code)
on public.listings to authenticated;
grant update (category_id, settlement_id, slug, title, description, price_minor, currency_code)
on public.listings to authenticated;

grant insert (listing_id, contact_name, contact_phone_e164, allow_messages, allow_phone),
  update (contact_name, contact_phone_e164, allow_messages, allow_phone)
on public.listing_contacts to authenticated;

grant insert (listing_id, attribute_id, text_value, number_value, boolean_value, date_value, number_min_value, number_max_value),
  update (text_value, number_value, boolean_value, date_value, number_min_value, number_max_value),
  delete
on public.listing_attribute_values to authenticated;

grant insert (listing_id, attribute_id, option_id), delete
on public.listing_attribute_option_values to authenticated;

grant insert (user_id, listing_id), delete on public.favorites to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
grant insert (conversation_id, sender_id, body, message_type) on public.messages to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (reporter_id, listing_id, reported_user_id, reason_code, details) on public.reports to authenticated;

grant execute on function private.has_any_role(text[]) to authenticated;
grant execute on function private.current_profile_is_active() to authenticated;
grant execute on function private.is_conversation_participant(uuid) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_profile_for_staff(uuid) to authenticated;
grant execute on function public.submit_listing(uuid) to authenticated;
grant execute on function public.archive_own_listing(uuid) to authenticated;
grant execute on function public.mark_own_listing_sold(uuid) to authenticated;
grant execute on function public.get_or_create_listing_conversation(uuid) to authenticated;
grant execute on function public.moderate_listing(uuid, text, text, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
grant execute on function public.assign_user_role(uuid, text, boolean) to authenticated;

grant all on table
  public.locales, public.countries, public.regions, public.settlements,
  public.profiles, public.profile_private, public.user_roles,
  public.categories, public.category_attributes, public.category_attribute_options,
  public.listings, public.listing_contacts, public.listing_attribute_values,
  public.listing_attribute_option_values, public.listing_images, public.favorites,
  public.conversations, public.conversation_participants, public.messages,
  public.notifications, public.reports, public.moderation_actions, public.admin_audit_log
to service_role;

grant execute on function public.submit_listing(uuid) to service_role;
grant execute on function public.archive_own_listing(uuid) to service_role;
grant execute on function public.mark_own_listing_sold(uuid) to service_role;

commit;
