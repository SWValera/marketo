import type { SupabaseClient } from "@supabase/supabase-js";
import { requestMemo } from "../http/read-scope.ts";

const verifiedUser = Symbol("verified-user-in-this-request");
// Only a server-verified getUser result. Never getSession().user or cookie claims.
export function getRequestUser(client: Pick<SupabaseClient, "auth">) {
  return requestMemo(verifiedUser, () => client.auth.getUser());
}
