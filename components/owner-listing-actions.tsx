"use client";

import { AppLink as Link } from "@/components/app-link";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, ExternalLink, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { MyListingSummary } from "@/lib/data/types";

export function OwnerListingActions({ listing }: { listing: Pick<MyListingSummary, "id" | "slug" | "status"> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<"archive" | "sold" | "edit" | "restore" | "delete" | null>(null);
  const [error, setError] = useState("");
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
      if (action === "edit" || action === "restore") router.push(`/publish?listing=${listing.id}`);
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
      {["archived", "expired", "sold"].includes(listing.status) ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("restore")}><RotateCcw size={16} />{t("profile.restoreListing")}</button> : null}
      {listing.status === "active" ? <Link className="secondary-button" href={`/listing/${listing.id}-${listing.slug}`}><ExternalLink size={16} />{t("profile.openListing")}</Link> : null}
      {archivable ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("archive")}><Archive size={16} />{pending === "archive" ? t("profile.actionWorking") : listing.status === "pending" ? t("profile.withdrawListing") : t("profile.archiveListing")}</button> : null}
      {listing.status === "active" ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("sold")}><CheckCircle2 size={16} />{pending === "sold" ? t("profile.actionWorking") : t("profile.markSold")}</button> : null}
      <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("delete")}><Trash2 size={16} />{t("profile.deleteListing")}</button>
    </div>
    {error ? <p className="owner-listing-action-error" role="alert">{error}</p> : null}
  </div>;
}
