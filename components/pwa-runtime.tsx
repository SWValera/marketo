"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

export function PwaRuntime() {
  const { t } = useI18n();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloading = false;
    let registration: ServiceWorkerRegistration | undefined;
    let intervalId: number | undefined;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const checkForUpdate = () => registration?.update().catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
      registration = nextRegistration;
      if (registration.waiting) setWaitingWorker(registration.waiting);
      checkForUpdate();
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") checkForUpdate();
      }, UPDATE_INTERVAL_MS);
      registration.addEventListener("updatefound", () => {
        const worker = registration?.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
        });
      });
    }).catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  const activateUpdate = useCallback(() => {
    if (!waitingWorker || updating) return;
    setUpdating(true);
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => window.location.reload(), 4500);
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      window.setTimeout(() => window.location.reload(), 250);
    };
    waitingWorker.postMessage({ type: "SKIP_WAITING" }, [channel.port2]);
  }, [updating, waitingWorker]);

  if (!waitingWorker) return null;
  return <aside className="pwa-update-toast" role="status" aria-live="polite">
    <span className="pwa-update-icon"><RefreshCw size={20} /></span>
    <div><strong>{t("pwa.updateTitle")}</strong><small>{t("pwa.updateNote")}</small></div>
    <button type="button" className="pwa-update-action" disabled={updating} onClick={activateUpdate}>{updating ? t("pwa.updating") : t("pwa.update")}</button>
    <button type="button" className="pwa-update-close" onClick={() => setWaitingWorker(null)} aria-label={t("pwa.later")}><X size={18} /></button>
  </aside>;
}
