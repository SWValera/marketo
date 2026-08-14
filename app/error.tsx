"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="state-page"><section className="state-card"><span className="state-icon"><AlertTriangle /></span><h1>Не удалось загрузить страницу</h1><p>Проверьте подключение к интернету и попробуйте ещё раз.</p><button className="primary-button" onClick={reset}>Повторить</button></section></main>;
}
