import type { MarketoSupabaseClient } from "./client.ts";
import type { TablesUpdate } from "../../supabase/database.types.ts";

export async function getCurrentProfile(client: MarketoSupabaseClient) {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return null;
  const { data, error } = await client.rpc("get_my_profile").maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCurrentAccountProfile(client: MarketoSupabaseClient) {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return null;
  return getAuthenticatedAccountProfile(client);
}

export async function getAuthenticatedAccountProfile(client: MarketoSupabaseClient) {
  const { data, error } = await client.rpc("get_my_account_profile").maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateCurrentAccountProfile(client: MarketoSupabaseClient, input: {
  displayName: string;
  bio: string | null;
  language: "ru" | "kk";
  settlementId: string | null;
  contactPhoneE164: string | null;
}) {
  const { data, error } = await client.rpc("update_my_account_profile", {
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_language_code: input.language,
    p_settlement_id: input.settlementId,
    p_contact_phone_e164: input.contactPhoneE164,
  }).single();
  if (error) throw error;
  return data;
}

export async function getPublicSellerProfile(client: MarketoSupabaseClient, userId: string) {
  const { data, error } = await client.from("seller_profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProfileForStaff(client: MarketoSupabaseClient, userId: string) {
  const { data, error } = await client.rpc("get_profile_for_staff", { target_profile_id: userId }).maybeSingle();
  if (error) throw error;
  return data;
}

export type EditableProfilePatch = Pick<
  TablesUpdate<"profiles">,
  "display_name" | "avatar_path" | "bio" | "language_code" | "settlement_id"
>;

export async function updateOwnProfile(client: MarketoSupabaseClient, userId: string, patch: EditableProfilePatch) {
  const { error } = await client.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
  const { data, error: readError } = await client.rpc("get_my_profile").maybeSingle();
  if (readError) throw readError;
  return data;
}

export async function updateOwnPrivateContact(client: MarketoSupabaseClient, userId: string, contactPhoneE164: string | null) {
  const { data, error } = await client.from("profile_private").upsert({
    user_id: userId,
    contact_phone_e164: contactPhoneE164,
  }, { onConflict: "user_id" }).select("*").single();
  if (error) throw error;
  return data;
}
