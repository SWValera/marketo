"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

export function PwaRuntime() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) setWaitingWorker(registration.waiting);
      registration.update().catch(() => undefined);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(worker);
        });
      });
    }).catch(() => undefined);

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waitingWorker) return null;

  return (
    <aside className="pwa-update-toast" role="status" aria-live="polite">
      <span className="pwa-update-icon"><RefreshCw size={20} /></span>
      <div><strong>Доступна новая версия Marketo</strong><small>Обновите приложение, чтобы увидеть последние изменения.</small></div>
      <button type="button" className="pwa-update-action" onClick={() => waitingWorker.postMessage({ type: "SKIP_WAITING" })}>Обновить</button>
      <button type="button" className="pwa-update-close" onClick={() => setWaitingWorker(null)} aria-label="Напомнить позже"><X size={18} /></button>
    </aside>
  );
}
