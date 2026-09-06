"use client";

import type { ComponentProps } from "react";
import { AppLink } from "@/components/app-link";
import { useStoredLocation } from "@/components/location-picker";

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
 * Keep the city in the first request. Do not start an RSC prefetch on touch
 * or hover: the router cannot consume an in-flight prefetch, so a tap used
 * to issue two competing requests. Previously visited routes remain cached
 * by the router without prefetching the 1,000+ item category tree.
 */
function ResolvedCategoryLink({
  href,
  cityId,
  ...props
}: CategoryLinkProps) {
  const resolvedHref = categoryHref(href, cityId);

  return <AppLink
    {...props}
    href={resolvedHref}
    prefetch={false}
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
