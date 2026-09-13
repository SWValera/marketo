import type { JevuSupabaseClient } from "@/lib/data/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
export type CityPremiumProduct = Database["public"]["Functions"]["get_city_premium_availability"]["Returns"][number];
export type CityPremiumOffer = {
  product: CityPremiumProduct | null; listing_active: boolean; listing_pending?: boolean;
  placement: { id: string; status: string; failure_reason?: string | null; ends_at: string | null; price_amount: number; currency: string } | null;
};
export async function readCityPremiumOffer(client: JevuSupabaseClient, listingId: string, signal: AbortSignal) {
  const { data, error } = await client.rpc("get_city_premium_offer", { target_listing_id: listingId }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(12000)]));
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("offer_unavailable");
  return data as unknown as CityPremiumOffer;
}
export async function activateCityPremium(client: JevuSupabaseClient, listingId: string) {
  const { data, error } = await client.rpc("activate_city_premium", { target_listing_id: listingId }).abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error(error.message.includes("capacity exceeded") ? "full" : error.message.includes("payment required") ? "payment" : "activation");
  if (!data) throw new Error("activation");
  return data;
}
