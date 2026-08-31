import type { CurrentAuthContext } from "./context-core.ts";

export type ModerationAccessDenial = "anonymous" | "forbidden" | "inactive" | "unavailable";

export type ModerationAccessDecision =
  | { allowed: true; context: Extract<CurrentAuthContext, { status: "authenticated" }> }
  | { allowed: false; reason: ModerationAccessDenial; context: CurrentAuthContext };

export function evaluateModerationAccess(context: CurrentAuthContext): ModerationAccessDecision {
  if (context.status === "anonymous") return { allowed: false, reason: "anonymous", context };
  if (context.status === "error") return { allowed: false, reason: "unavailable", context };
  if (context.accountStatus !== "active") return { allowed: false, reason: "inactive", context };
  if (!context.roles.some((role) => role === "moderator" || role === "admin")) {
    return { allowed: false, reason: "forbidden", context };
  }
  return { allowed: true, context };
}
