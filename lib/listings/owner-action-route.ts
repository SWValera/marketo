import "server-only";

import { NextResponse } from "next/server";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function ownerListingAction(request: Request, listingId: string, action: "archive" | "sold" | "edit" | "restore" | "delete") {
  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "cross_origin_request_denied" }, { status: 403 });
  }
  if (!uuid.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });

  const { data: listing, error: listingError } = await client
    .from("listings")
    .select("id, status")
    .eq("id", listingId)
    .eq("owner_id", authData.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (listingError) return NextResponse.json({ error: "listing_lookup_failed" }, { status: 503 });
  if (!listing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  try {
    const { data: status, error } = await client.rpc("owner_listing_transition", {
      target_listing_id: listingId, requested_action: action,
    });
    if (error) throw error;
    return NextResponse.json({ listing: { id: listingId, status } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42501") return NextResponse.json({ error: "listing_action_stale" }, { status: 409 });
    console.error("[jevu-listing] owner action failed", {
      action,
      name: error instanceof Error ? error.name : "Error",
      ...(code ? { code } : {}),
    });
    return NextResponse.json({ error: "listing_action_failed" }, { status: 500 });
  }
}
