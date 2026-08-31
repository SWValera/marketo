import type { User } from "@supabase/supabase-js";
import { publicMediaUrl } from "../media/public-url.ts";
import type { AccountStatus, Profile } from "../data/types.ts";
import type { MarketoSupabaseClient } from "../data/supabase/client.ts";
import { getAuthenticatedAccountProfile } from "../data/supabase/profiles.ts";

export const AUTH_ROLES = ["support", "moderator", "admin"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

type PublicAuthUser = { id: string; email: string | null };

export type CurrentAuthContext =
  | {
      status: "anonymous";
      user: null;
      profile: null;
      roles: [];
      isAuthenticated: false;
    }
  | {
      status: "authenticated";
      user: PublicAuthUser;
      profile: Profile;
      accountStatus: AccountStatus;
      roles: AuthRole[];
      isAuthenticated: true;
    }
  | {
      status: "error";
      user: PublicAuthUser | null;
      profile: null;
      roles: [];
      isAuthenticated: boolean;
      errorCode: "AUTH_CONTEXT_UNAVAILABLE";
    };

type SafeAuthLogger = (details: {
  scope: "auth" | "profile" | "roles" | "configuration";
  name: string;
  code?: string;
  status?: number;
}) => void;

const authRoleSet = new Set<string>(AUTH_ROLES);
const accountStatusSet = new Set<string>(["active", "suspended", "banned", "deleted"] satisfies AccountStatus[]);

function publicUser(user: User): PublicAuthUser {
  return { id: user.id, email: user.email ?? null };
}

function mapProfile(row: Awaited<ReturnType<typeof getAuthenticatedAccountProfile>>): Profile | null {
  if (!row || !accountStatusSet.has(row.status)) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: publicMediaUrl(row.avatar_path),
    cityId: row.settlement_id,
    bio: row.bio,
    verified: Boolean(row.verified_at),
    language: row.language_code === "kk" ? "kk" : "ru",
    accountStatus: row.status as AccountStatus,
    contactPhone: row.contact_phone_e164,
  };
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const record = error as { name?: unknown; code?: unknown; status?: unknown };
  return {
    name: typeof record.name === "string" ? record.name : "Error",
    ...(typeof record.code === "string" ? { code: record.code } : {}),
    ...(typeof record.status === "number" ? { status: record.status } : {}),
  };
}

export function logAuthContextError(
  scope: Parameters<SafeAuthLogger>[0]["scope"],
  error: unknown,
) {
  const details = errorDetails(error);
  console.error("[marketo-auth] request failed", { scope, ...details });
}

export function createAuthContextError(isAuthenticated: boolean, user: User | null = null): CurrentAuthContext {
  return {
    status: "error",
    user: user ? publicUser(user) : null,
    profile: null,
    roles: [],
    isAuthenticated,
    errorCode: "AUTH_CONTEXT_UNAVAILABLE",
  };
}

export function isAuthSessionMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate.name === "AuthSessionMissingError"
    || (typeof candidate.message === "string" && /auth session missing/i.test(candidate.message));
}

export async function resolveCurrentAuthContext(
  client: MarketoSupabaseClient,
  logger: SafeAuthLogger = ({ scope, ...details }) => console.error("[marketo-auth] request failed", { scope, ...details }),
): Promise<CurrentAuthContext> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError && !isAuthSessionMissing(authError)) {
    logger({ scope: "auth", ...errorDetails(authError) });
    return createAuthContextError(false);
  }
  if (!authData.user) {
    return { status: "anonymous", user: null, profile: null, roles: [], isAuthenticated: false };
  }

  const user = authData.user;
  try {
    const [profileRow, roleResult] = await Promise.all([
      getAuthenticatedAccountProfile(client),
      client.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    if (roleResult.error) {
      logger({ scope: "roles", ...errorDetails(roleResult.error) });
      return createAuthContextError(true, user);
    }
    const profile = mapProfile(profileRow);
    if (!profile) {
      logger({ scope: "profile", name: "ProfileMissingError", code: "PROFILE_MISSING" });
      return createAuthContextError(true, user);
    }
    const roles = (roleResult.data ?? [])
      .map((row) => row.role)
      .filter((role): role is AuthRole => authRoleSet.has(role));
    return {
      status: "authenticated",
      user: publicUser(user),
      profile,
      accountStatus: profile.accountStatus,
      roles: [...new Set(roles)],
      isAuthenticated: true,
    };
  } catch (error) {
    logger({ scope: "profile", ...errorDetails(error) });
    return createAuthContextError(true, user);
  }
}

export function hasRole(context: CurrentAuthContext, role: AuthRole) {
  return context.status === "authenticated"
    && context.accountStatus === "active"
    && context.roles.includes(role);
}

export function hasAnyRole(context: CurrentAuthContext, roles: readonly AuthRole[]) {
  return context.status === "authenticated"
    && context.accountStatus === "active"
    && roles.some((role) => context.roles.includes(role));
}
