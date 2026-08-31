import "server-only";

import { notFound, redirect } from "next/navigation";
import { getCurrentAuthContext, type CurrentAuthContext } from "@/lib/auth/context";
import {
  evaluateModerationAccess,
  type ModerationAccessDenial,
} from "@/lib/auth/moderation-access-core";

export class ModerationAccessError extends Error {
  readonly reason: ModerationAccessDenial;
  readonly context: CurrentAuthContext;

  constructor(reason: ModerationAccessDenial, context: CurrentAuthContext) {
    super(`Moderation access denied: ${reason}`);
    this.name = "ModerationAccessError";
    this.reason = reason;
    this.context = context;
  }
}

export async function requireModerationAccess() {
  const decision = evaluateModerationAccess(await getCurrentAuthContext());
  if (!decision.allowed) throw new ModerationAccessError(decision.reason, decision.context);
  return decision.context;
}

export async function requireModerationPageAccess(nextPath: string) {
  try {
    return await requireModerationAccess();
  } catch (error) {
    if (!(error instanceof ModerationAccessError)) throw error;
    if (error.reason === "anonymous") redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    if (error.reason === "unavailable") throw error;
    notFound();
  }
}
