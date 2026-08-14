"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function PwaRuntime() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloading = false;
    let registration: ServiceWorkerRegistration | undefined;

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    const checkForUpdate = () => registration?.update().catch(() => undefined);
    const onVisibility = () => document.visibilityState === "visible" && checkForUpdate();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibility);

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
      registration = nextRegistration;
      if (registration.waiting) setWaitingWorker(registration.waiting);
      checkForUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration?.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
        });
      });
    }).catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
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
    <div><strong>Доступна новая версия Marketo</strong><small>Обновите приложение, чтобы увидеть последние изменения.</small></div>
    <button type="button" className="pwa-update-action" disabled={updating} onClick={activateUpdate}>{updating ? "Обновляем…" : "Обновить"}</button>
    <button type="button" className="pwa-update-close" onClick={() => setWaitingWorker(null)} aria-label="Напомнить позже"><X size={18} /></button>
  </aside>;
}
