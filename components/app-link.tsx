import NextLink from "next/link";
import type { ComponentProps } from "react";

type AppLinkProps = ComponentProps<typeof NextLink>;

function needsDocumentNavigation(href: string) {
  const pathname = href.split(/[?#]/, 1)[0];
  return pathname === "/publish"
    || pathname === "/profile/edit"
    || pathname === "/login"
    || pathname === "/admin"
    || pathname.startsWith("/admin/");
}

/**
 * Application navigation is request-driven. Speculative RSC prefetch must be
 * an explicit opt-in because even routes that look static can execute the
 * Worker, layouts, Auth and reference-data loaders at runtime.
 */
export function AppLink({ prefetch = false, ...props }: AppLinkProps) {
  const href = props.href;
  if (typeof href === "string" && needsDocumentNavigation(href)) {
    // vinext client RSC redirects can commit an empty/error shell before the
    // redirect destination settles. A normal document request preserves the
    // server's 307/Auth contract for these conditional redirect routes.
    return <a {...props} href={href} />;
  }
  return <NextLink {...props} prefetch={prefetch} />;
}
