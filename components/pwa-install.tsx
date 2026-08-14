"use client";

import { Check, Download, MoreVertical, Share, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n-provider";

type InstallChoice = "ios" | "android" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstall() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<InstallChoice>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const standaloneTimer = window.setTimeout(() => setInstalled(standalone), 0);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setOpen(false);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.clearTimeout(standaloneTimer);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const showInstall = useCallback(() => {
    setChoice(null);
    setOpen(true);
  }, []);

  const installOnAndroid = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setOpen(false);
    setInstallPrompt(null);
  };

  if (installed) {
    return (
      <span className="pwa-installed" title={t("pwa.installedTitle")}>
        <Check size={17} aria-hidden="true" />
        <span>{t("pwa.installed")}</span>
      </span>
    );
  }

  return (
    <>
      <button className="install-header-button" type="button" onClick={showInstall}>
        <span className="install-header-label">
          <strong>{t("pwa.install")}</strong>
          <small>{t("pwa.onPhone")}</small>
        </span>
        <span className="install-header-icon" aria-hidden="true">
          <Download size={22} />
        </span>
      </button>

      {open && createPortal((
        <div className="install-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="install-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="install-close" type="button" aria-label={t("common.close")} onClick={() => setOpen(false)}>
              <X size={21} />
            </button>

            <div className="install-modal-brand" aria-hidden="true">M</div>
            <span className="section-kicker">{t("pwa.app")}</span>
            <h2 id="install-title">{t("pwa.installPhone")}</h2>
            <p className="install-lead">{t("pwa.lead")}</p>

            {!choice && (
              <div className="platform-choice">
                <button type="button" onClick={() => setChoice("ios")}>
                  <span className="platform-icon apple-icon" aria-hidden="true">●</span>
                  <span><strong>{t("pwa.iphone")}</strong><small>{t("pwa.iosViaSafari")}</small></span>
                </button>
                <button type="button" onClick={() => setChoice("android")}>
                  <Smartphone size={26} aria-hidden="true" />
                  <span><strong>{t("pwa.android")}</strong><small>{t("pwa.androidViaChrome")}</small></span>
                </button>
              </div>
            )}

            {choice === "ios" && (
              <div className="install-instructions">
                <button className="change-platform" type="button" onClick={() => setChoice(null)}>← {t("pwa.otherPhone")}</button>
                <h3>{t("pwa.iphoneTitle")}</h3>
                <ol>
                  <li><span className="instruction-icon">1</span><div>{t("pwa.iphoneOpen")}</div></li>
                  <li><span className="instruction-icon"><Share size={18} /></span><div>{t("pwa.iphoneStep1")}</div></li>
                  <li><span className="instruction-icon">＋</span><div>{t("pwa.iphoneStep2")}</div></li>
                  <li><span className="instruction-icon"><Check size={18} /></span><div>{t("pwa.iphoneStep3")}</div></li>
                </ol>
                <p className="install-note">{t("pwa.iphoneNote")}</p>
              </div>
            )}

            {choice === "android" && (
              <div className="install-instructions">
                <button className="change-platform" type="button" onClick={() => setChoice(null)}>← {t("pwa.otherPhone")}</button>
                <h3>{t("pwa.androidTitle")}</h3>
                {installPrompt ? (
                  <>
                    <p>{t("pwa.androidReady")}</p>
                    <button className="android-install-action" type="button" onClick={installOnAndroid}>
                      <Download size={18} /> {t("pwa.androidInstall")}
                    </button>
                  </>
                ) : (
                  <ol>
                    <li><span className="instruction-icon"><MoreVertical size={18} /></span><div>{t("pwa.androidStep1")}</div></li>
                    <li><span className="instruction-icon"><Download size={18} /></span><div>{t("pwa.androidStep2")}</div></li>
                    <li><span className="instruction-icon"><Check size={18} /></span><div>{t("pwa.androidStep3")}</div></li>
                  </ol>
                )}
              </div>
            )}
          </section>
        </div>
      ), document.body)}
    </>
  );
}
