import { NextResponse } from "next/server";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { isPromotionChoice } from "@/lib/publish/promotion-choice";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

async function handle(request: Request, { params }: Context, write: boolean) {
  if (write && !isSameOriginMutationRequest(request)) return json({ error: "cross_origin_request_denied" }, 403);
  const { id } = await params;
  if (!uuid.test(id)) return json({ error: "invalid_listing_id" }, 400);
  const client = await createSupabaseServerClient();
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) return json({ error: "authentication_required" }, 401);
  const { data: listing, error: lookupError } = await client.from("listings").select("id, status")
    .eq("id", id).eq("owner_id", data.user.id).is("deleted_at", null).maybeSingle();
  if (lookupError) return json({ error: "listing_lookup_failed" }, 503);
  if (!listing) return json({ error: "listing_not_found" }, 404);
  if (!["draft", "pending", "active", "rejected"].includes(listing.status)) return json({ error: "listing_unavailable" }, 409);
  if (!write) {
    const { data: state, error } = await client.rpc("get_listing_promotion_state", { target_listing_id: id });
    if (error) return json({ error: "promotion_lookup_failed" }, 503);
    return json(state);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("promotionChoice" in body)
    || (body.promotionChoice !== null && !isPromotionChoice(body.promotionChoice))) {
    return json({ error: "invalid_promotion_choice" }, 400);
  }
  const { error } = await client.rpc("set_listing_promotion_choice", { target_listing_id: id, promotion_choice: body.promotionChoice });
  if (error) {
    if (error.message === "promotion already active") return json({ error: "promotion_already_active" }, 409);
    if (error.message === "publication expired") return json({ error: "listing_expired" }, 409);
    return json({ error: "promotion_save_failed" }, error.code === "42501" || error.code === "22023" ? 409 : 503);
  }
  return json({ promotionChoice: body.promotionChoice });
}

export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function PUT(request: Request, context: Context) { return handle(request, context, true); }
