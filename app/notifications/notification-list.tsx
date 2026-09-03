"use client";

import { Bell, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppLink as Link } from "@/components/app-link";
import { useI18n } from "@/components/i18n-provider";
import { markNotificationRead } from "@/lib/data/supabase/notifications";
import type { Notification } from "@/lib/data/types";
import { localeTag } from "@/lib/i18n/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const dateFormatter = new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "short", timeStyle: "short" });

  async function markRead(notificationId: string) {
    if (pendingId) return;
    setPendingId(notificationId);
    setErrorId(null);
    try {
      await markNotificationRead(getSupabaseBrowserClient(), notificationId);
      router.refresh();
    } catch {
      setErrorId(notificationId);
    } finally {
      setPendingId(null);
    }
  }

  return <div className="notification-list">{notifications.map((notification) => <article className={notification.read ? "notification-item" : "notification-item is-unread"} key={notification.id}>
    <span aria-hidden="true"><Bell size={20} /></span>
    <div>
      <strong>{notification.title}</strong>
      {notification.body ? <p>{notification.body}</p> : null}
      <time dateTime={notification.createdAt}>{dateFormatter.format(new Date(notification.createdAt))}</time>
    </div>
    <div className="notification-actions">
      {notification.href ? <Link href={notification.href}>{t("notifications.open")}</Link> : null}
      {!notification.read ? <button type="button" disabled={pendingId === notification.id} onClick={() => void markRead(notification.id)}><Check size={16} />{t("notifications.markRead")}</button> : null}
    </div>
    {errorId === notification.id ? <p className="inline-feedback" role="alert">{t("notifications.markReadFailed")}</p> : null}
  </article>)}</div>;
}
