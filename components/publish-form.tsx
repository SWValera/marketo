/* eslint-disable @next/next/no-img-element */
"use client";

import {
  AlertTriangle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryPicker } from "@/components/category-picker";
import { useI18n } from "@/components/i18n-provider";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { ReferenceSelect } from "@/components/reference-select";
import { useCategoryAttributes } from "@/components/use-category-attributes";
import type { OwnerDraftBundle, OwnerDraftImage } from "@/lib/data/types";
import { localize } from "@/lib/i18n/config";
import { protectedMediaUrl } from "@/lib/media/public-url";
import { MODERATION_REJECTION_REASONS } from "@/lib/moderation/policy";
import {
  firstPublishErrorStep,
  formatPriceDigits,
  parsePriceDigits,
  priceCaretPosition,
  publishErrorsForStep,
  validatePublishDraft,
  type PublishAttributeValue,
  type PublishAttributeValues,
  type PublishDraftInput,
  type PublishErrorCode,
  type PublishFieldErrors,
} from "@/lib/publish/contract";
import {
  createPublishRecovery,
  readPublishRecovery,
  removePublishRecovery,
  savePublishRecovery,
  type PublishRecoveryDraft,
  type PublishRecoveryFields,
} from "@/lib/publish/recovery";
import { safeBrowserStorage } from "@/lib/browser/storage";
import {
  clearDependentValues,
  getAttributeValidation,
  getDependentParentOptionId,
  isAttributeVisible,
} from "@/lib/reference-data/attributes";
import {
  createCategoryCatalogView,
  getCategoryBySlug,
  getCategoryPath,
  getCategoryPresentation,
  getCategoryRoot,
} from "@/lib/reference-data/catalog";
import type { CategoryReferenceData, ReferenceDataEnvelope } from "@/lib/reference-data/types";

type PhotoPreview = { name: string; url: string; file: File };

const listingPhotoMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const listingPhotoExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

function isAcceptedListingPhoto(file: File) {
  const mimeType = file.type.trim().toLowerCase();
  const extension = file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase();
  return listingPhotoMimeTypes.has(mimeType)
    || ((!mimeType || mimeType === "application/octet-stream") && listingPhotoExtensions.has(extension));
}

type PublishProfileDefaults = {
  displayName: string;
  contactPhone: string;
  cityId: string | null;
};

type ApiErrorBody = {
  error?: string;
  details?: unknown;
};

function safeApiFieldErrors(value: unknown): PublishFieldErrors | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = new Set<PublishErrorCode>([
    "required", "invalid", "min_length", "max_length", "min", "max", "step",
    "invalid_option", "dependent_option", "unknown_attribute",
  ]);
  const result: PublishFieldErrors = {};
  for (const [field, codes] of Object.entries(value)) {
    if (!Array.isArray(codes)) continue;
    const safe = codes.filter((code): code is PublishErrorCode => typeof code === "string" && allowed.has(code as PublishErrorCode));
    if (safe.length > 0) result[field] = [...new Set(safe)];
  }
  return Object.keys(result).length > 0 ? result : null;
}

function rangeValue(value: PublishAttributeValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : { min: "", max: "" };
}

