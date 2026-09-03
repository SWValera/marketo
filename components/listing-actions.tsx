"use client";

import { Flag, Heart, Phone, Share2 } from "lucide-react";
import { type FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import {
  loadFavoriteStore,
  readFavoriteStore,
  readServerFavoriteStore,
  subscribeFavoriteStore,
  toggleFavoriteListing,
} from "@/components/favorite-store";
import { useI18n } from "@/components/i18n-provider";
import { createReport } from "@/lib/data/supabase/moderation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type ListingActionsProps = {
  listingId: string;
  listingSlug: string;
  title: string;
  contactPhone?: string | null;
};

export function ListingActions({ listingId, listingSlug, title, contactPhone }: ListingActionsProps) {
  const { t } = useI18n();
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [status, setStatus] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [reportPending, setReportPending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportReason, setReportReason] = useState("listing.spam");
  const [reportDetails, setReportDetails] = useState("");
  const favoriteStore = useSyncExternalStore(subscribeFavoriteStore, readFavoriteStore, readServerFavoriteStore);
  const favorite = favoriteStore.ids.has(listingId);

  useEffect(() => {
    void loadFavoriteStore();
  }, []);

  async function toggleFavorite() {
    if (favoritePending) return;
    setFavoritePending(true);
    const result = await toggleFavoriteListing(listingId);
    setFavoritePending(false);
    if (result === "authentication_required") {
      window.location.assign(`/login?next=${encodeURIComponent(`/listing/${listingSlug}`)}`);
    } else if (result === "error") {
      setStatus(t("listing.favoriteFailed"));
    } else {
      setStatus(t(result === "added" ? "listing.favoriteAdded" : "listing.favoriteRemoved"));
    }
  }

  function revealPhone() {
    if (contactPhone) {
      setPhoneVisible(true);
      setStatus("");
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reportPending || reportSent) return;
    setReportPending(true);
    setStatus("");
    try {
      const client = getSupabaseBrowserClient();
      const userResult = await client.auth.getUser();
      if (userResult.error) throw userResult.error;
      if (!userResult.data.user) {
        window.location.assign(`/login?next=${encodeURIComponent(`/listing/${listingSlug}`)}`);
        return;
      }
      await createReport(client, {
        reporterId: userResult.data.user.id,
        listingId,
        reasonCode: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setReportSent(true);
      setStatus(t("listing.reportSent"));
    } catch {
      setStatus(t("listing.reportFailed"));
    } finally {
      setReportPending(false);
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
    {contactPhone ? <div className="detail-actions">
      {contactPhone ? phoneVisible
        ? <a href={`tel:${contactPhone}`}><Phone size={19} /> {contactPhone}</a>
        : <button type="button" onClick={revealPhone}><Phone size={19} /> {t("listing.showPhone")}</button>
        : null}
    </div> : null}
    <div className="detail-secondary">
      <button type="button" aria-pressed={favorite} disabled={!favoriteStore.ready || favoritePending} onClick={() => void toggleFavorite()}><Heart size={18} fill={favorite ? "currentColor" : "none"} /> {favorite ? t("listing.removeFavorite") : t("listing.favorite")}</button>
      <button type="button" onClick={shareListing}><Share2 size={18} /> {t("listing.share")}</button>
    </div>
    {status ? <p className="inline-feedback" role="status">{status}</p> : null}
    <button className="report-link" type="button" aria-expanded={reportOpen} onClick={() => setReportOpen((value) => !value)}><Flag size={17} /> {t("listing.report")}</button>
    {reportOpen ? reportSent
      ? <div className="report-prompt" role="status"><p>{t("listing.reportSent")}</p></div>
      : <form className="report-prompt" onSubmit={(event) => void submitReport(event)}>
        <label className="form-field"><span>{t("listing.reportReason")}</span><select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
          <option value="listing.spam">{t("listing.reportReasonSpam")}</option>
          <option value="listing.fraud">{t("listing.reportReasonFraud")}</option>
          <option value="listing.prohibited">{t("listing.reportReasonProhibited")}</option>
          <option value="listing.other">{t("listing.reportReasonOther")}</option>
        </select></label>
        <label className="form-field"><span>{t("listing.reportDetails")}</span><textarea maxLength={4000} rows={3} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} /></label>
        <button className="secondary-button" type="submit" disabled={reportPending}>{reportPending ? t("common.loading") : t("listing.reportSubmit")}</button>
      </form> : null}
  </>;
}
