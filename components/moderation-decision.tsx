"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_REJECTION_REASONS,
  type ModerationRejectionReason,
} from "@/lib/moderation/policy";

type Submission = "approve" | "reject" | null;

export function ModerationDecision({ listingId }: { listingId: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [reasonCode, setReasonCode] = useState<ModerationRejectionReason | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState<Submission>(null);
  const [feedback, setFeedback] = useState("");

  async function decide(decision: Exclude<Submission, null>) {
    if (submitting) return;
    if (decision === "reject" && !reasonCode) {
      setFeedback(t("admin.reasonRequired"));
      return;
    }
    setSubmitting(decision);
    setFeedback(t("admin.submitting"));
    try {
      const response = await fetch(`/api/admin/listings/${listingId}/moderate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reasonCode: decision === "reject" ? reasonCode : null,
          note: note.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({ error: "moderation_failed" })) as { error?: string };
      if (!response.ok) {
        const messageKey = payload.error === "listing_already_moderated"
          ? "admin.stale"
          : payload.error === "listing_unavailable"
            ? "admin.listingUnavailable"
            : payload.error === "moderation_forbidden" || payload.error === "authentication_required"
              ? "admin.forbidden"
              : payload.error === "invalid_moderation_input" || payload.error === "rejection_reason_required"
                ? "admin.invalidInput"
                : "admin.failed";
        setFeedback(t(messageKey));
        return;
      }
      setFeedback(t("admin.success"));
      router.replace("/admin");
    } catch {
      setFeedback(t("admin.failed"));
    } finally {
      setSubmitting(null);
    }
  }

  return <aside className="dashboard-card moderation-decision">
    <span className="status-badge"><ShieldCheck size={15} /> {t("admin.decision")}</span>
    <h2>{t("admin.result")}</h2>
    <label className="form-field">
      <span>{t("admin.reason")}</span>
      <select
        value={reasonCode}
        onChange={(event) => {
          setReasonCode(event.target.value as ModerationRejectionReason | "");
          setFeedback("");
        }}
        disabled={Boolean(submitting)}
      >
        <option value="">{t("admin.reasonPlaceholder")}</option>
        {MODERATION_REJECTION_REASONS.map((reason) => (
          <option value={reason.code} key={reason.code}>{reason[locale]}</option>
        ))}
      </select>
    </label>
    <label className="form-field">
      <span>{t("admin.note")}</span>
      <textarea
        rows={5}
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        value={note}
        onChange={(event) => { setNote(event.target.value); setFeedback(""); }}
        placeholder={t("admin.notePlaceholder")}
        disabled={Boolean(submitting)}
      />
    </label>
    <button className="approve-action" type="button" disabled={Boolean(submitting)} onClick={() => void decide("approve")}>
      <Check size={18} /> {submitting === "approve" ? t("admin.submitting") : t("admin.approve")}
    </button>
    <button className="reject-action" type="button" disabled={Boolean(submitting)} onClick={() => void decide("reject")}>
      <X size={18} /> {submitting === "reject" ? t("admin.submitting") : t("admin.reject")}
    </button>
    {feedback ? <p className="inline-feedback" role="status" aria-live="polite">{feedback}</p> : null}
  </aside>;
}
