"use client";
import { MessageCircle, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLink } from "@/components/app-link";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Options = { allow_messages: boolean; allow_phone: boolean; phone: string | null };
export function ListingContacts({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ id: string; options: Options | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let live = true;
    void (async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().rpc("get_listing_contact_options", { target_listing_id: listingId }).abortSignal(controller.signal);
        if (error) throw error;
        if (live) setState({ id: listingId, options: data?.[0] ?? null, error: false });
      } catch { if (live) setState({ id: listingId, options: null, error: true }); }
      finally { clearTimeout(timeout); }
    })();
    return () => { live = false; clearTimeout(timeout); controller.abort(); };
  }, [listingId, attempt]);
  const current = state?.id === listingId ? state : null;
  const phone = current?.options?.allow_phone && /^\+[1-9][0-9]{7,14}$/.test(current.options.phone ?? "") ? current.options.phone : null;
  if (!current) return <p className="contact-status" role="status">{t("listing.contactsLoading")}</p>;
  if (current.error) return <div className="contact-status"><p role="status">{t("listing.contactsFailed")}</p><button className="secondary-button" type="button" onClick={() => { setState(null); setAttempt(v => v + 1); }}>{t("common.retry")}</button></div>;
  if (!current.options) return <p className="contact-status">{t("listing.contactsUnavailable")}</p>;
  return <div className="listing-contact-actions">
    {current.options.allow_messages ? <AppLink className="primary-button" href={"/messages/new?listing=" + listingId}><MessageCircle size={20} />{t("listing.writeSeller")}</AppLink> : null}
    {phone ? <a className="secondary-button call-seller" href={"tel:" + phone}><Phone size={20} /><span>{t("listing.call")}<small>{phone}</small></span></a> : null}
    {!phone && !current.options.allow_messages ? <p className="contact-status">{t("listing.contactsDisabled")}</p> : null}
  </div>;
}
