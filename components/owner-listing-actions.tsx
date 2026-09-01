"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, ExternalLink, PenLine } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { MyListingSummary } from "@/lib/data/types";

export function OwnerListingActions({ listing }: { listing: Pick<MyListingSummary, "id" | "slug" | "status"> }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState<"archive" | "sold" | null>(null);
  const [error, setError] = useState("");
  const editable = listing.status === "draft" || listing.status === "rejected";
  const archivable = ["draft", "pending", "active", "rejected"].includes(listing.status);

  async function mutate(action: "archive" | "sold") {
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
      router.refresh();
    } catch {
      setError(t("profile.listingActionFailed"));
    } finally {
      setPending(null);
    }
  }

  return <div className="owner-listing-actions">
    <div>
      {editable ? <Link prefetch={false} className="secondary-button" href={`/publish?listing=${listing.id}`}><PenLine size={16} />{t("common.edit")}</Link> : null}
      {listing.status === "active" ? <Link className="secondary-button" href={`/listing/${listing.slug}`}><ExternalLink size={16} />{t("profile.openListing")}</Link> : null}
      {archivable ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("archive")}><Archive size={16} />{pending === "archive" ? t("profile.actionWorking") : listing.status === "pending" ? t("profile.withdrawListing") : t("profile.archiveListing")}</button> : null}
      {listing.status === "active" ? <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void mutate("sold")}><CheckCircle2 size={16} />{pending === "sold" ? t("profile.actionWorking") : t("profile.markSold")}</button> : null}
    </div>
    {error ? <p className="owner-listing-action-error" role="alert">{error}</p> : null}
  </div>;
}
