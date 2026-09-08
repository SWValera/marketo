"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function RetryPage({ href, children, onLoaded, className, preserveCurrentQuery = true }: { href: string; children: ReactNode; onLoaded?: () => void; className?: string; preserveCurrentQuery?: boolean }) {
  const router = useRouter();
  return <button type="button" className={className} onClick={() => {
    // The refresh navigation kind bypasses saved responses for this read.
    const runtime = window as unknown as { __VINEXT_RSC_NAVIGATE__?: (href: string, depth: number, kind: string, mode: string, previous?: unknown, programmatic?: boolean, onLoaded?: () => void) => Promise<unknown> };
    const target = new URL(href, window.location.href);
    const retryHref = preserveCurrentQuery && target.pathname === window.location.pathname ? window.location.href : target.href;
    if (runtime.__VINEXT_RSC_NAVIGATE__) void runtime.__VINEXT_RSC_NAVIGATE__(retryHref, 0, "refresh", "replace", undefined, false, onLoaded);
    else router.refresh();
  }}>{children}</button>;
}
