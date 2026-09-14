"use client";
import { Star } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { localeTag } from "@/lib/i18n/config";
import { activateCityPremium, readCityPremiumOffer, CityPremiumRpcError, type CityPremiumResult, type CityPremiumOffer as Offer } from "@/lib/promotions/city-premium";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// Optional service: fetched after publication or on explicit expansion in the profile.
export function CityPremiumOffer({ listingId }: { listingId: string }) {
  const { t, locale } = useI18n();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CityPremiumResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(0);
  const flight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async (signal: AbortSignal) => {
    const request = ++generation.current;
    try {
      const next = await readCityPremiumOffer(getSupabaseBrowserClient(), listingId, signal);
      if (!signal.aborted && request === generation.current) { setOffer(next); setNow(Date.now()); setError(""); setResult(current => current?.status === "ALREADY_ACTIVE" && next.placement?.status === "active" ? current : null); }
    } catch (failure) {
      if (!signal.aborted && request === generation.current) {
        if (failure instanceof CityPremiumRpcError && failure.eligibilityReason) {
          setResult({status:"LISTING_NOT_ELIGIBLE", reason:failure.eligibilityReason}); setError("");
        } else setError(failure instanceof CityPremiumRpcError ? failure.code : "NETWORK");
      }
    }
  }, [listingId]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    const refresh = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void load(controller.signal); } };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load, retry]);
  useEffect(() => {
    const end = Date.parse(offer?.placement?.ends_at ?? "");
    if (!Number.isFinite(end) || offer?.placement?.status !== "active") return;
    const timer = setTimeout(() => { setNow(Date.now()); setRetry(value => value + 1); }, Math.min(Math.max(0, end - Date.now()) + 50, 2147483647));
    return () => clearTimeout(timer);
  }, [offer]);
  async function activate() {
    if (flight.current) return;
    flight.current = true; generation.current++; setBusy(true); setError("");
    try {
      const next = await activateCityPremium(getSupabaseBrowserClient(), listingId);
      setResult(next);
      if (["ACTIVE","ALREADY_ACTIVE","PENDING_APPROVAL"].includes(next.status)) await load(AbortSignal.timeout(12000));
      if (next.status === "NO_SLOTS") setOffer(current => current?.product ? {...current, product:{...current.product, available:0}} : current);
    } catch (failure) {
      if (failure instanceof CityPremiumRpcError && failure.eligibilityReason) setResult({status:"LISTING_NOT_ELIGIBLE",reason:failure.eligibilityReason});
      else setError(failure instanceof CityPremiumRpcError ? failure.code : "NETWORK");
    } finally { flight.current = false; setBusy(false); }
  }
  const product = offer?.product;
  const placement = offer?.placement;
  const active = placement?.status === "active" && Date.parse(placement.ends_at ?? "") > now;
  const full = product?.available === 0;
  const pending = placement?.status === "pending_approval" && !!offer?.listing_pending && !offer.listing_active;
  const blocked = !!result && ["LISTING_NOT_ELIGIBLE","PAYMENT_REQUIRED","DISABLED","RESERVED"].includes(result.status);
  const eligibilityKey = result?.reason === "authentication_required" || result?.reason === "account_unavailable" ? "promotion.authRequired"
    : result?.reason === "listing_expired" ? "promotion.listingExpired"
    : result?.reason === "city_unavailable" ? "promotion.cityUnavailable" : "promotion.listingUnavailable";
  const canActivate = !!product?.enabled && product.price_amount === 0 && (!!offer?.listing_active || !!offer?.listing_pending) && !active && !pending && !full && !blocked && placement?.status !== "reserved";
  return <section className="city-premium-offer" aria-label={t("promotion.title")}>
    <h3><Star size={19} aria-hidden="true" />{t("promotion.title")}</h3>
    <p>{t("promotion.description")}</p>
    {!offer && !error && !result ? <p role="status">{t("common.loading")}…</p> : null}
    {product ? <>
      <dl><div><dt>{t("promotion.city")}</dt><dd>{locale === "kk" ? product.city_kk : product.city_ru}</dd></div>
        <div><dt>{t("promotion.duration")}</dt><dd>{t("promotion.days", {count:product.duration_seconds / 86400})}</dd></div>
        <div><dt>{t("promotion.price")}</dt><dd>{product.price_amount === 0 ? t("promotion.free") : product.price_amount.toLocaleString(localeTag(locale)) + " " + product.currency}</dd></div>
        <div><dt>{t("promotion.available")}</dt><dd>{product.available} / {product.capacity}</dd></div></dl>
      {active ? <p className="promotion-active" role="status">{t("promotion.activeUntil", {date:placement.ends_at ? new Intl.DateTimeFormat(localeTag(locale), {dateStyle:"medium",timeStyle:"short"}).format(new Date(placement.ends_at)) : ""})}</p> : pending ? <div className="promotion-pending" role="status"><strong>{t("promotion.selected")}</strong><p>{t("promotion.pendingApproval", {count:product.duration_seconds / 86400})}</p></div> : <>
        {placement?.status === "expired" || placement?.status === "completed" || (placement?.status === "active" && !active) ? <p>{t("promotion.expired")}</p> : null}
        {full ? <p>{t("promotion.full", {capacity:product.capacity})}</p> : null}
        {offer.listing_pending ? <p>{t("promotion.afterApproval")}</p> : !offer.listing_active ? <p>{t("promotion.listingUnavailable")}</p> : null}
        {placement?.status === "cancelled" && placement.failure_reason ? <p role="status">{t(placement.failure_reason === "capacity_full" ? "promotion.approvalFull" : placement.failure_reason === "moderation_rejected" ? "promotion.approvalRejected" : "promotion.approvalFailed")}</p> : null}
        {product.price_amount > 0 ? <p>{t("promotion.paymentUnavailable")}</p> : null}
        {!product.enabled ? <p>{t("promotion.unavailable")}</p> : null}
        <button type="button" className="primary-control" disabled={!canActivate || busy} onClick={() => void activate()}>
          {busy ? t("common.loading") : full ? t("promotion.noSlots") : t("promotion.activate")}
        </button>
      </>}
    </> : offer ? <p>{t("promotion.unavailable")}</p> : null}
    {result?.status === "NO_SLOTS" ? <p role="status" data-promotion-result="NO_SLOTS">{t("promotion.capacityChanged")}</p> : null}
    {result?.status === "ALREADY_ACTIVE" ? <p role="status" data-promotion-result="ALREADY_ACTIVE">{t("promotion.alreadyActive")}</p> : null}
    {blocked ? <p role="status" data-promotion-result={result?.status}>{t(result?.status === "LISTING_NOT_ELIGIBLE" ? eligibilityKey : result?.status === "PAYMENT_REQUIRED" ? "promotion.paymentUnavailable" : result?.status === "RESERVED" ? "promotion.reserved" : "promotion.unavailable")}</p> : null}
    {error ? <p className="promotion-error" role="alert">{t("promotion.error")} {t("promotion.errorCode",{code:error})}</p> : null}
    {error ? <button type="button" className="secondary-button" disabled={busy} onClick={() => setRetry(value => value + 1)}>{t("common.retry")}</button> : null}
  </section>;
}
export function OwnerCityPremium({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <div className="owner-city-premium"><button className="secondary-button" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}><Star size={17} />{t("promotion.title")}</button>
    {open ? <CityPremiumOffer key={listingId} listingId={listingId} /> : null}</div>;
}
