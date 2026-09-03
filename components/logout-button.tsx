"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setLoading(true);
    setFailed(false);
    try {
      const result = await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      router.replace("/");
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return <><button className={compact ? "logout-button is-compact" : "logout-button"} type="button" onClick={() => void logout()} disabled={loading}><LogOut size={17} />{loading ? t("auth.loggingOut") : t("auth.logout")}</button>{failed ? <span className="owner-listing-action-error" role="alert">{t("auth.errorGeneric")}</span> : null}</>;
}
