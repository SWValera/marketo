"use client";

import Link from "next/link";
import { LogIn, Save, UserRound } from "lucide-react";
import { LocationPicker } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/components/i18n-provider";

export function ProfileEditContent() {
  const { t } = useI18n();

  return <main className="page-shell subpage-main profile-edit-page">
    <PageHeader fallback="/profile" eyebrow={t("nav.account")} title={t("profile.editTitle")} description={t("profile.editDescription")} />
    <form className="dashboard-card profile-edit-form">
      <div className="profile-photo-control"><span><UserRound size={24} /></span><div><strong>{t("profile.photo")}</strong><p>{t("profile.photoAfterLogin")}</p><Link href="/login" className="secondary-button"><LogIn size={17} /> {t("profile.signIn")}</Link></div></div>
      <div className="form-grid">
        <label className="form-field"><span>{t("profile.firstName")} <b>*</b></span><input autoComplete="given-name" placeholder={t("profile.firstNamePlaceholder")} /></label>
        <label className="form-field"><span>{t("profile.lastName")}</span><input autoComplete="family-name" placeholder={t("profile.lastNamePlaceholder")} /></label>
        <label className="form-field"><span>{t("profile.phone")} <b>*</b></span><input inputMode="tel" autoComplete="tel" placeholder="+7 700 000 00 00" /></label>
        <div className="form-field"><span>{t("profile.city")} <b>*</b></span><LocationPicker allowAll={false} /><small>{t("profile.cityHint")}</small></div>
        <label className="form-field form-field-wide"><span>{t("profile.about")}</span><textarea rows={5} placeholder={t("profile.aboutPlaceholder")} /></label>
      </div>
      <div className="form-actions"><Link href="/profile" className="secondary-button">{t("common.cancel")}</Link><button type="button" className="primary-action" disabled title={t("profile.accountRequired")}><Save size={18} /> {t("profile.saveChanges")}</button></div>
    </form>
  </main>;
}
