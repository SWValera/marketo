"use client";

import { AppLink as Link } from "@/components/app-link";
import { useRouter } from "next/navigation";
import { Archive, Megaphone, PenLine, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { OwnerPromotionDialog } from "@/components/owner-promotion-dialog";
import { useI18n } from "@/components/i18n-provider";
import type { MyListingSummary } from "@/lib/data/types";

export function OwnerListingActions({ listing }: { listing: Pick<MyListingSummary, "id" | "slug" | "status"> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<"archive" | "edit" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const closePromotion = useCallback(() => setPromotionOpen(false), []);
  const editable = listing.status === "draft" || listing.status === "rejected";
  const archivable = ["draft", "pending", "active", "rejected"].includes(listing.status);

  async function mutate(action: NonNullable<typeof pending>) {
    if (pending) return;
    if (action === "delete" && !window.confirm(t("profile.deleteConfirm"))) return;
    if (action === "edit" && ["active", "pending"].includes(listing.status) && !window.confirm(t("profile.editWithdrawConfirm"))) return;
    setPending(action);
    setError("");
    try {
      const response = await fetch(`/api/listings/${listing.id}/${action}`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      if (response.status === 401) {
        router.push("/login?next=/profile");
        return;
      }
      if (!response.ok) {
        setError(response.status === 409 ? t("profile.listingActionStale") : t("profile.listingActionFailed"));
        if (response.status === 409) router.refresh();
        return;
      }
      if (action === "edit") router.push(`/publish?listing=${listing.id}`);
      else router.refresh();
    } catch {
      setError(t("profile.listingActionFailed"));
    } finally {
      setPending(null);
    }
  }

  return <div className="owner-listing-actions">
    <div>
      {editable ? <Link prefetch={false} className="secondary-button" href={`/publish?listing=${listing.id}`}><PenLine size={16} />{t("common.edit")}</Link> : null}
      {!editable ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("edit")}><PenLine size={16} />{t("common.edit")}</button> : null}
      <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("delete")}><Trash2 size={16} />{t("profile.deleteListing")}</button>
      <button type="button" className="secondary-button" disabled={pending !== null || !archivable} onClick={() => void mutate("archive")}><Archive size={16} />{pending === "archive" ? t("profile.actionWorking") : t("profile.archiveListing")}</button>
      <button type="button" className="promotion-gold-button" disabled={pending !== null || !archivable} onClick={() => { setNotice(""); setPromotionOpen(true); }}><Megaphone size={16} />{t("publish.advertise")}</button>
    </div>
    {promotionOpen ? <OwnerPromotionDialog listingId={listing.id} onClose={closePromotion} onSaved={(choice) => {
      setPromotionOpen(false);
      setNotice(t(choice === null ? "promotion.removed" : "promotion.saved"));
    }} /> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p className="owner-listing-action-error" role="alert">{error}</p> : null}
  </div>;
}
