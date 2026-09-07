"use client";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/app-link";
import { useI18n } from "@/components/i18n-provider";
import { getOrCreateListingConversation } from "@/lib/data/supabase/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function StartConversation({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const flight = useRef<AbortController | null>(null);
  const [state, setState] = useState<{id: string; busy: boolean; error: "failed" | "self" | "unavailable" | "signin" | null} | null>(null);
  const busy = state?.id === listingId && state.busy;
  const error = state?.id === listingId ? state.error : null;
  useEffect(() => {
    return () => { flight.current?.abort(); flight.current = null; };
  }, [listingId]);
  async function start() {
    if (flight.current) return;
    const controller = new AbortController();
    flight.current = controller; setState({id: listingId, busy: true, error: null});
    const timer = setTimeout(() => controller.abort(), 12000);
    let abort: (() => void) | undefined;
    try {
      const id = await Promise.race([
        getOrCreateListingConversation(getSupabaseBrowserClient(), listingId, controller.signal),
        new Promise<never>((_, reject) => { abort = () => reject(new Error("conversation_timeout")); controller.signal.addEventListener("abort", abort, {once: true}); }),
      ]);
      if (flight.current === controller && !controller.signal.aborted) window.location.assign("/messages/" + id);
    } catch (failure) {
      if (flight.current === controller) {
        const code = (failure as {cause?: {code?: string}})?.cause?.code;
        setState({id: listingId, busy: false, error: code === "22023" ? "self" : code === "PGRST301" ? "signin" : code === "42501" ? "unavailable" : "failed"});
      }
    } finally {
      clearTimeout(timer);
      if (abort) controller.signal.removeEventListener("abort", abort);
      if (flight.current === controller) { setState(previous => previous?.id === listingId ? {...previous, busy: false} : previous); flight.current = null; }
    }
  }
  return <div className="start-conversation">
    <button className="primary-action" type="button" disabled={busy || error === "self"} onClick={() => void start()}><MessageCircle size={20} />{busy ? t("common.loading") : t("messages.start")}</button>
    {error ? <p role="alert">{t(error === "self" ? "messages.startSelf" : error === "unavailable" ? "messages.startUnavailable" : error === "signin" ? "messages.signIn" : "messages.startFailed")}</p> : null}
    {error === "signin" ? <AppLink className="secondary-button" href={"/login?next=" + encodeURIComponent("/messages/new?listing=" + listingId)}>{t("messages.signIn")}</AppLink> : null}
  </div>;
}
