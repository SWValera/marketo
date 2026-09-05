"use client";

import type { ComponentProps, MouseEvent, PointerEvent } from "react";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { useStoredLocation } from "@/components/location-picker";
import { createIntentPrefetchController } from "@/lib/navigation/intent-prefetch";

type CategoryLinkProps = Omit<ComponentProps<typeof AppLink>, "href" | "prefetch"> & {
  href: string;
  cityId?: string;
};

export function categoryHref(href: string, cityId?: string) {
  if (!href.startsWith("/category/") || !cityId || cityId === "all") return href;
  const url = new URL(href, "https://marketo.invalid");
  if (!url.searchParams.has("city")) url.searchParams.set("city", cityId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Category links keep the active city in the first navigation and prefetch
 * only after real user intent. This avoids both the old second router.replace
 * and an expensive automatic prefetch of every node in the 1,000+ item tree.
 */
function ResolvedCategoryLink({
  href,
  cityId,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onPointerDown,
  ...props
}: CategoryLinkProps) {
  const router = useRouter();
  const resolvedHref = categoryHref(href, cityId);
  const intentPrefetch = useMemo(
    () => createIntentPrefetchController(() => router.prefetch(resolvedHref), 80),
    [resolvedHref, router],
  );

  useEffect(() => () => intentPrefetch.dispose(), [intentPrefetch]);

  return <AppLink
    {...props}
    href={resolvedHref}
    prefetch={false}
    onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
      onMouseEnter?.(event);
      if (!event.defaultPrevented) intentPrefetch.schedule();
    }}
    onMouseLeave={(event: MouseEvent<HTMLAnchorElement>) => {
      onMouseLeave?.(event);
      intentPrefetch.cancel();
    }}
    onPointerDown={(event: PointerEvent<HTMLAnchorElement>) => {
      onPointerDown?.(event);
      if (!event.defaultPrevented) intentPrefetch.request();
    }}
    onClick={(event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      intentPrefetch.cancel();
    }}
  />;
}

function StoredCityCategoryLink(props: CategoryLinkProps) {
  const storedLocation = useStoredLocation();
  return <ResolvedCategoryLink {...props} cityId={storedLocation} />;
}

export function CategoryLink(props: CategoryLinkProps) {
  return props.cityId === undefined
    ? <StoredCityCategoryLink {...props} />
    : <ResolvedCategoryLink {...props} />;
}
