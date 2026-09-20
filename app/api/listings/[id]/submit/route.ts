import { isPromotionChoice, type PromotionChoice } from "@/lib/publish/promotion-choice";
import { NextResponse } from "next/server";
import { OwnerListingDataError } from "@/lib/data/supabase/my-listings";
import { submitListing } from "@/lib/data/supabase/listings";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { PublishReferenceError, validateStoredListingForSubmit } from "@/lib/publish/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "cross_origin_request_denied" }, { status: 403 });
  }
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  let promotionChoice: PromotionChoice | null | undefined;
  const rawBody = await request.text();
  if (rawBody) {
    try {
      const body: unknown = JSON.parse(rawBody);
      if (!body || typeof body !== "object" || !("promotionChoice" in body)
        || (body.promotionChoice !== null && !isPromotionChoice(body.promotionChoice))) {
        return NextResponse.json({ error: "invalid_promotion_choice" }, { status: 400 });
      }
      promotionChoice = body.promotionChoice;
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
  }
  try {
    const validation = await validateStoredListingForSubmit(client, id);
    if (validation.status === "not_found") return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    if (validation.status === "invalid") {
      return NextResponse.json({ error: "invalid_draft", details: validation.errors }, { status: 422 });
    }
    await submitListing(client, id, promotionChoice);
    return NextResponse.json({ listing: { id, status: "pending" } });
  } catch (error) {
    if (error instanceof OwnerListingDataError) {
      if (error.code === "NOT_EDITABLE") return NextResponse.json({ error: "listing_not_editable" }, { status: 409 });
      if (error.code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 });
      return NextResponse.json({ error: "listing_lookup_failed" }, { status: 503 });
    }
    if (error instanceof PublishReferenceError) {
      return NextResponse.json({ error: "reference_query_failed" }, { status: 503 });
    }
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json({ error: "listing_submit_failed" }, { status: code === "42501" ? 409 : 500 });
  }
}
