import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PublishForm } from "@/components/publish-form";
import { getCurrentAuthContext } from "@/lib/auth/context";
import { getMyListingDraftBundle, OwnerListingDataError } from "@/lib/data/supabase/my-listings";
import { getCategoryReferences } from "@/lib/reference-data/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Разместить объявление", robots: { index: false, follow: false } };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string | string[] }>;
}) {
  const [authContext, params, catalog] = await Promise.all([
    getCurrentAuthContext(),
    searchParams,
    getCategoryReferences(),
  ]);
  if (authContext.status === "anonymous") redirect("/login?next=/publish");
  if (authContext.status === "error") throw new Error("AUTH_CONTEXT_UNAVAILABLE");
  if (authContext.accountStatus !== "active") redirect("/profile");

  const requestedListing = Array.isArray(params.listing) ? params.listing[0] : params.listing;
  let initialDraft = null;
  if (requestedListing) {
    if (!uuid.test(requestedListing)) notFound();
    try {
      initialDraft = await getMyListingDraftBundle(await createSupabaseServerClient(), requestedListing);
    } catch (error) {
      if (error instanceof OwnerListingDataError && error.code === "NOT_EDITABLE") notFound();
      throw error;
    }
    if (!initialDraft) notFound();
  }

  return <>
    <Header />
    <main className="page-shell subpage-main publish-page">
      <PublishForm
        catalog={catalog}
        userId={authContext.user.id}
        profileDefaults={{
          displayName: authContext.profile.displayName,
          contactPhone: authContext.profile.contactPhone ?? "",
          cityId: authContext.profile.cityId,
        }}
        initialDraft={initialDraft}
      />
    </main>
    <MobileNav />
  </>;
}

