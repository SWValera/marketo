import { NextResponse } from "next/server";
import {
  getMyListingDraftBundle,
  OwnerListingDataError,
  updateMyListingDraft,
} from "@/lib/data/supabase/my-listings";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { preparePublishDraft, PublishReferenceError } from "@/lib/publish/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ownerReadFailure(error: unknown) {
  if (error instanceof OwnerListingDataError) {
    if (error.code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: "authentication_required" }, { status: 401 });
    if (error.code === "NOT_EDITABLE") return NextResponse.json({ error: "listing_not_editable" }, { status: 409 });
  }
  return NextResponse.json({ error: "listing_load_failed" }, { status: 503 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  try {
    const draft = await getMyListingDraftBundle(await createSupabaseServerClient(), id);
    if (!draft) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    return NextResponse.json({ listing: draft });
  } catch (error) {
    return ownerReadFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "cross_origin_request_denied" }, { status: 403 });
  }
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  const client = await createSupabaseServerClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });

  try {
    const existing = await getMyListingDraftBundle(client, id);
    if (!existing) return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
    const raw = await request.json().catch(() => null);
    const prepared = await preparePublishDraft(client, raw);
    if (!prepared.success) {
      return NextResponse.json({ error: "invalid_draft", details: prepared.errors }, { status: 400 });
    }
    const body = prepared.value.input;
    const updated = await updateMyListingDraft(client, {
      listingId: id,
      categoryId: body.categoryId,
      settlementId: body.settlementId,
      title: body.title,
      description: body.description,
      price: body.price,
      contactName: body.contactName,
      contactPhone: body.contactPhone,
      allowMessages: body.allowMessages,
      rpcAttributes: prepared.value.rpcAttributes,
    });
    if (!updated) return NextResponse.json({ error: "draft_update_failed" }, { status: 500 });
    return NextResponse.json({
      listing: { id: updated.listing_id, slug: updated.listing_slug, status: updated.listing_status },
    });
  } catch (error) {
    if (error instanceof OwnerListingDataError) return ownerReadFailure(error);
    if (error instanceof PublishReferenceError) {
      return NextResponse.json({ error: "reference_query_failed" }, { status: 503 });
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42501") return NextResponse.json({ error: "listing_not_editable" }, { status: 409 });
    if (code === "22023" || code === "23514") return NextResponse.json({ error: "invalid_draft" }, { status: 400 });
    console.error("[marketo-listing] update failed", {
      name: error instanceof Error ? error.name : "Error",
      ...(code ? { code } : {}),
    });
    return NextResponse.json({ error: "draft_update_failed" }, { status: 500 });
  }
}

