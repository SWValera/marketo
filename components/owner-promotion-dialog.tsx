"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";
import { PromotionChooser, PromotionSubmitActions } from "@/components/promotion-chooser";
import { activateModalFocus } from "@/lib/browser/modal";
import { isPromotionChoice, type PromotionChoice } from "@/lib/publish/promotion-choice";

export function OwnerPromotionDialog({ listingId, onClose, onSaved }: {
  listingId: string; onClose: () => void; onSaved: (choice: PromotionChoice | null) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [choice, setChoice] = useState<PromotionChoice>("accelerated");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => { if (!inFlight.current) onClose(); }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/listings/" + listingId + "/promotion-choice", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body || typeof body !== "object" || !("promotionChoice" in body) || (body.promotionChoice !== null && !isPromotionChoice(body.promotionChoice))) throw new Error("lookup failed");
        setChoice(body.promotionChoice ?? "accelerated");
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [listingId]);

  useEffect(() => {
    if (!dialog.current) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const releaseFocus = activateModalFocus(dialog.current, close);
    return () => { releaseFocus(); document.body.style.overflow = overflow; };
  }, [close]);

  async function save(value: PromotionChoice | null) {
    if (inFlight.current || loading || loadFailed) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/listings/" + listingId + "/promotion-choice", {
        method: "PUT", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ promotionChoice: value }),
      });
      if (!response.ok) throw new Error("save failed");
      onSaved(value);
    } catch {
      setError(t("promotion.failed"));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return createPortal(<div className="promotion-dialog-overlay">
    <button type="button" className="promotion-dialog-backdrop" tabIndex={-1} aria-label={t("common.close")} onClick={close} />
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="promotion-dialog" tabIndex={-1}>
      <div className="promotion-dialog-heading"><h2 id={titleId}>{t("publish.promotionTitle")}</h2><button type="button" className="icon-button" aria-label={t("common.close")} disabled={saving} onClick={close}><X size={22} /></button></div>
      {loading ? <p role="status">{t("promotion.loading")}</p> : loadFailed ? <p role="alert">{t("promotion.loadFailed")}</p> : <>
        <PromotionChooser value={choice} onChange={setChoice} disabled={saving} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <PromotionSubmitActions value={choice} onSubmit={(value) => void save(value)} saving={saving} />
      </>}
    </div>
  </div>, document.body);
}
