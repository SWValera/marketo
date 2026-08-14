/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  ShieldCheck,
  Smartphone,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { CategoryPicker } from "@/components/category-picker";
import { getCategoryAttributes, getCategoryBySlug } from "@/lib/catalog-config";
import { useI18n } from "@/components/i18n-provider";
import { localeTag, localize } from "@/lib/i18n/config";

type PhotoPreview = { name: string; url: string };

export function PublishForm() {
  const { locale, t } = useI18n();
  const steps = [t("publish.stepCategory"), t("publish.stepDescriptionName"), t("publish.stepPhotos"), t("publish.stepContacts")];
  const [step, setStep] = useState(0);
  const [draftSaved, setDraftSaved] = useState(false);
  const [categorySlug, setCategorySlug] = useState("");
  const storedLocation = useStoredLocation();
  const [cityOverride, setCityOverride] = useState<string | null>(null);
  const cityId = cityOverride ?? (storedLocation === "all" ? "" : storedLocation);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>({});
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const photosRef = useRef<PhotoPreview[]>([]);
  const [error, setError] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const category = getCategoryBySlug(categorySlug);
  const categoryAttributes = getCategoryAttributes(categorySlug);
  const pageTitle = draftSaved ? t("publish.draftSaved") : t("publish.pageTitle", { step: steps[step] });

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const summary = useMemo(() => [
    category ? localize(category.name, locale) : "",
    title,
    price ? `${Number(price).toLocaleString(localeTag(locale))} ₸` : "",
  ].filter(Boolean), [category, locale, price, title]);

  function validateAndContinue() {
    setError("");
    if (step === 0 && (!categorySlug || !cityId)) {
      setError(t("publish.categoryCityError"));
      return;
    }
    if (step === 1 && (!title.trim() || !description.trim() || (!price && category?.priceMode !== "free" && category?.priceMode !== "exchange"))) {
      setError(t("publish.detailsError"));
      return;
    }
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  function previousStep() {
    setError("");
    setStep((value) => Math.max(0, value - 1));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, Math.max(0, 12 - photos.length)).map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...next]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setPhotos((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reset() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setDraftSaved(false);
    setStep(0);
    setCategorySlug("");
    setCityOverride(null);
    setTitle("");
    setDescription("");
    setPrice("");
    setAttributes({});
    setContactName("");
    setContactPhone("");
    setError("");
  }

  return (
    <>
      <PageHeader
        fallback="/profile"
        eyebrow={t("publish.eyebrow")}
        title={pageTitle}
        description={draftSaved ? t("publish.savedDescription") : t("publish.stepDescription", { current: step + 1, total: steps.length })}
        onBack={step > 0 && !draftSaved ? previousStep : undefined}
      />

      {draftSaved ? (
        <div className="publish-success">
          <span><Check size={30} /></span>
          <h2>{t("publish.savedTitle")}</h2>
          <p>{t("publish.savedNote")}</p>
          <div className="publish-summary">{summary.map((item) => <span key={item}>{item}</span>)}</div>
          <button type="button" onClick={reset}>{t("publish.createAnother")}</button>
        </div>
      ) : (
        <div className="publish-card">
          <div className="publish-progress-mobile">
            <div><strong>{t("publish.step", { current: step + 1, total: steps.length })}</strong><span>{steps[step]}</span></div>
            <div><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
          </div>
          <ol className="publish-steps" aria-label={t("publish.stepsAria")}>
            {steps.map((label, index) => (
              <li className={index === step ? "is-current" : index < step ? "is-done" : ""} key={label}>
                <span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Tag size={22} /></span><div><h2>{t("publish.what")}</h2><p>{t("publish.whatNote")}</p></div></div>
              <div className="form-grid">
                <label className="form-field form-field-wide">
                  <span>{t("publish.stepCategory")} <b>*</b></span>
                  <CategoryPicker value={categorySlug} onChange={(nextSlug) => { setCategorySlug(nextSlug); setAttributes({}); setError(""); }} />
                  <small>{t("publish.categoryHint")}</small>
                </label>
                <div className="form-field form-field-wide"><span>{t("publish.city")} <b>*</b></span><LocationPicker value={cityId} onChange={setCityOverride} allowAll={false} /><small>{t("publish.cityHint")}</small></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Tag size={22} /></span><div><h2>{category ? t("publish.details", { category: localize(category.name, locale) }) : t("publish.more")}</h2><p>{category?.descriptionHint ? localize(category.descriptionHint, locale) : t("publish.moreNote")}</p></div></div>
              <div className="form-grid">
                <label className="form-field form-field-wide"><span>{t("publish.title")} <b>*</b></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={category?.titlePlaceholder ? localize(category.titlePlaceholder, locale) : t("publish.titlePlaceholder")} maxLength={70} /><small>{t("publish.titleCounter", { count: title.length })}</small></label>
                {category?.priceMode !== "free" && category?.priceMode !== "exchange" ? <label className="form-field"><span>{category?.priceMode === "salary" ? t("publish.salary") : category?.attributeSet === "service" ? t("publish.priceFrom") : t("publish.price")} <b>*</b></span><input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/\D/g, ""))} placeholder="150 000" /></label> : null}
                {categoryAttributes.map((attribute) => attribute.type === "select" ? <label className="form-field" key={attribute.id}><span>{localize(attribute.label, locale)}{attribute.required ? " *" : ""}</span><div className="select-wrap"><select value={String(attributes[attribute.id] ?? "")} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.id]: event.target.value }))}><option value="">{t("common.selectValue")}</option>{attribute.options?.map((option) => <option value={option.value} key={option.value}>{localize(option.label, locale)}</option>)}</select><ChevronDown size={18} /></div></label> : attribute.type === "checkbox" ? <label className="option-row form-field-wide" key={attribute.id}><input type="checkbox" checked={Boolean(attributes[attribute.id])} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.id]: event.target.checked }))} /><span><strong>{localize(attribute.label, locale)}</strong><small>{t("publish.applicable")}</small></span></label> : <label className="form-field" key={attribute.id}><span>{localize(attribute.label, locale)}{attribute.unit ? `, ${localize(attribute.unit, locale)}` : ""}{attribute.required ? " *" : ""}</span><input inputMode={attribute.type === "number" ? "numeric" : "text"} value={String(attributes[attribute.id] ?? "")} onChange={(event) => setAttributes((current) => ({ ...current, [attribute.id]: event.target.value }))} /></label>)}
                <label className="form-field form-field-wide"><span>{t("publish.stepDescriptionName")} <b>*</b></span><textarea rows={7} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={category?.descriptionHint ? localize(category.descriptionHint, locale) : t("publish.descriptionPlaceholder")} /><small>{t("publish.noPhone")}</small></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Camera size={22} /></span><div><h2>{t("publish.addPhotos")}</h2><p>{t("publish.photosNote")}</p></div></div>
              <label className="photo-upload"><span className="photo-upload-icon"><ImagePlus size={30} /></span><strong>{t("publish.choosePhotos")}</strong><small>{t("publish.photoLimits")}</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addPhotos(event.target.files)} /></label>
              {photos.length > 0 && <div className="photo-preview-grid">{photos.map((photo, index) => <article key={`${photo.name}-${index}`}><img src={photo.url} alt={t("publish.preview", { count: index + 1 })} />{index === 0 && <b>{t("publish.mainPhoto")}</b>}<div><button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} aria-label={t("publish.moveLeft")}><ChevronLeft size={16} /></button><GripVertical size={16} /><button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} aria-label={t("publish.moveRight")}><ChevronRight size={16} /></button><button type="button" className="remove-photo" onClick={() => removePhoto(index)} aria-label={t("publish.removePhoto")}><Trash2 size={16} /></button></div></article>)}</div>}
              <div className="photo-tips"><ShieldCheck size={19} /><div><strong>{t("publish.photoTip")}</strong><p>{t("publish.photoTipNote")}</p></div></div>
            </div>
          )}

          {step === 3 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Smartphone size={22} /></span><div><h2>{t("publish.contactTitle")}</h2><p>{t("publish.contactNote")}</p></div></div>
              <div className="form-grid">
                <label className="form-field"><span>{t("profile.firstName")} <b>*</b></span><input value={contactName} onChange={(event) => setContactName(event.target.value)} autoComplete="name" placeholder={t("publish.contactNamePlaceholder")} /></label>
                <label className="form-field"><span>{t("profile.phone")} <b>*</b></span><input inputMode="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} autoComplete="tel" placeholder="+7 700 000 00 00" /></label>
                <label className="option-row form-field-wide"><input type="checkbox" defaultChecked /><span><strong>{t("publish.allowMessages")}</strong><small>{t("publish.allowMessagesNote")}</small></span></label>
                <label className="option-row form-field-wide"><input type="checkbox" /><span><strong>{t("publish.callHours")}</strong><small>{t("publish.callHoursNote")}</small></span></label>
              </div>
              <div className="publish-review"><strong>{t("publish.beforeSend")}</strong><p>{summary.length ? summary.join(" · ") : t("publish.review")}</p></div>
            </div>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="publish-controls">
            <button type="button" className="secondary-control" disabled={step === 0} onClick={previousStep}><ChevronLeft size={18} />{t("common.back")}</button>
            {step < steps.length - 1 ? <button type="button" className="primary-control" onClick={validateAndContinue}>{t("common.next")}<ChevronRight size={18} /></button> : <button type="button" className="primary-control" onClick={() => { if (!contactName.trim() || contactPhone.replace(/\D/g, "").length < 10) { setError(t("publish.contactsError")); return; } window.localStorage.setItem("marketo-listing-draft", JSON.stringify({ categorySlug, cityId, title, description, price, attributes, contactName, contactPhone })); setDraftSaved(true); }}>{t("publish.saveDraft")}<Check size={18} /></button>}
          </div>
        </div>
      )}
      <p className="publish-security-note">{t("publish.security")}</p>
    </>
  );
}
