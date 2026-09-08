import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { LoginContent } from "@/components/login-content";
import { MobileNav } from "@/components/mobile-nav";
import { safeInternalPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { isAuthSessionMissing } from "@/lib/auth/context-core";
import { AuthReadError } from "@/components/auth-read-error";

export const metadata: Metadata = { title: "Новый пароль", robots: { index: false, follow: false } };

type UpdatePasswordPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function UpdatePasswordPage(props: UpdatePasswordPageProps) {
  return <UpdatePasswordPageContent {...props} />;
}

async function UpdatePasswordPageContent({ searchParams }: UpdatePasswordPageProps) {
  const params = await searchParams;
  const { data, error } = await getRequestUser(await createSupabaseServerClient());
  if (error && !isAuthSessionMissing(error)) return <AuthReadError href="/auth/update-password" />;
  if (error || !data.user) redirect("/login?mode=recover&auth_error=invalid");
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null, "/login?password_reset=success");
  return <><Header /><LoginContent mode="update-password" next={next} /><MobileNav /></>;
}
