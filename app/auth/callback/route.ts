import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/auth/redirect";
import { classifyAuthCallbackError } from "@/lib/auth/callback-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { depositRegistrationCode } from "@/lib/auth/registration-handoff";

const otpTypes = new Set<EmailOtpType>(["email", "recovery", "invite", "signup", "magiclink", "email_change"]);

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeInternalPath(requestUrl.searchParams.get("next"), "/profile");
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const rawType = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const recoveryFlow = requestUrl.searchParams.get("flow") === "recovery" || rawType === "recovery";
  const bridge = requestUrl.searchParams.get("bridge");
  if (bridge && !recoveryFlow) {
    let received = false;
    try { received = Boolean(code && await depositRegistrationCode(bridge, code)); } catch { /* no callback secrets in logs */ }
    const target = new URL(received ? "/auth/registration-confirmed" : "/login?mode=register&auth_error=expired", requestUrl.origin);
    return NextResponse.redirect(target, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }
  const client = await createSupabaseServerClient();
  let error: { message: string; code?: string } | null = null;

  if (code) {
    ({ error } = await client.auth.exchangeCodeForSession(code));
  } else if (tokenHash && rawType && otpTypes.has(rawType)) {
    ({ error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: rawType }));
  } else {
    error = { message: "missing auth callback token" };
  }

  if (error) {
    const failure = new URL("/login", requestUrl.origin);
    failure.searchParams.set("mode", recoveryFlow ? "recover" : "register");
    failure.searchParams.set("auth_error", classifyAuthCallbackError(error));
    failure.searchParams.set("next", next);
    return NextResponse.redirect(failure);
  }
  if (recoveryFlow) {
    const updatePassword = new URL("/auth/update-password", requestUrl.origin);
    updatePassword.searchParams.set("next", "/login?password_reset=success");
    return NextResponse.redirect(updatePassword);
  }
  const success = new URL("/auth/result", requestUrl.origin);
  success.searchParams.set("event", "signup-confirmed");
  success.searchParams.set("next", next);
  return NextResponse.redirect(success);
}
