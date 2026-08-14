import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Настройки", robots: { index: false, follow: false } };

export default function SettingsPage() {
  return (
    <DashboardShell active="/settings" title="Настройки" description="Управляйте уведомлениями, приватностью и параметрами аккаунта.">
      <section className="dashboard-card settings-grid" aria-label="Настройки аккаунта">
        <div className="settings-row"><div><strong>Сообщения от покупателей</strong><span>Уведомлять о новых сообщениях и предложениях</span></div><button className="switch on" aria-label="Сообщения включены" aria-pressed="true" /></div>
        <div className="settings-row"><div><strong>Статус объявлений</strong><span>Сообщать о публикации, модерации и завершении срока</span></div><button className="switch on" aria-label="Статусы включены" aria-pressed="true" /></div>
        <div className="settings-row"><div><strong>Рекомендации Marketo</strong><span>Персональные подборки по вашим интересам</span></div><button className="switch" aria-label="Рекомендации выключены" aria-pressed="false" /></div>
        <div className="settings-row"><div><strong>Язык интерфейса</strong><span>Русский · Қазақша будет доступен в следующем обновлении</span></div><button className="secondary-button">Изменить</button></div>
        <div className="settings-row"><div><strong>Выйти из аккаунта</strong><span>На этом устройстве потребуется повторный вход по номеру телефона</span></div><button className="secondary-button danger-button">Выйти</button></div>
      </section>
    </DashboardShell>
  );
}
