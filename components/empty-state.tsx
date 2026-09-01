import type { ReactNode } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  actionPrefetch,
  icon,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  actionPrefetch?: boolean;
  icon?: ReactNode;
}) {
  return (
    <section className="empty-state" aria-live="polite">
      <span className="empty-state-icon">{icon ?? <Inbox size={30} />}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionHref && actionLabel ? <Link href={actionHref} prefetch={actionPrefetch}>{actionLabel}</Link> : null}
    </section>
  );
}
