import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { LoginContent } from "@/components/login-content";
import type { AuthMode } from "@/components/auth-form";
import type { AuthCallbackError } from "@/lib/auth/callback-error";
import { safeInternalPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { isAuthSessionMissing } from "@/lib/auth/context-core";
import { AuthReadError } from "@/components/auth-read-error";

export const metadata: Metadata = { title: "Вход и регистрация", robots: { index: false, follow: false } };

type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function LoginPage(props: LoginPageProps) {
  return <LoginPageContent {...props} />;
}

async function LoginPageContent({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawMode = typeof params.mode === "string" ? params.mode : "login";
  const mode: AuthMode = rawMode === "register" || rawMode === "recover" ? rawMode : "login";
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null, "/profile");
  const rawCallbackError = typeof params.auth_error === "string" ? params.auth_error : null;
  const callbackError: AuthCallbackError | null = rawCallbackError === "expired" || rawCallbackError === "invalid" || rawCallbackError === "rate_limited" || rawCallbackError === "unavailable" ? rawCallbackError : null;
  const passwordResetSuccess = params.password_reset === "success";
  if (!passwordResetSuccess && !callbackError) {
    const client = await createSupabaseServerClient();
    const { data, error } = await getRequestUser(client);
    if (error && !isAuthSessionMissing(error)) return <AuthReadError href="/login" />;
    if (data.user) redirect(next);
  }
  return <><Header /><LoginContent mode={mode} next={next} callbackError={callbackError} passwordResetSuccess={passwordResetSuccess} resumePending={!params.mode} /><MobileNav /></>;
}
