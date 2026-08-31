import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { LoginContent } from "@/components/login-content";
import { MobileNav } from "@/components/mobile-nav";
import { safeInternalPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Новый пароль", robots: { index: false, follow: false } };

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { data, error } = await (await createSupabaseServerClient()).auth.getUser();
  if (error || !data.user) redirect("/login?mode=recover&auth_error=invalid");
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null, "/login?password_reset=success");
  return <><Header /><LoginContent mode="update-password" next={next} /><MobileNav /></>;
}