export function PublishForm({
  catalog,
  userId,
  profileDefaults,
  initialDraft = null,
}: {
  catalog: ReferenceDataEnvelope<CategoryReferenceData>;
  userId: string;
  profileDefaults: PublishProfileDefaults;
  initialDraft?: OwnerDraftBundle | null;
}) {
  const { locale, t } = useI18n();
  const catalogView = useMemo(() => createCategoryCatalogView(catalog.data), [catalog.data]);
  const steps = [t("publish.stepCategory"), t("publish.stepDescriptionName"), t("publish.stepPhotos"), t("publish.stepContacts")];
  const storedLocation = useStoredLocation();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categorySlug, setCategorySlug] = useState(initialDraft?.categorySlug ?? "");
  const [cityOverride, setCityOverride] = useState<string | null>(initialDraft?.settlementId ?? profileDefaults.cityId);
  const cityId = cityOverride ?? (storedLocation === "all" ? "" : storedLocation);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [priceDigits, setPriceDigits] = useState(initialDraft?.price === null || initialDraft?.price === undefined ? "" : String(initialDraft.price));
  const [attributes, setAttributes] = useState<PublishAttributeValues>(initialDraft?.attributes ?? {});
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [existingImages, setExistingImages] = useState<OwnerDraftImage[]>(initialDraft?.images ?? []);
  const photosRef = useRef<PhotoPreview[]>([]);
  const priceRef = useRef<HTMLInputElement | null>(null);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const [listingId, setListingId] = useState<string | null>(initialDraft?.id ?? null);
  const [listingStatus, setListingStatus] = useState<"draft" | "rejected">(initialDraft?.status ?? "draft");
  const [rejectionReasonCode, setRejectionReasonCode] = useState(initialDraft?.rejectionReasonCode ?? null);
  const [globalError, setGlobalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PublishFieldErrors>({});
  const [contactName, setContactName] = useState(initialDraft?.contactName ?? profileDefaults.displayName);
  const [contactPhone, setContactPhone] = useState(initialDraft?.contactPhone ?? profileDefaults.contactPhone);
  const [allowMessages, setAllowMessages] = useState(initialDraft?.allowMessages ?? true);
  const [recoveryCandidate, setRecoveryCandidate] = useState<PublishRecoveryDraft | null>(null);
  const [recoveryServerDraft, setRecoveryServerDraft] = useState<OwnerDraftBundle | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState("");

  const category = getCategoryBySlug(catalogView, categorySlug);
  const categoryRoot = getCategoryRoot(catalogView, category);
  const categoryAttributeState = useCategoryAttributes(category?.id);
  const categoryAttributes = categoryAttributeState.data.attributes;
  const visibleCategoryAttributes = useMemo(
    () => categoryAttributes.filter((attribute) => isAttributeVisible(attribute, attributes)),
    [attributes, categoryAttributes],
  );
  const categoryPresentation = getCategoryPresentation(catalogView, category);
  const categoryPath = getCategoryPath(catalogView, category);
  const pageTitle = submitted
    ? t("publish.draftSaved")
    : initialDraft || listingId
      ? t("publish.editPageTitle", { step: steps[step] })
      : t("publish.pageTitle", { step: steps[step] });
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  useEffect(() => {
    let active = true;
    async function loadRecovery() {
      const storage = safeBrowserStorage("localStorage");
      const parsed = readPublishRecovery(storage, userId);
      if (parsed.status === "invalid" || parsed.status === "stale" || parsed.status === "foreign") {
        removePublishRecovery(storage, userId);
        if (parsed.status === "stale" && active) setRecoveryNotice(t("publish.recoveryExpired"));
        if (active) setRecoveryReady(true);
        return;
      }
      if (parsed.status !== "ready") {
        if (active) setRecoveryReady(true);
        return;
      }
      const candidate = parsed.draft;
      let serverDraft: OwnerDraftBundle | null = null;
      if (initialDraft) {
        if (candidate.serverListingId !== initialDraft.id) {
          if (active) setRecoveryReady(true);
          return;
        }
        serverDraft = initialDraft;
      } else if (candidate.serverListingId) {
        try {
          const response = await fetch(`/api/listings/${encodeURIComponent(candidate.serverListingId)}`, {
            headers: { accept: "application/json" },
          });
          if (response.ok) {
            const body = await response.json() as { listing?: OwnerDraftBundle };
            serverDraft = body.listing ?? null;
          } else {
            if (active) setRecoveryNotice(t("publish.recoveryServerStale"));
            if (active) setRecoveryReady(true);
            return;
          }
        } catch {
          if (active) setRecoveryNotice(t("publish.recoveryCheckFailed"));
          if (active) setRecoveryReady(true);
          return;
        }
        if (!serverDraft) {
          if (active) setRecoveryNotice(t("publish.recoveryCheckFailed"));
          if (active) setRecoveryReady(true);
          return;
        }
      }
      if (active) {
        setRecoveryServerDraft(serverDraft);
        setRecoveryCandidate(candidate);
        setRecoveryReady(true);
      }
    }
    void loadRecovery();
    return () => { active = false; };
  }, [initialDraft, t, userId]);

  const recoveryFields = useMemo<PublishRecoveryFields>(() => ({
    categorySlug,
    cityId,
    title,
    description,
    priceDigits,
    attributes,
    contactName,
    contactPhone,
    allowMessages,
  }), [allowMessages, attributes, categorySlug, cityId, contactName, contactPhone, description, priceDigits, title]);

  useEffect(() => {
    if (!recoveryReady || recoveryCandidate || submitted) return;
    const meaningful = Boolean(listingId || categorySlug || title.trim() || description.trim() || Object.keys(attributes).length);
    if (!meaningful) return;
    const timer = window.setTimeout(() => {
      savePublishRecovery(
        safeBrowserStorage("localStorage"),
        createPublishRecovery(userId, recoveryFields, listingId),
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [attributes, categorySlug, description, listingId, recoveryCandidate, recoveryFields, recoveryReady, submitted, title, userId]);

  const summary = [
    category ? categoryPath.map((item) => localize(item.name, locale)).join(" → ") : "",
    title,
    priceDigits ? `${formatPriceDigits(priceDigits)} ₸` : "",
  ].filter(Boolean);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setGlobalError("");
  }

  function setFieldRef(field: string, node: HTMLElement | null) {
    fieldRefs.current[field] = node;
  }

  function focusFirstError(errors: PublishFieldErrors) {
    const field = Object.keys(errors)[0];
    if (!field) return;
    window.setTimeout(() => {
      const container = fieldRefs.current[field];
      const target = container?.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]") ?? container;
      target?.focus();
    }, 0);
  }

  function validationMessage(field: string) {
    const code = fieldErrors[field]?.[0];
    if (!code) return null;
    const attribute = field.startsWith("attributes.")
      ? categoryAttributes.find((candidate) => candidate.key === field.slice("attributes.".length))
      : null;
    const validation = attribute ? getAttributeValidation(attribute) : {};
    if (field === "title" && code === "min_length") return t("publish.validation.titleMin");
    if (field === "title" && code === "max_length") return t("publish.validation.titleMax");
    if (field === "description" && code === "min_length") return t("publish.validation.descriptionMin");
    if (field === "description" && code === "max_length") return t("publish.validation.descriptionMax");
    if (field === "price" && code === "max") return t("publish.validation.priceMax");
    if (field === "contactPhone") return t("publish.validation.phone");
    if (field === "contactName" && code === "max_length") return t("publish.validation.contactNameMax");
    if (code === "required") return t("publish.validation.required");
    if (code === "min") return t("publish.validation.min", { value: validation.min ?? "" });
    if (code === "max") return t("publish.validation.max", { value: validation.max ?? "" });
    if (code === "step") return t("publish.validation.step", { value: validation.step ?? "" });
    if (code === "max_length") return t("publish.validation.maxLength", { value: validation.maxLength ?? "" });
    if (code === "invalid_option") return t("publish.validation.option");
    if (code === "dependent_option") return t("publish.validation.dependentOption");
    return t("publish.validation.invalid");
  }

  function fieldError(field: string) {
    const message = validationMessage(field);
    return message ? <small className="field-error" role="alert">{message}</small> : null;
  }

  function buildDraftInput(): PublishDraftInput {
    const priceOptional = categoryPresentation.priceMode === "free" || categoryPresentation.priceMode === "exchange";
    return {
      categoryId: category?.id ?? "",
      settlementId: cityId,
      title,
      description,
      price: priceOptional || priceDigits === "" ? null : Number(priceDigits),
      currencyCode: "KZT",
      contactName,
      contactPhone,
      allowMessages,
      attributes,
    };
  }

  function validateCurrent(stepToValidate: number, allSteps = false) {
    setGlobalError("");
    if ((allSteps || stepToValidate === 1) && categoryAttributeState.status !== "ready") {
      const message = categoryAttributeState.status === "error"
        ? t("reference.attributesUnavailable")
        : t("reference.attributesLoading");
      setGlobalError(message);
      setStep(1);
      return false;
    }
    const allErrors = validatePublishDraft(buildDraftInput(), {
      priceMode: categoryPresentation.priceMode,
      attributes: categoryAttributes,
      photoCount: existingImages.length + photos.length,
      requirePhotos: true,
    });
    const errors = allSteps ? allErrors : publishErrorsForStep(allErrors, stepToValidate);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const errorStep = allSteps ? firstPublishErrorStep(errors) : stepToValidate;
      setStep(errorStep);
      focusFirstError(errors);
      return false;
    }
    return true;
  }

  function validateAndContinue() {
    if (!validateCurrent(step)) return;
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  function previousStep() {
    setGlobalError("");
    setFieldErrors({});
    setStep((value) => Math.max(0, value - 1));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const available = Math.max(0, 12 - existingImages.length - photos.length);
    const candidates = Array.from(files).slice(0, available);
    if (candidates.length === 0 || candidates.some((file) => !isAcceptedListingPhoto(file) || file.size > 12 * 1024 * 1024)) {
      setGlobalError(t("publish.photoFileError"));
      return;
    }
    const next = candidates.map((file) => ({ name: file.name, url: URL.createObjectURL(file), file }));
    clearFieldError("photos");
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

  function updateAttribute(key: string, value: PublishAttributeValue) {
    setAttributes((current) => clearDependentValues(key, value, categoryAttributes, current));
    clearFieldError(`attributes.${key}`);
  }

  function handlePriceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selection = input.selectionStart ?? input.value.length;
    const digitIndex = input.value.slice(0, selection).replace(/\D/g, "").length;
    const nextDigits = parsePriceDigits(input.value);
    setPriceDigits(nextDigits);
    clearFieldError("price");
    window.requestAnimationFrame(() => {
      const current = priceRef.current;
      if (!current) return;
      const caret = priceCaretPosition(formatPriceDigits(nextDigits), digitIndex);
      current.setSelectionRange(caret, caret);
    });
  }

  function applyRecovery() {
    if (!recoveryCandidate) return;
    const server = recoveryServerDraft;
    if (server) {
      setListingId(server.id);
      setListingStatus(server.status);
      setExistingImages(server.images);
      setRejectionReasonCode(server.rejectionReasonCode);
      setCategorySlug(server.categorySlug);
      setCityOverride(server.settlementId);
      setTitle(server.title);
      setDescription(server.description);
      setPriceDigits(server.price === null ? "" : String(server.price));
      setAttributes(server.attributes);
      setContactName(server.contactName);
      setContactPhone(server.contactPhone);
      setAllowMessages(server.allowMessages);
    }
    const fields = recoveryCandidate.fields;
    setCategorySlug(fields.categorySlug);
    setCityOverride(fields.cityId || null);
    setTitle(fields.title);
    setDescription(fields.description);
    setPriceDigits(fields.priceDigits);
    setAttributes(fields.attributes);
    setContactName(fields.contactName);
    setContactPhone(fields.contactPhone);
    setAllowMessages(fields.allowMessages);
    setRecoveryCandidate(null);
    setRecoveryNotice(t("publish.recoveryRestored"));
  }

  function deleteRecovery() {
    removePublishRecovery(safeBrowserStorage("localStorage"), userId);
    setRecoveryCandidate(null);
    setRecoveryServerDraft(null);
    setRecoveryNotice(t("publish.recoveryDeleted"));
  }

  function reset() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    removePublishRecovery(safeBrowserStorage("localStorage"), userId);
    setPhotos([]);
    setExistingImages([]);
    setSubmitted(false);
    setListingId(null);
    setListingStatus("draft");
    setRejectionReasonCode(null);
    setStep(0);
    setCategorySlug("");
    setCityOverride(profileDefaults.cityId);
    setTitle("");
    setDescription("");
    setPriceDigits("");
    setAttributes({});
    setContactName(profileDefaults.displayName);
    setContactPhone(profileDefaults.contactPhone);
    setAllowMessages(true);
    setGlobalError("");
    setFieldErrors({});
  }

  function applyApiErrors(body: ApiErrorBody) {
    const details = safeApiFieldErrors(body.details);
    if (!details) return false;
    setFieldErrors(details);
    setStep(firstPublishErrorStep(details));
    focusFirstError(details);
    return true;
  }

  async function submitForModeration() {
    if (!validateCurrent(step, true)) return;
    const input = buildDraftInput();
    savePublishRecovery(safeBrowserStorage("localStorage"), createPublishRecovery(userId, recoveryFields, listingId));
    setSaving(true);
    setGlobalError("");
    setFieldErrors({});
    try {
      let currentListingId = listingId;
      const saveResponse = await fetch(currentListingId ? `/api/listings/${currentListingId}` : "/api/listings", {
        method: currentListingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(input),
      });
      const saveBody = await saveResponse.json().catch(() => ({})) as ApiErrorBody & { listing?: { id?: string } };
      if (saveResponse.status === 401) {
        setGlobalError(t("publish.signInToSave"));
        return;
      }
      if (!saveResponse.ok) {
        if (!applyApiErrors(saveBody)) setGlobalError(saveResponse.status === 409 ? t("publish.editStale") : t("publish.saveFailed"));
        return;
      }
      if (!saveBody.listing?.id) {
        setGlobalError(t("publish.saveFailed"));
        return;
      }
      currentListingId = saveBody.listing.id;
      setListingId(currentListingId);
      setListingStatus(listingStatus);
      savePublishRecovery(safeBrowserStorage("localStorage"), createPublishRecovery(userId, recoveryFields, currentListingId));

      if (photos.length > 0) {
        const form = new FormData();
        for (const photo of photos) form.append("photos", photo.file, photo.name);
        const upload = await fetch(`/api/listings/${currentListingId}/images`, {
          method: "POST",
          body: form,
          headers: { accept: "application/json" },
        });
        const uploadBody = await upload.json().catch(() => ({})) as {
          images?: Array<{ id: string; storageKey: string; sortOrder: number }>;
        };
        if (!upload.ok) {
          setStep(2);
          setFieldErrors({ photos: ["invalid"] });
          setGlobalError(upload.status === 400 ? t("publish.photoFileError") : t("publish.photoUploadFailed"));
          return;
        }
        const uploadedImages = (uploadBody.images ?? []).map((image) => ({
          id: image.id,
          url: protectedMediaUrl(image.storageKey) ?? "",
          sortOrder: image.sortOrder,
        }));
        photos.forEach((photo) => URL.revokeObjectURL(photo.url));
        setPhotos([]);
        setExistingImages((current) => [...current, ...uploadedImages].sort((left, right) => left.sortOrder - right.sortOrder));
      }

      const submittedResponse = await fetch(`/api/listings/${currentListingId}/submit`, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      const submittedBody = await submittedResponse.json().catch(() => ({})) as ApiErrorBody;
      if (!submittedResponse.ok) {
        if (!applyApiErrors(submittedBody)) {
          setGlobalError(submittedResponse.status === 409 ? t("publish.editStale") : t("publish.submitFailed"));
        }
        return;
      }
      removePublishRecovery(safeBrowserStorage("localStorage"), userId);
      setSubmitted(true);
    } catch {
      setGlobalError(t("publish.saveFailedOffline"));
    } finally {
      setSaving(false);
    }
  }

  const rejectionReason = MODERATION_REJECTION_REASONS.find((reason) => reason.code === rejectionReasonCode);

  return (
    <>
      <PageHeader
        fallback="/profile"
        eyebrow={initialDraft || listingId ? t("publish.editEyebrow") : t("publish.eyebrow")}
        title={pageTitle}
        description={submitted ? t("publish.savedDescription") : t("publish.stepDescription", { current: step + 1, total: steps.length })}
        onBack={step > 0 && !submitted ? previousStep : undefined}
      />

      {recoveryCandidate ? <section className="publish-recovery" role="status">
        <span><RotateCcw size={22} /></span>
        <div><strong>{t("publish.recoveryTitle")}</strong><p>{t("publish.recoveryNote")}</p></div>
        <button type="button" className="primary-control" onClick={applyRecovery}>{t("publish.recoveryRestore")}</button>
        <button type="button" className="secondary-control" onClick={deleteRecovery}>{t("publish.recoveryDelete")}</button>
      </section> : null}
      {recoveryNotice ? <p className="publish-recovery-notice" role="status">{recoveryNotice}</p> : null}
      {listingStatus === "rejected" && rejectionReason ? <section className="publish-rejection" role="status">
        <AlertTriangle size={22} />
        <div><strong>{t("publish.rejectionTitle")}</strong><p>{locale === "kk" ? rejectionReason.kk : rejectionReason.ru}</p></div>
      </section> : null}

      {submitted ? (
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

          {step === 0 && <div className="publish-panel">
            <div className="panel-heading"><span><Tag size={22} /></span><div><h2>{t("publish.what")}</h2><p>{t("publish.whatNote")}</p></div></div>
            <div className="form-grid">
              <div className="form-field form-field-wide" ref={(node) => setFieldRef("category", node)}>
                <span>{t("publish.stepCategory")} <b>*</b></span>
                <CategoryPicker value={categorySlug} catalog={catalog} onChange={(nextSlug) => {
                  setCategorySlug(nextSlug);
                  setAttributes({});
                  clearFieldError("category");
                }} />
                <small>{t("publish.categoryHint")}</small>
                {fieldError("category")}
              </div>
              <div className="form-field form-field-wide" ref={(node) => setFieldRef("city", node)}>
                <span>{t("publish.city")} <b>*</b></span>
                <LocationPicker value={cityId} onChange={(value) => { setCityOverride(value); clearFieldError("city"); }} allowAll={false} />
                <small>{t("publish.cityHint")}</small>
                {fieldError("city")}
              </div>
            </div>
          </div>}

          {step === 1 && <div className="publish-panel">
            <div className="panel-heading"><span><Tag size={22} /></span><div><h2>{category ? t("publish.details", { category: localize(category.name, locale) }) : t("publish.more")}</h2><p>{categoryPresentation.descriptionHint ? localize(categoryPresentation.descriptionHint, locale) : t("publish.moreNote")}</p></div></div>
            <div className="form-grid">
              <label className="form-field form-field-wide" ref={(node) => setFieldRef("title", node)}>
                <span>{t("publish.title")} <b>*</b></span>
                <input value={title} onChange={(event) => { setTitle(event.target.value); clearFieldError("title"); }} placeholder={categoryPresentation.titlePlaceholder ? localize(categoryPresentation.titlePlaceholder, locale) : t("publish.titlePlaceholder")} maxLength={70} aria-invalid={Boolean(fieldErrors.title)} />
                <small>{t("publish.titleCounter", { count: title.length })}</small>
                {fieldError("title")}
              </label>
              {categoryPresentation.priceMode !== "free" && categoryPresentation.priceMode !== "exchange" ? <label className="form-field" ref={(node) => setFieldRef("price", node)}>
                <span>{categoryPresentation.priceMode === "salary" ? t("publish.salary") : categoryRoot?.slug === "services" ? t("publish.priceFrom") : t("publish.price")} <b>*</b></span>
                <span className="price-input"><input ref={priceRef} inputMode="numeric" value={formatPriceDigits(priceDigits)} onChange={handlePriceChange} placeholder="150 000" aria-invalid={Boolean(fieldErrors.price)} /><b>₸</b></span>
                {fieldError("price")}
              </label> : null}
              {categoryAttributeState.status === "loading" ? <p className="filter-reference-state form-field-wide">{t("reference.attributesLoading")}</p> : null}
              {categoryAttributeState.status === "error" ? <p className="filter-reference-state is-error form-field-wide">{t("reference.attributesUnavailable")}</p> : null}
              {visibleCategoryAttributes.map((attribute) => {
                const validation = getAttributeValidation(attribute);
                const field = `attributes.${attribute.key}`;
                if (attribute.dataType === "select" || attribute.dataType === "multiselect") {
                  const selected = attributes[attribute.key];
                  return <div className="form-field" key={attribute.id} ref={(node) => setFieldRef(field, node)}>
                    <span>{localize(attribute.label, locale)}{attribute.required ? " *" : ""}</span>
                    <ReferenceSelect
                      attribute={attribute}
                      value={typeof selected === "string" ? selected : ""}
                      multipleValues={Array.isArray(selected) ? selected : []}
                      parentOptionId={getDependentParentOptionId(attribute, categoryAttributes, attributes)}
                      onChange={(value) => updateAttribute(attribute.key, value)}
                      onMultipleChange={(value) => updateAttribute(attribute.key, value)}
                    />
                    {fieldError(field)}
                  </div>;
                }
                if (attribute.dataType === "boolean") {
                  const value = attributes[attribute.key];
                  return <label className="form-field" key={attribute.id} ref={(node) => setFieldRef(field, node)}>
                    <span>{localize(attribute.label, locale)}{attribute.required ? " *" : ""}</span>
                    <select value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => {
                      if (event.target.value === "") {
                        setAttributes((current) => {
                          const next = { ...current };
                          delete next[attribute.key];
                          return next;
                        });
                      } else updateAttribute(attribute.key, event.target.value === "true");
                      clearFieldError(field);
                    }} aria-invalid={Boolean(fieldErrors[field])}>
                      <option value="">{t("common.selectValue")}</option>
                      <option value="true">{t("common.yes")}</option>
                      <option value="false">{t("common.no")}</option>
                    </select>
                    {fieldError(field)}
                  </label>;
                }
                if (attribute.dataType === "range") {
                  const value = rangeValue(attributes[attribute.key]);
                  return <div className="form-field" key={attribute.id} ref={(node) => setFieldRef(field, node)}>
                    <span>{localize(attribute.label, locale)}{attribute.unit ? `, ${localize(attribute.unit, locale)}` : ""}{attribute.required ? " *" : ""}</span>
                    <div className="range-inputs">
                      <input type="number" inputMode="decimal" min={validation.min} max={validation.max} step={validation.step} value={String(value.min)} placeholder={t("catalog.priceFrom")} onChange={(event) => updateAttribute(attribute.key, { ...value, min: event.target.value })} aria-invalid={Boolean(fieldErrors[field])} />
                      <input type="number" inputMode="decimal" min={validation.min} max={validation.max} step={validation.step} value={String(value.max)} placeholder={t("catalog.to")} onChange={(event) => updateAttribute(attribute.key, { ...value, max: event.target.value })} aria-invalid={Boolean(fieldErrors[field])} />
                    </div>
                    {fieldError(field)}
                  </div>;
                }
                return <label className="form-field" key={attribute.id} ref={(node) => setFieldRef(field, node)}>
                  <span>{localize(attribute.label, locale)}{attribute.unit ? `, ${localize(attribute.unit, locale)}` : ""}{attribute.required ? " *" : ""}</span>
                  <input type={attribute.dataType === "date" ? "date" : attribute.dataType === "number" ? "number" : "text"} inputMode={attribute.dataType === "number" ? "decimal" : "text"} min={validation.min} max={validation.max} step={validation.step} maxLength={validation.maxLength} value={String(attributes[attribute.key] ?? "")} onChange={(event) => updateAttribute(attribute.key, event.target.value)} aria-invalid={Boolean(fieldErrors[field])} />
                  {fieldError(field)}
                </label>;
              })}
              <label className="form-field form-field-wide" ref={(node) => setFieldRef("description", node)}>
                <span>{t("publish.descriptionLabel")} <b>*</b></span>
                <textarea rows={7} value={description} onChange={(event) => { setDescription(event.target.value); clearFieldError("description"); }} placeholder={categoryPresentation.descriptionHint ? localize(categoryPresentation.descriptionHint, locale) : t("publish.descriptionPlaceholder")} maxLength={20_000} aria-invalid={Boolean(fieldErrors.description)} />
                <small>{t("publish.descriptionCounter", { count: description.length })}</small>
                <small>{t("publish.noPhone")}</small>
                {fieldError("description")}
              </label>
            </div>
          </div>}

          {step === 2 && <div className="publish-panel" ref={(node) => setFieldRef("photos", node)}>
            <div className="panel-heading"><span><Camera size={22} /></span><div><h2>{t("publish.addPhotos")}</h2><p>{t("publish.photosNote")}</p></div></div>
            {existingImages.length > 0 ? <div className="existing-photo-grid">{existingImages.map((image, index) => <article key={image.id}><img src={image.url} alt={t("publish.existingPhoto", { count: index + 1 })} />{index === 0 ? <b>{t("publish.mainPhoto")}</b> : null}</article>)}</div> : null}
            <label className="photo-upload"><span className="photo-upload-icon"><ImagePlus size={30} /></span><strong>{t("publish.choosePhotos")}</strong><small>{t("publish.photoLimits")}</small><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={(event) => addPhotos(event.target.files)} /></label>
            {photos.length > 0 && <div className="photo-preview-grid">{photos.map((photo, index) => <article key={`${photo.name}-${index}`}><img src={photo.url} alt={t("publish.preview", { count: index + 1 })} />{existingImages.length === 0 && index === 0 && <b>{t("publish.mainPhoto")}</b>}<div><button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} aria-label={t("publish.moveLeft")}><ChevronLeft size={16} /></button><GripVertical size={16} /><button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} aria-label={t("publish.moveRight")}><ChevronRight size={16} /></button><button type="button" className="remove-photo" onClick={() => removePhoto(index)} aria-label={t("publish.removePhoto")}><Trash2 size={16} /></button></div></article>)}</div>}
            {fieldError("photos")}
            <div className="photo-tips"><ShieldCheck size={19} /><div><strong>{t("publish.photoTip")}</strong><p>{t("publish.photoTipNote")}</p></div></div>
          </div>}

          {step === 3 && <div className="publish-panel">
            <div className="panel-heading"><span><Smartphone size={22} /></span><div><h2>{t("publish.contactTitle")}</h2><p>{t("publish.contactNote")}</p></div></div>
            <div className="form-grid">
              <label className="form-field" ref={(node) => setFieldRef("contactName", node)}><span>{t("profile.firstName")} <b>*</b></span><input value={contactName} onChange={(event) => { setContactName(event.target.value); clearFieldError("contactName"); }} autoComplete="name" placeholder={t("publish.contactNamePlaceholder")} maxLength={80} aria-invalid={Boolean(fieldErrors.contactName)} />{fieldError("contactName")}</label>
              <label className="form-field" ref={(node) => setFieldRef("contactPhone", node)}><span>{t("profile.phone")} <b>*</b></span><input inputMode="tel" value={contactPhone} onChange={(event) => { setContactPhone(event.target.value); clearFieldError("contactPhone"); }} autoComplete="tel" placeholder="+7 700 000 00 00" maxLength={24} aria-invalid={Boolean(fieldErrors.contactPhone)} />{fieldError("contactPhone")}</label>
              <label className="option-row form-field-wide"><input type="checkbox" checked={allowMessages} onChange={(event) => setAllowMessages(event.target.checked)} /><span><strong>{t("publish.allowMessages")}</strong><small>{t("publish.allowMessagesNote")}</small></span></label>
            </div>
            <div className="publish-review"><strong>{t("publish.beforeSend")}</strong><p>{summary.length ? summary.join(" · ") : t("publish.review")}</p></div>
          </div>}

          {globalError && <div className="form-error" role="alert">{globalError}</div>}
          <div className="publish-controls">
            <button type="button" className="secondary-control" disabled={step === 0 || saving} onClick={previousStep}><ChevronLeft size={18} />{t("common.back")}</button>
            {step < steps.length - 1
              ? <button type="button" className="primary-control" onClick={validateAndContinue}>{t("common.next")}<ChevronRight size={18} /></button>
              : <button type="button" className="primary-control" disabled={saving} onClick={() => void submitForModeration()}>{saving ? t("publish.saving") : listingStatus === "rejected" ? t("publish.resubmitForModeration") : t("publish.submitForModeration")}<Check size={18} /></button>}
          </div>
        </div>
      )}
      <p className="publish-security-note">{t("publish.security")}</p>
    </>
  );
}
