import { NextResponse } from "next/server";
import { publicMediaUrl } from "@/lib/media/public-url";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

type ShowcaseClient = ReturnType<typeof createSupabasePublicServerClient>;

/** Discover only public active cities, then reuse the existing per-city eligibility/order RPC. */
async function nationalPlacements(client: ShowcaseClient) {
  const cities = new Set<string>();
  const now = new Date().toISOString();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("city_premium_placements")
      .select("settlement_id").eq("promotion_type", "CITY_PREMIUM").eq("status", "active")
      .lte("starts_at", now).gt("ends_at", now).order("id").range(offset, offset + 999);
    if (error) throw new Error("showcase_lookup_failed");
    for (const row of data) cities.add(row.settlement_id);
    if (data.length < 1000) break;
  }
  const orderedCities = [...cities].sort();
  type Placement = Awaited<ReturnType<typeof readCity>>[number];
  const placements: Placement[] = [];
  async function readCity(city: string) {
    const { data, error } = await client.rpc("get_city_premium_placements", { p_settlement_id: city });
    if (error) throw new Error("showcase_lookup_failed");
    return data;
  }
  // Bound fan-out; no national LIMIT 15 and no replacement of the database eligibility rules.
  for (let i = 0; i < orderedCities.length; i += 4) {
    const batch = await Promise.all(orderedCities.slice(i, i + 4).map(readCity));
    placements.push(...batch.flat());
  }
  const seen = new Set<string>();
  return placements.filter((row) => {
    if (seen.has(row.listing_id)) return false;
    seen.add(row.listing_id);
    return true;
  });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getShowcaseResponse(city: string | null) {
  if (!city || (city !== "all" && !uuid.test(city))) return NextResponse.json({ error: "invalid_city" }, { status: 400 });
  const client = createSupabasePublicServerClient();
  if (city === "all") {
    try { return showcaseResponse(city, null, await nationalPlacements(client)); }
    catch { return NextResponse.json({ error: "showcase_lookup_failed" }, { status: 503 }); }
  }
  const [{ data: settlement, error: settlementError }, { data: availability, error: availabilityError }] = await Promise.all([
    client.from("settlements").select("id").eq("id", city).eq("is_active", true).eq("is_selectable", true).maybeSingle(),
    client.rpc("get_city_premium_availability", { p_settlement_id: city }),
  ]);
  if (settlementError) return NextResponse.json({ error: "city_lookup_failed" }, { status: 503 });
  if (!settlement) return NextResponse.json({ error: "city_not_found" }, { status: 404 });
  const product = availability?.[0];
  if (availabilityError || !product) return NextResponse.json({ error: "showcase_lookup_failed" }, { status: 503 });
  const { data, error } = await client.rpc("get_city_premium_placements", { p_settlement_id: city, p_limit: product.capacity });
  if (error) return NextResponse.json({ error: "showcase_lookup_failed" }, { status: 503 });
  return showcaseResponse(city, product.capacity, data);
}

function showcaseResponse(city: string, capacity: number | null, data: Awaited<ReturnType<typeof nationalPlacements>>) {
  return NextResponse.json({
    city,
    capacity,
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
      expiresAt: placement.ends_at,
    })),
  }, { headers: { "cache-control": "no-store" } });
}
