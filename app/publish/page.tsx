import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PublishFormLoader } from "@/components/publish-form-loader";
import { getCurrentAuthContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Разместить объявление", robots: { index: false, follow: false } };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string | string[] }>;
}) {
  const [authContext, params] = await Promise.all([
    getCurrentAuthContext(),
    searchParams,
  ]);
  if (authContext.status === "anonymous") redirect("/login?next=/publish");
  if (authContext.status === "error") throw new Error("AUTH_CONTEXT_UNAVAILABLE");
  if (authContext.accountStatus !== "active") redirect("/profile");

  const requestedListing = Array.isArray(params.listing) ? params.listing[0] : params.listing;
  if (requestedListing && !uuid.test(requestedListing)) notFound();

  return <>
    <Header />
    <main className="page-shell subpage-main publish-page">
      <PublishFormLoader
        requestedListingId={requestedListing ?? null}
        userId={authContext.user.id}
        profileDefaults={{
          displayName: authContext.profile.displayName,
          contactPhone: authContext.profile.contactPhone ?? "",
          cityId: authContext.profile.cityId,
        }}
      />
    </main>
    <MobileNav />
  </>;
}
