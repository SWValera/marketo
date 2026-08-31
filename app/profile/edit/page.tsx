import type { Metadata } from "next";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { ProfileEditContent } from "@/components/profile-edit-content";
import { profileRepository } from "@/lib/data/repositories";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getServerI18n } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Редактировать профиль", robots: { index: false, follow: false } };

export default async function EditProfilePage() {
  const authContext = await profileRepository.current();
  if (authContext.status === "anonymous") redirect("/login?next=/profile/edit");
  if (authContext.status === "error") {
    const { t } = await getServerI18n();
    return <><Header /><main className="page-shell subpage-main profile-edit-page"><EmptyState icon={<AlertTriangle size={30} />} title={t("profile.loadErrorTitle")} description={t("profile.loadErrorNote")} actionHref="/profile/edit?retry=1" actionLabel={t("common.retry")} /></main><MobileNav /></>;
  }
  return <><Header /><ProfileEditContent profile={authContext.profile} /><MobileNav /></>;
}
