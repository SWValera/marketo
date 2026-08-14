"use client";

import { Check, Download, MoreVertical, Share, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type InstallChoice = "ios" | "android" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstall() {
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
      <span className="pwa-installed" title="Marketo установлено">
        <Check size={17} aria-hidden="true" />
        <span>Установлено</span>
      </span>
    );
  }

  return (
    <>
      <button className="install-header-button" type="button" onClick={showInstall}>
        <span className="install-header-label">
          <strong>Установить</strong>
          <small>на телефон</small>
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
            <button className="install-close" type="button" aria-label="Закрыть" onClick={() => setOpen(false)}>
              <X size={21} />
            </button>

            <div className="install-modal-brand" aria-hidden="true">M</div>
            <span className="section-kicker">Приложение Marketo</span>
            <h2 id="install-title">Установить на телефон</h2>
            <p className="install-lead">Выберите ваш телефон. Marketo появится на главном экране и будет открываться как отдельное приложение.</p>

            {!choice && (
              <div className="platform-choice">
                <button type="button" onClick={() => setChoice("ios")}>
                  <span className="platform-icon apple-icon" aria-hidden="true">●</span>
                  <span><strong>iPhone</strong><small>Установка через Safari</small></span>
                </button>
                <button type="button" onClick={() => setChoice("android")}>
                  <Smartphone size={26} aria-hidden="true" />
                  <span><strong>Android</strong><small>Установка через Chrome</small></span>
                </button>
              </div>
            )}

            {choice === "ios" && (
              <div className="install-instructions">
                <button className="change-platform" type="button" onClick={() => setChoice(null)}>← Выбрать другой телефон</button>
                <h3>Установка на iPhone</h3>
                <ol>
                  <li><span className="instruction-icon">1</span><div>Откройте Marketo именно в <strong>Safari</strong>.</div></li>
                  <li><span className="instruction-icon"><Share size={18} /></span><div>Нажмите кнопку <strong>«Поделиться»</strong> внизу экрана.</div></li>
                  <li><span className="instruction-icon">＋</span><div>Прокрутите меню и выберите <strong>«На экран Домой»</strong>.</div></li>
                  <li><span className="instruction-icon"><Check size={18} /></span><div>Нажмите <strong>«Добавить»</strong> в правом верхнем углу.</div></li>
                </ol>
                <p className="install-note">На iPhone системная установка запускается только из меню Safari — это правило iOS.</p>
              </div>
            )}

            {choice === "android" && (
              <div className="install-instructions">
                <button className="change-platform" type="button" onClick={() => setChoice(null)}>← Выбрать другой телефон</button>
                <h3>Установка на Android</h3>
                {installPrompt ? (
                  <>
                    <p>Chrome уже готов установить Marketo. Нажмите кнопку ниже и подтвердите установку.</p>
                    <button className="android-install-action" type="button" onClick={installOnAndroid}>
                      <Download size={18} /> Установить Marketo
                    </button>
                  </>
                ) : (
                  <ol>
                    <li><span className="instruction-icon">1</span><div>Откройте Marketo в <strong>Google Chrome</strong>.</div></li>
                    <li><span className="instruction-icon"><MoreVertical size={18} /></span><div>Нажмите меню <strong>⋮</strong> в правом верхнем углу.</div></li>
                    <li><span className="instruction-icon"><Download size={18} /></span><div>Выберите <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong>.</div></li>
                    <li><span className="instruction-icon"><Check size={18} /></span><div>Подтвердите установку.</div></li>
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
