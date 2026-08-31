import { cache } from "react";
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
    return await resolveCurrentAuthContext(await createSupabaseServerClient());
  } catch (error) {
    logAuthContextError("configuration", error);
    return createAuthContextError(false);
  }
});
