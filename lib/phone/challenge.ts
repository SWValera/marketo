"use client";
type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
const api = () => (window as Window & {turnstile?: Turnstile}).turnstile;
let loading: Promise<Turnstile> | null = null;
function load(): Promise<Turnstile> {
  const current = api();
  if (current) return Promise.resolve(current);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve,reject) => {
    const script = document.createElement("script");
    const fail = () => {clearTimeout(timer); script.remove(); reject(new Error("challenge_unavailable"));};
    const timer = setTimeout(fail,12000);
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {const ready = api(); if (!ready) {fail();return;} clearTimeout(timer); resolve(ready);};
    document.head.appendChild(script);
  }).catch(error => {loading=null;throw error;});
  return loading;
}
// Loaded on the call click only; every reveal gets a new single-use challenge.
export async function solvePhoneChallenge(siteKey: string, listingId: string, container: HTMLElement, signal: AbortSignal): Promise<string> {
  const turnstile = await load();
  if (signal.aborted) throw new Error("challenge_cancelled");
  return new Promise((resolve,reject) => {
    let widget: string | undefined, settled = false;
    const finish = (token?: string) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort",cancel);
      queueMicrotask(() => {if (widget !== undefined) turnstile.remove(widget);});
      if (token && !signal.aborted) resolve(token); else reject(new Error("challenge_failed"));
    };
    const cancel = () => finish();
    signal.addEventListener("abort",cancel,{once:true});
    try {
      widget = turnstile.render(container, {
        sitekey:siteKey, action:"listing_phone", cData:listingId, appearance:"interaction-only", size:"compact",
        language:"auto", retry:"never", "refresh-expired":"never", "response-field":false,
        callback:(token: string) => finish(token),
        "error-callback":() => {finish();return true;}, "expired-callback":cancel, "timeout-callback":cancel,
      });
    } catch {finish();}
  });
}
