import { NextResponse } from "next/server";
import { publicMediaUrl } from "@/lib/media/public-url";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city");
  if (!city || !uuid.test(city)) return NextResponse.json({ error: "invalid_city" }, { status: 400 });
  const client = createSupabasePublicServerClient();
  const { data: settlement, error: settlementError } = await client.from("settlements").select("id").eq("id", city).eq("is_active", true).eq("is_selectable", true).maybeSingle();
  if (settlementError) return NextResponse.json({ error: "city_lookup_failed" }, { status: 503 });
  if (!settlement) return NextResponse.json({ error: "city_not_found" }, { status: 404 });
  const { data, error } = await client.rpc("get_city_premium_placements", { p_settlement_id: city, p_limit: 15 });
  if (error) return NextResponse.json({ error: "showcase_lookup_failed" }, { status: 503 });
  return NextResponse.json({
    city,
    capacity: 15,
    placements: data.map((placement) => ({
      id: placement.placement_id,
      listingId: placement.listing_id,
      slug: placement.slug,
      title: placement.title,
      priceMinor: placement.price_minor,
      currencyCode: placement.currency_code,
      locationRu: placement.location_name_ru,
      locationKk: placement.location_name_kk,
      imageUrl: publicMediaUrl(placement.primary_image_storage_key),
    })),
  }, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=30" } });
}

