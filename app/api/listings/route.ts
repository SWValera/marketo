import { NextResponse } from "next/server";
import { listingRepository } from "@/lib/data/repositories";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { preparePublishDraft, PublishReferenceError } from "@/lib/publish/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  return NextResponse.json(await listingRepository.list());
}

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "cross_origin_request_denied" }, { status: 403 });
  }
  const client = await createSupabaseServerClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });

  const raw = await request.json().catch(() => null);
  try {
    const prepared = await preparePublishDraft(client, raw);
    if (!prepared.success) {
      return NextResponse.json({ error: "invalid_draft", details: prepared.errors }, { status: 400 });
    }
    const body = prepared.value.input;
    const { data, error } = await client.rpc("create_listing_draft", {
      p_category_id: body.categoryId,
      p_settlement_id: body.settlementId,
      p_title: body.title,
      p_description: body.description,
      p_price_minor: body.price,
      p_currency_code: body.currencyCode,
      p_contact_name: body.contactName,
      p_contact_phone_e164: body.contactPhone,
      p_allow_messages: body.allowMessages,
      p_attributes: prepared.value.rpcAttributes,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "22023" || error.code === "23514" ? 400 : 500;
      return NextResponse.json({ error: "draft_save_failed" }, { status });
    }
    const created = data?.[0];
    if (!created) return NextResponse.json({ error: "draft_save_failed" }, { status: 500 });
    return NextResponse.json({
      listing: { id: created.listing_id, slug: created.listing_slug, status: "draft" },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof PublishReferenceError) {
      return NextResponse.json({ error: "reference_query_failed" }, { status: 503 });
    }
    console.error("[marketo-listing] create failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    return NextResponse.json({ error: "draft_save_failed" }, { status: 500 });
  }
}

