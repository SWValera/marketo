import type { Metadata } from "next";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { ProfileEditContent } from "@/components/profile-edit-content";

export const metadata: Metadata = { title: "Редактировать профиль", robots: { index: false, follow: false } };

export default function EditProfilePage() {
  return <><Header /><ProfileEditContent /><MobileNav /></>;
}
