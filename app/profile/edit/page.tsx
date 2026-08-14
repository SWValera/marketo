import type { Metadata } from "next";
import Link from "next/link";
import { LogIn, Save, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import { LocationPicker } from "@/components/location-picker";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Редактировать профиль", robots: { index: false, follow: false } };

export default function EditProfilePage() {
  return <><Header /><main className="page-shell subpage-main profile-edit-page">
    <PageHeader fallback="/profile" eyebrow="Личный кабинет" title="Редактировать профиль" description="Данные профиля помогают покупателям доверять вашим объявлениям." />
    <form className="dashboard-card profile-edit-form">
      <div className="profile-photo-control"><span><UserRound size={24} /></span><div><strong>Фотография профиля</strong><p>Появится после входа в аккаунт.</p><Link href="/login" className="secondary-button"><LogIn size={17} /> Войти</Link></div></div>
      <div className="form-grid">
        <label className="form-field"><span>Имя <b>*</b></span><input autoComplete="given-name" placeholder="Ваше имя" /></label>
        <label className="form-field"><span>Фамилия</span><input autoComplete="family-name" placeholder="Ваша фамилия" /></label>
        <label className="form-field"><span>Телефон <b>*</b></span><input inputMode="tel" autoComplete="tel" placeholder="+7 700 000 00 00" /></label>
        <div className="form-field"><span>Город <b>*</b></span><LocationPicker allowAll={false} /><small>Используется в профиле и новых объявлениях.</small></div>
        <label className="form-field form-field-wide"><span>О себе</span><textarea rows={5} placeholder="Коротко расскажите о себе" /></label>
      </div>
      <div className="form-actions"><Link href="/profile" className="secondary-button">Отмена</Link><button type="button" className="primary-action" disabled title="Требуется подключение аккаунта"><Save size={18} /> Сохранить изменения</button></div>
    </form>
  </main><MobileNav /></>;
}
