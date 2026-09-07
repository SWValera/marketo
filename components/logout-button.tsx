"use client";

import { LogOut } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const flight = useRef(false);

  async function logout() {
    if (flight.current) return;
    flight.current = true;
    setLoading(true);
    setFailed(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        getSupabaseBrowserClient().auth.signOut({ scope: "local" }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("logout_timeout")), 12000); }),
      ]);
      if (result.error) throw result.error;
      // Clear the authenticated document and in-memory chat/profile state as well.
      window.location.replace("/");
    } catch {
      setFailed(true);
    } finally {
      clearTimeout(timer);
      flight.current = false;
      setLoading(false);
    }
  }

  return <><button className={compact ? "logout-button is-compact" : "logout-button"} type="button" onClick={() => void logout()} disabled={loading}><LogOut size={17} />{loading ? t("auth.loggingOut") : t("auth.logout")}</button>{failed ? <span className="owner-listing-action-error" role="alert">{t("auth.errorGeneric")}</span> : null}</>;
}
