import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Save } from "lucide-react";
import { Header } from "@/components/header";
import { LocationPicker } from "@/components/location-picker";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Редактировать профиль", robots: { index: false, follow: false } };

export default function EditProfilePage() {
  return <><Header /><main className="page-shell subpage-main profile-edit-page">
    <PageHeader fallback="/profile" eyebrow="Личный кабинет" title="Редактировать профиль" description="Данные профиля помогают покупателям доверять вашим объявлениям." />
    <form className="dashboard-card profile-edit-form">
      <div className="profile-photo-control"><span>А</span><div><strong>Фотография профиля</strong><p>JPG, PNG или WebP · до 5 МБ</p><button type="button" className="secondary-button"><Camera size={17} /> Изменить фото</button></div></div>
      <div className="form-grid">
        <label className="form-field"><span>Имя <b>*</b></span><input defaultValue="Айдос" autoComplete="given-name" /></label>
        <label className="form-field"><span>Фамилия</span><input defaultValue="С." autoComplete="family-name" /></label>
        <label className="form-field"><span>Телефон <b>*</b></span><input defaultValue="+7 700 123 45 67" inputMode="tel" autoComplete="tel" /></label>
        <div className="form-field"><span>Город <b>*</b></span><LocationPicker allowAll={false} /><small>Используется в профиле и новых объявлениях.</small></div>
        <label className="form-field form-field-wide"><span>О себе</span><textarea rows={5} defaultValue="Отвечаю быстро. Возможен осмотр товара по предварительной договорённости." /></label>
      </div>
      <div className="form-actions"><Link href="/profile" className="secondary-button">Отмена</Link><button type="button" className="primary-action"><Save size={18} /> Сохранить изменения</button></div>
    </form>
  </main><MobileNav /></>;
}
