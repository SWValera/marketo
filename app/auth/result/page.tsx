import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthResultContent } from "@/components/auth-result-content";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { safeInternalPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Подтверждение аккаунта", robots: { index: false, follow: false } };

type AuthResultPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function AuthResultPage(props: AuthResultPageProps) {
  return <AuthResultPageContent {...props} />;
}

async function AuthResultPageContent({ searchParams }: AuthResultPageProps) {
  const params = await searchParams;
  if (params.event !== "signup-confirmed") redirect("/login?mode=register&auth_error=invalid");
  const { data, error } = await (await createSupabaseServerClient()).auth.getUser();
  if (error || !data.user) redirect("/login?mode=register&auth_error=invalid");
  const next = safeInternalPath(typeof params.next === "string" ? params.next : null, "/profile");
  return <><Header /><AuthResultContent next={next} /><MobileNav /></>;
}
