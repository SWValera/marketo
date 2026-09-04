import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";

export async function resolveAuthenticatedUserId(
  client: Pick<MarketoSupabaseClient, "auth">,
  authenticatedUserId?: string,
) {
  if (authenticatedUserId) return authenticatedUserId;
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("authentication_required");
  return data.user.id;
}
