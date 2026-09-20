"use client";

import { Check, Info } from "lucide-react";
import { useId, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { promotionChoices, type PromotionChoice } from "@/lib/publish/promotion-choice";

export function PromotionChooser({ value, onChange, disabled = false }: {
  value: PromotionChoice; onChange: (value: PromotionChoice) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [expanded, setExpanded] = useState<PromotionChoice | null>(null);
  return <fieldset className="publish-promotions" disabled={disabled}>
    <legend>{t("publish.promotionTitle")}</legend>
    <p className="promotion-intro">{t("promotion.intro")}</p>
    <div className="publish-promotion-options">
      {promotionChoices.map((choice) => {
        const open = expanded === choice.value;
        const descriptionId = `${id}-${choice.value}-description`;
        return <div key={choice.value} className={`publish-promotion-option${value === choice.value ? " is-selected" : ""}`}>
          <label className="promotion-choice-label">
            <input type="radio" name={`promotion-${id}`} value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />
            <span className="promotion-choice-content">
              <strong>{t(choice.label)}</strong>
              <small>{t("publish.promotionFree")}</small>
              <span className="promotion-features">{choice.features.map((feature) => <span key={feature}><Check size={15} aria-hidden="true" />{t(feature)}</span>)}</span>
            </span>
          </label>
          <button type="button" className="promotion-info" aria-label={t("promotion.info", { name: t(choice.label) })} aria-expanded={open} aria-controls={descriptionId} onClick={() => setExpanded(open ? null : choice.value)}><Info size={20} aria-hidden="true" /></button>
          <p id={descriptionId} className="promotion-description" hidden={!open}>{t(choice.description)}</p>
        </div>;
      })}
    </div>
  </fieldset>;
}

export function PromotionSubmitActions({ value, onSubmit, disabled = false, saving = false }: {
  value: PromotionChoice; onSubmit: (choice: PromotionChoice | null) => void; disabled?: boolean; saving?: boolean;
}) {
  const { t } = useI18n();
  return <div className="publish-submit-actions" aria-busy={saving}>
    <button type="button" className="publish-advertise promotion-gold-button" disabled={disabled || saving} onClick={() => onSubmit(value)}>{saving ? t("publish.saving") : t("publish.advertise")}</button>
    <button type="button" className="publish-without-promotion" disabled={disabled || saving} onClick={() => onSubmit(null)}>{t("publish.advertiseWithoutPromotion")}</button>
  </div>;
}
