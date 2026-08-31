"use client";

import Link from "next/link";
import { Save, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/components/i18n-provider";
import type { Profile } from "@/lib/data/types";
import { updateCurrentAccountProfile } from "@/lib/data/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return undefined;
}

export function ProfileEditContent({ profile }: { profile: Profile }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [phone, setPhone] = useState(profile.contactPhone ?? "");
  const [cityId, setCityId] = useState(profile.cityId ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhone = normalizePhone(phone);
    if (!displayName.trim() || !cityId) {
      setError(t("profile.requiredError"));
      return;
    }
    if (normalizedPhone === undefined) {
      setError(t("profile.phoneError"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateCurrentAccountProfile(getSupabaseBrowserClient(), {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        language: locale,
        settlementId: cityId,
        contactPhoneE164: normalizedPhone,
      });
      router.replace("/profile");
      router.refresh();
    } catch {
      setError(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return <main className="page-shell subpage-main profile-edit-page">
    <PageHeader fallback="/profile" eyebrow={t("nav.account")} title={t("profile.editTitle")} description={t("profile.editDescription")} />
    <form className="dashboard-card profile-edit-form" onSubmit={(event) => void save(event)}>
      <div className="profile-photo-control"><span><UserRound size={24} /></span><div><strong>{t("profile.photo")}</strong><p>{t("profile.photoAfterLogin")}</p></div></div>
      <div className="form-grid">
        <label className="form-field"><span>{t("profile.firstName")} <b>*</b></span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" maxLength={80} /></label>
        <label className="form-field"><span>{t("profile.phone")}</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+7 700 000 00 00" /></label>
        <div className="form-field"><span>{t("profile.city")} <b>*</b></span><LocationPicker value={cityId} onChange={setCityId} allowAll={false} /><small>{t("profile.cityHint")}</small></div>
        <label className="form-field form-field-wide"><span>{t("profile.about")}</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} maxLength={1000} placeholder={t("profile.aboutPlaceholder")} /></label>
      </div>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <div className="form-actions"><Link href="/profile" className="secondary-button">{t("common.cancel")}</Link><button type="submit" className="primary-action" disabled={saving}><Save size={18} /> {saving ? t("profile.saving") : t("profile.saveChanges")}</button></div>
    </form>
  </main>;
}

