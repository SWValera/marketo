import { getRequestUser } from "@/lib/auth/request-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Start a read only after server verification. The caller must still apply its
 * existing full account-context gate before returning any result to the page.
 * Settling errors immediately also covers callers that return an auth error early.
 */
export function beginVerifiedAccountRead<T>(read: (userId: string) => Promise<T>) {
  return (async () => {
    const client = await createSupabaseServerClient();
    const { data, error } = await getRequestUser(client);
    if (error) throw error;
    if (!data.user) throw new Error("authentication_required");
    return read(data.user.id);
  })().then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error: error as unknown }),
  );
}
