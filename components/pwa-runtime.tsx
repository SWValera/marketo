"use client";

import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

export function PwaRuntime() {
  const { t } = useI18n();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [reloadAvailable, setReloadAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const reloadRequested = useRef(false);
  const activationRequested = useRef(false);
  const newControllerNeedsReload = useRef(false);

  const reloadOnce = useCallback((delay = 0) => {
    if (reloadRequested.current) return;
    reloadRequested.current = true;
    window.setTimeout(() => window.location.reload(), delay);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let controlledAtRegistration = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | undefined;
    let installingWorker: ServiceWorker | null = null;
    let intervalId: number | undefined;
    let updateCheckInFlight = false;

    const onControllerChange = () => {
      // clients.claim() also fires on the first successful installation. That
      // controller is already serving the current document and must not turn a
      // cold PWA install into a second full navigation.
      if (!controlledAtRegistration) {
        controlledAtRegistration = true;
        return;
      }
      if (activationRequested.current) {
        reloadOnce();
      } else {
        // Another tab may have activated the release. Never discard a draft
        // by reloading this tab until the user explicitly accepts the update.
        newControllerNeedsReload.current = true;
        setWaitingWorker(null);
        setReloadAvailable(true);
      }
    };
    const checkForUpdate = () => {
      if (!registration || updateCheckInFlight) return;
      updateCheckInFlight = true;
      void registration.update()
        .catch(() => undefined)
        .finally(() => { updateCheckInFlight = false; });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (newControllerNeedsReload.current) {
        setReloadAvailable(true);
      } else if (registration?.waiting) {
        setWaitingWorker(registration.waiting);
      } else {
        checkForUpdate();
      }
    };
    const onPageShow = () => {
      // iOS can restore an installed PWA from its back/forward cache without
      // producing a visibility transition. Check again whenever that document
      // becomes the active page.
      if (newControllerNeedsReload.current) {
        setReloadAvailable(true);
      } else if (registration?.waiting) {
        setWaitingWorker(registration.waiting);
      } else {
        checkForUpdate();
      }
    };
    const onInstallingStateChange = () => {
      if (installingWorker?.state === "installed" && navigator.serviceWorker.controller) {
        setWaitingWorker(installingWorker);
      }
    };
    const onUpdateFound = () => {
      installingWorker?.removeEventListener("statechange", onInstallingStateChange);
      installingWorker = registration?.installing ?? null;
      installingWorker?.addEventListener("statechange", onInstallingStateChange);
      onInstallingStateChange();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((nextRegistration) => {
      if (!active) return;
      registration = nextRegistration;
      if (registration.waiting) setWaitingWorker(registration.waiting);
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") checkForUpdate();
      }, UPDATE_INTERVAL_MS);
      registration.addEventListener("updatefound", onUpdateFound);
      if (registration.installing) onUpdateFound();
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pageshow", onPageShow);
      window.addEventListener("online", checkForUpdate);
      if (!registration.waiting && controlledAtRegistration) checkForUpdate();
    }).catch(() => undefined);

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
      installingWorker?.removeEventListener("statechange", onInstallingStateChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", checkForUpdate);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [reloadOnce]);

  const activateUpdate = useCallback(() => {
    if (updating) return;
    if (reloadAvailable) {
      setUpdating(true);
      reloadOnce();
      return;
    }
    if (!waitingWorker) return;
    setUpdating(true);
    activationRequested.current = true;
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reloadOnce(), 4500);
    channel.port1.onmessage = () => {
      window.clearTimeout(timeout);
      reloadOnce(250);
    };
    waitingWorker.postMessage({ type: "SKIP_WAITING" }, [channel.port2]);
  }, [reloadAvailable, reloadOnce, updating, waitingWorker]);

  if (!waitingWorker && !reloadAvailable) return null;
  return <aside className="pwa-update-toast" role="status" aria-live="polite">
    <span className="pwa-update-icon"><RefreshCw size={20} /></span>
    <div><strong>{t("pwa.updateTitle")}</strong><small>{t("pwa.updateNote")}</small></div>
    <button type="button" className="pwa-update-action" disabled={updating} onClick={activateUpdate}>{updating ? t("pwa.updating") : t("pwa.update")}</button>
    <button type="button" className="pwa-update-close" onClick={() => { setWaitingWorker(null); setReloadAvailable(false); }} aria-label={t("pwa.later")}><X size={18} /></button>
  </aside>;
}
