"use client";
import { Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { solvePhoneChallenge } from "@/lib/phone/challenge";

export function ListingPhoneButton({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [error, setError] = useState<"challenge" | "limited" | "unavailable" | "failed" | null>(null);
  const challenge = useRef<HTMLDivElement | null>(null);
  const flight = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { flight.current?.abort(); flight.current = null; setPhone(null); setBusy(false); setError(null); setRetryAt(0); };
    clear();
    // Do not retain a revealed number in a back/forward cache snapshot.
    window.addEventListener("pagehide", clear);
    const restore = (event: PageTransitionEvent) => { if (event.persisted) clear(); };
    window.addEventListener("pageshow", restore);
    return () => { window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", restore); flight.current?.abort(); flight.current = null; };
  }, [listingId]);
  useEffect(() => {
    if (!phone) return;
    const timer = setTimeout(() => setPhone(null), 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [phone]);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(() => {setRetryAt(0);setError(null);},Math.max(0,retryAt-Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);
  async function reveal() {
    if (flight.current) return;
    if (retryAt > Date.now()) return;
    const controller = new AbortController();
    flight.current = controller;
    // Allow time for a human challenge; the number request itself has a short deadline.
    const timeout = setTimeout(() => controller.abort(), 120000);
    setBusy(true); setError(null);
    try {
      const endpoint = `/api/listings/${listingId}/phone`;
      const configuration = await fetch(endpoint, {credentials:"same-origin",cache:"no-store", signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
      const settings = await configuration.json();
      const siteKey = settings && typeof settings === "object" && "siteKey" in settings ? settings.siteKey : null;
      if (controller.signal.aborted) return;
      if (!configuration.ok || typeof siteKey !== "string" || !challenge.current) throw new Error("challenge_unavailable");
      const token = await solvePhoneChallenge(siteKey,listingId,challenge.current,controller.signal);
      if (controller.signal.aborted) return;
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({token}),
      });
      const data = await response.json();
      const phoneValue = data && typeof data === "object" && "phone" in data ? data.phone : null;
      if (controller.signal.aborted) return;
      if (response.status === 403) setError("challenge");
      else if (response.status === 429) {
        setError("limited");
        const retryAfter = data && typeof data === "object" && "retryAfter" in data ? data.retryAfter : null;
        const seconds = typeof retryAfter === "number" && Number.isFinite(retryAfter) ? Math.max(1,Math.min(86400,Math.ceil(retryAfter))) : 60;
        setRetryAt(Date.now()+seconds*1000);
      }
      else if (response.status === 404) setError("unavailable");
      else if (!response.ok || typeof phoneValue !== "string" || !/^\+[1-9][0-9]{7,14}$/.test(phoneValue)) setError("failed");
      else setPhone(phoneValue);
    } catch { if (flight.current === controller) setError("failed"); }
    finally {
      clearTimeout(timeout);
      if (flight.current === controller) { flight.current = null; setBusy(false); }
    }
  }
  const message = error === "challenge" ? t("listing.phoneChallenge")
    : error === "limited" ? t("listing.phoneLimited") : error === "unavailable" ? t("listing.phoneUnavailable") : t("listing.phoneFailed");
  return <div className="listing-phone-control">
    {phone ? <a className="secondary-button call-seller" href={"tel:" + phone}><Phone size={20} /><span>{t("listing.call")}<small>{phone}</small></span></a>
      : <button className="secondary-button" type="button" disabled={busy || retryAt > 0} onClick={reveal}><Phone size={20} />{busy ? t("listing.phoneLoading") : t("listing.call")}</button>}
    <div className={`listing-phone-feedback${busy || error || phone ? " is-visible" : ""}`}>
    <div className="listing-phone-challenge" ref={challenge} />
    {error ? <p className="contact-status" role="status">{message} {retryAt ? t("listing.phoneRetryAt",{time:new Date(retryAt).toLocaleTimeString()}) : null}</p>
      : <p className="contact-status" role="status">{phone ? t("listing.phoneReady") : t("listing.phoneProtected")}</p>}
    </div>
  </div>;
}
