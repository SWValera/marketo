"use client";

import Link from "next/link";
import { Flag, Heart, Phone, Share2 } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-provider";

type ListingActionsProps = {
  listingId: string;
  listingSlug: string;
  title: string;
  contactPhone?: string | null;
};

const FAVORITE_CHANGE_EVENT = "marketo-favorite-change";

export function ListingActions({ listingId, listingSlug, title, contactPhone }: ListingActionsProps) {
  const { t } = useI18n();
  const storageKey = `marketo-favorite:${listingId}`;
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [status, setStatus] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const subscribeFavorite = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(FAVORITE_CHANGE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(FAVORITE_CHANGE_EVENT, notify);
    };
  }, []);
  const readFavorite = useCallback(() => window.localStorage.getItem(storageKey) === "1", [storageKey]);
  const favorite = useSyncExternalStore(subscribeFavorite, readFavorite, () => false);

  function toggleFavorite() {
    const next = !favorite;
    window.localStorage.setItem(storageKey, next ? "1" : "0");
    window.dispatchEvent(new Event(FAVORITE_CHANGE_EVENT));
    setStatus(next ? t("listing.favoriteAdded") : t("listing.favoriteRemoved"));
  }

  function revealPhone() {
    if (contactPhone) {
      setPhoneVisible(true);
      setStatus("");
    } else {
      setStatus(t("listing.phoneUnavailable"));
    }
  }

  async function shareListing() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus(t("listing.linkCopied"));
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setStatus(t("listing.shareFailed"));
    }
  }

  return <>
    <div className="detail-actions">
      {phoneVisible && contactPhone ? <a href={`tel:${contactPhone}`}><Phone size={19} /> {contactPhone}</a> : <button type="button" onClick={revealPhone}><Phone size={19} /> {t("listing.showPhone")}</button>}
      <Link href={`/messages/new?listing=${encodeURIComponent(listingId)}`}><span aria-hidden="true">💬</span> {t("listing.messageSeller")}</Link>
    </div>
    <div className="detail-secondary">
      <button type="button" aria-pressed={favorite} onClick={toggleFavorite}><Heart size={18} fill={favorite ? "currentColor" : "none"} /> {favorite ? t("listing.removeFavorite") : t("listing.favorite")}</button>
      <button type="button" onClick={shareListing}><Share2 size={18} /> {t("listing.share")}</button>
    </div>
    {status ? <p className="inline-feedback" role="status">{status}</p> : null}
    <button className="report-link" type="button" aria-expanded={reportOpen} onClick={() => setReportOpen((value) => !value)}><Flag size={17} /> {t("listing.report")}</button>
    {reportOpen ? <div className="report-prompt" role="status"><p>{t("listing.reportRequiresAccount")}</p><Link className="secondary-button" href={`/login?next=${encodeURIComponent(`/listing/${listingSlug}`)}&intent=report`}>{t("listing.signInToReport")}</Link></div> : null}
  </>;
}
