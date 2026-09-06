"use client";
import { MessageCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getOrCreateListingConversation } from "@/lib/data/supabase/chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function StartConversation({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const flight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function start() {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError(false);
    try {
      const id = await getOrCreateListingConversation(getSupabaseBrowserClient(), listingId);
      window.location.assign("/messages/" + id);
    } catch {
      setError(true); setBusy(false); flight.current = false;
    }
  }
  return <div className="start-conversation">
    <button className="primary-button" type="button" disabled={busy} onClick={() => void start()}><MessageCircle size={20} />{busy ? t("common.loading") : t("messages.start")}</button>
    {error ? <p role="alert">{t("messages.startFailed")}</p> : null}
  </div>;
}
