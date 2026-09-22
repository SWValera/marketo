"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePublicationDeadline } from "@/components/use-publication-deadline";

export function PublicationRefresh({ expiresAt }: { expiresAt: string | null }) {
  const router = useRouter();
  const expired = usePublicationDeadline(expiresAt);
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (!expired) { refreshed.current = null; return; }
    if (expiresAt && refreshed.current !== expiresAt) {
      refreshed.current = expiresAt;
      router.refresh();
    }
  }, [expired, expiresAt, router]);
  return null;
}
