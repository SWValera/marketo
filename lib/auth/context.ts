import { requestCache as cache } from "@/lib/http/read-scope";
import { getRequestUser } from "@/lib/auth/request-user";
import {
  createAuthContextError,
  logAuthContextError,
  resolveCurrentAuthContext,
} from "@/lib/auth/context-core";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export { hasAnyRole, hasRole } from "@/lib/auth/context-core";
export type { AuthRole, CurrentAuthContext } from "@/lib/auth/context-core";

export const getCurrentAuthContext = cache(async () => {
  try {
    const client = await createSupabaseServerClient();
    return await resolveCurrentAuthContext(client, undefined, () => getRequestUser(client));
  } catch (error) {
    logAuthContextError("configuration", error);
    return createAuthContextError(false);
  }
});
