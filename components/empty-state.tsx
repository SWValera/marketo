import type { ReactNode } from "react";
import { AppLink as Link } from "@/components/app-link";
import { Inbox } from "lucide-react";
import { RetryPage } from "@/components/retry-page";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  actionPrefetch,
  retry = false,
  icon,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  actionPrefetch?: boolean;
  retry?: boolean;
  icon?: ReactNode;
}) {
  return (
    <section className="empty-state" aria-live="polite" data-marketo-error={retry || undefined}>
      <span className="empty-state-icon">{icon ?? <Inbox size={30} />}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionHref && actionLabel ? retry ? <RetryPage href={actionHref}>{actionLabel}</RetryPage> : <Link href={actionHref} prefetch={actionPrefetch}>{actionLabel}</Link> : null}
    </section>
  );
}
