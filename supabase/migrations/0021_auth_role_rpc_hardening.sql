-- Marketo v1.0: explicit Auth/Profile RPC execution boundary.
-- Forward-only hardening after real-project privilege inspection.
begin;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- default for future migrations and then replace all current implicit grants
-- with the reviewed allowlist below.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke execute on function public.get_my_account_profile() from public, anon;
revoke execute on function public.update_my_account_profile(text, text, varchar, uuid, text) from public, anon;

-- Public/anonymous read RPC allowlist. These functions are SECURITY INVOKER
-- and remain constrained by the public read policies on their source rows.
grant execute on function public.search_catalog_listing_cards(uuid[], uuid, text, bigint, bigint, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.get_city_premium_placements(uuid, integer)
  to anon, authenticated, service_role;

-- Authenticated account and owner operations.
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_account_profile() to authenticated;
grant execute on function public.update_my_account_profile(text, text, varchar, uuid, text) to authenticated;
grant execute on function public.submit_listing(uuid) to authenticated;
grant execute on function public.archive_own_listing(uuid) to authenticated;
grant execute on function public.mark_own_listing_sold(uuid) to authenticated;
grant execute on function public.get_or_create_listing_conversation(uuid) to authenticated;
grant execute on function public.create_listing_draft(uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
  to authenticated;

-- Staff RPCs are callable only by an authenticated session and still enforce
-- moderator/admin roles inside each elevated function.
grant execute on function public.get_profile_for_staff(uuid) to authenticated;
grant execute on function public.moderate_listing(uuid, text, text, text) to authenticated;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
grant execute on function public.assign_user_role(uuid, text, boolean) to authenticated;

-- Private helpers required by authenticated RLS policies.
grant execute on function private.has_any_role(text[]) to authenticated;
grant execute on function private.current_profile_is_active() to authenticated;
grant execute on function private.is_conversation_participant(uuid) to authenticated;
grant execute on function private.category_is_ancestor(uuid, uuid) to authenticated, service_role;
grant execute on function private.attribute_applies_to_listing(uuid, uuid) to authenticated, service_role;

-- Server-side maintenance operations retain their existing explicit boundary.
grant execute on function public.submit_listing(uuid) to service_role;
grant execute on function public.archive_own_listing(uuid) to service_role;
grant execute on function public.mark_own_listing_sold(uuid) to service_role;
grant execute on function public.create_listing_draft(uuid, uuid, text, text, bigint, char(3), text, text, boolean, jsonb)
  to service_role;

commit;
