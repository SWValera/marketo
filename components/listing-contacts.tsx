"use client";
import { MessageCircle } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { AppLink } from "@/components/app-link";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ListingPhoneButton } from "@/components/listing-phone-button";

type Options = { allow_messages: boolean; allow_phone: boolean };
export function ListingContacts({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ id: string; options: Options | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let live = true;
    let abort: (() => void) | undefined;
    void (async () => {
      try {
        const { data, error } = await Promise.race([
          getSupabaseBrowserClient().rpc("get_listing_contact_options", { target_listing_id: listingId }).abortSignal(controller.signal),
          new Promise<never>((_, reject) => { abort = () => reject(new Error("contacts_timeout")); controller.signal.addEventListener("abort", abort, {once: true}); }),
        ]);
        if (error) throw error;
        const row = data?.[0];
        if (live) setState({ id: listingId, options: row ? { allow_messages: row.allow_messages, allow_phone: row.allow_phone } : null, error: false });
      } catch { if (live) setState({ id: listingId, options: null, error: true }); }
      finally { clearTimeout(timeout); if (abort) controller.signal.removeEventListener("abort", abort); }
    })();
    return () => { live = false; clearTimeout(timeout); controller.abort(); };
  }, [listingId, attempt]);
  const current = state?.id === listingId ? state : null;
  const panel = (children: ReactNode) => <section className="listing-contact-dock" aria-label={t("listing.contactSeller")}>{children}</section>;
  if (!current) return panel(<p className="contact-status" role="status">{t("listing.contactsLoading")}</p>);
  if (current.error) return panel(<div className="contact-status"><p role="status">{t("listing.contactsFailed")}</p><button className="secondary-button" type="button" onClick={() => { setState(null); setAttempt(v => v + 1); }}>{t("common.retry")}</button></div>);
  if (!current.options) return panel(<p className="contact-status">{t("listing.contactsUnavailable")}</p>);
  return panel(<div className="listing-contact-actions">
    {current.options.allow_messages ? <AppLink className="primary-action contact-message-button" aria-label={t("listing.writeSeller")} href={"/messages/new?listing=" + listingId}><MessageCircle size={20} /><span>{t("listing.message")}</span></AppLink> : null}
    {current.options.allow_phone ? <ListingPhoneButton key={listingId} listingId={listingId} /> : null}
    {!current.options.allow_phone && !current.options.allow_messages ? <p className="contact-status">{t("listing.contactsDisabled")}</p> : null}
  </div>);
}
