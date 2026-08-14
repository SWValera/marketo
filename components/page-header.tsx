import type { ReactNode } from "react";
import { BackButton } from "@/components/back-button";

export function PageHeader({
  title,
  description,
  fallback,
  eyebrow,
  action,
  onBack,
}: {
  title: string;
  description?: string;
  fallback: string;
  eyebrow?: string;
  action?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <header className="app-page-header">
      <BackButton fallback={fallback} onBack={onBack} />
      <div className="app-page-heading">
        {eyebrow && <span className="section-kicker">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="app-page-action">{action}</div>}
    </header>
  );
}
