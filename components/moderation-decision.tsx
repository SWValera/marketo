"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

export function ModerationDecision() {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");

  function decide(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      setStatus(t("admin.reasonRequired"));
      return;
    }
    setStatus(t("admin.adapterRequired"));
  }

  return <aside className="dashboard-card moderation-decision">
    <span className="status-badge"><ShieldCheck size={15} /> {t("admin.decision")}</span>
    <h2>{t("admin.result")}</h2>
    <label className="form-field"><span>{t("admin.comment")}</span><textarea rows={5} value={comment} onChange={(event) => { setComment(event.target.value); setStatus(""); }} placeholder={t("admin.commentPlaceholder")} /></label>
    <button className="approve-action" type="button" onClick={() => decide("approve")}><Check size={18} /> {t("admin.approve")}</button>
    <button className="reject-action" type="button" onClick={() => decide("reject")}><X size={18} /> {t("admin.reject")}</button>
    {status ? <p className="inline-feedback" role="status">{status}</p> : null}
  </aside>;
}
