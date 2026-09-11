import "server-only";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/auth/redirect";
import { classifyAuthCallbackError } from "@/lib/auth/callback-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { depositRegistrationCode } from "@/lib/auth/registration-handoff";

function authRedirect(target: URL) {
  return NextResponse.redirect(target, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

const otpTypes = new Set<EmailOtpType>(["email", "recovery", "invite", "signup", "magiclink", "email_change"]);

export async function handleEmailAuthCallback(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeInternalPath(requestUrl.searchParams.get("next"), "/profile");
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const rawType = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const recoveryFlow = requestUrl.searchParams.get("flow") === "recovery" || rawType === "recovery";
  const bridge = requestUrl.searchParams.get("bridge");
  const failure = (error: Parameters<typeof classifyAuthCallbackError>[0]) => {
    const target = new URL("/login", requestUrl.origin);
    target.searchParams.set("mode", recoveryFlow ? "recover" : "register");
    target.searchParams.set("auth_error", classifyAuthCallbackError(error));
    target.searchParams.set("next", next);
    return authRedirect(target);
  };
  // Provider errors must never be treated as a successful code/bridge callback.
  if (requestUrl.searchParams.has("error") || requestUrl.searchParams.has("error_code")) {
    return failure({ code: requestUrl.searchParams.get("error_code") ?? "invalid" });
  }
  if (bridge && !recoveryFlow) {
    let received = false;
    try { received = Boolean(code && await depositRegistrationCode(bridge, code)); } catch { /* no callback secrets in logs */ }
    const target = new URL(received ? "/auth/registration-confirmed" : "/login?mode=register&auth_error=expired", requestUrl.origin);
    return authRedirect(target);
  }
  try {
    if (!code && !(tokenHash && rawType && otpTypes.has(rawType))) return failure(null);
    const client = await createSupabaseServerClient();
    const { error } = code
      ? await client.auth.exchangeCodeForSession(code)
      : await client.auth.verifyOtp({ token_hash: tokenHash!, type: rawType! });
    if (error) return failure(error);
  } catch {
    // No tokens, provider bodies or personal data in logs or user-facing errors.
    return failure({ code: "unexpected_failure" });
  }
  if (recoveryFlow) {
    const updatePassword = new URL("/auth/update-password", requestUrl.origin);
    updatePassword.searchParams.set("next", "/login?password_reset=success");
    return authRedirect(updatePassword);
  }
  const success = new URL("/auth/result", requestUrl.origin);
  success.searchParams.set("event", "signup-confirmed");
  success.searchParams.set("next", next);
  return authRedirect(success);
}
