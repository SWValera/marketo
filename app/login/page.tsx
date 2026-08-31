import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { LoginContent } from "@/components/login-content";
import type { AuthMode } from "@/components/auth-form";
import type { AuthCallbackError } from "@/lib/auth/callback-error";
import { safeInternalPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Вход и регистрация", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawMode = typeof params.mode === "string" ? params.mode : "login";
  const mode: AuthMode = rawMode === "register" || rawMode === "recover" ? rawMode : "login";
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null, "/profile");
  const rawCallbackError = typeof params.auth_error === "string" ? params.auth_error : null;
  const callbackError: AuthCallbackError | null = rawCallbackError === "expired" || rawCallbackError === "invalid" ? rawCallbackError : null;
  const passwordResetSuccess = params.password_reset === "success";
  if (!passwordResetSuccess) {
    try {
      const client = await createSupabaseServerClient();
      const { data } = await client.auth.getUser();
      if (data.user) redirect(next);
    } catch (error) {
      if (error && typeof error === "object" && "digest" in error) throw error;
    }
  }
  return <><Header /><LoginContent mode={mode} next={next} callbackError={callbackError} passwordResetSuccess={passwordResetSuccess} /><MobileNav /></>;
}
