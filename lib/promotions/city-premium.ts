import type { JevuSupabaseClient } from "@/lib/data/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
export type CityPremiumProduct = Database["public"]["Functions"]["get_city_premium_availability"]["Returns"][number];
export type CityPremiumOffer = {
  product: CityPremiumProduct | null; listing_active: boolean; listing_pending?: boolean;
  placement: { id: string; status: string; failure_reason?: string | null; ends_at: string | null; price_amount: number; currency: string } | null;
};
export const promotionResults = ["ACTIVE", "PENDING_APPROVAL", "NO_SLOTS", "ALREADY_ACTIVE", "LISTING_NOT_ELIGIBLE", "PAYMENT_REQUIRED", "DISABLED", "RESERVED"] as const;
export type CityPremiumResult = { status: typeof promotionResults[number]; reason?: string; placement_id?: string };

export class CityPremiumRpcError extends Error {
  readonly rpc: string;
  readonly code: string;
  readonly httpStatus: number;
  readonly eligibilityReason?: string;
  constructor(rpc: string, code: string, httpStatus: number, eligibilityReason?: string) {
    super("promotion_rpc_failed");
    this.name = "CityPremiumRpcError";
    this.rpc = rpc; this.code = code; this.httpStatus = httpStatus; this.eligibilityReason = eligibilityReason;
  }
}
function rpcFailure(rpc: string, error: {code?: string; message?: string} | null, status: number): never {
  const code = error?.code && /^[A-Z0-9]{5,12}$/.test(error.code) ? error.code : "UNAVAILABLE";
  const reason = code === "42501" && error?.message === "listing unavailable" ? "listing_unavailable"
    : code === "42501" && error?.message === "authentication required" ? "authentication_required" : undefined;
  // Never log payloads, IDs, tokens, or backend details containing record values.
  if (!reason) console.error("[jevu-promotion]", { rpc, code, httpStatus: status });
  throw new CityPremiumRpcError(rpc, code, status, reason);
}
export async function readCityPremiumOffer(client: JevuSupabaseClient, listingId: string, signal: AbortSignal) {
  const rpc = "get_city_premium_offer";
  const response = await client.rpc(rpc, { target_listing_id: listingId })
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(12000)]));
  const { data, error, status } = response;
  if (error || !data || typeof data !== "object" || Array.isArray(data)) rpcFailure(rpc, error, status);
  return data as unknown as CityPremiumOffer;
}
export async function activateCityPremium(client: JevuSupabaseClient, listingId: string): Promise<CityPremiumResult> {
  const rpc = "connect_city_premium";
  const { data, error, status } = await client.rpc(rpc, { target_listing_id: listingId }).abortSignal(AbortSignal.timeout(15000));
  if (error) rpcFailure(rpc, error, status);
  if (!data || typeof data !== "object" || Array.isArray(data)
      || !promotionResults.includes(data.status as CityPremiumResult["status"])) rpcFailure(rpc, null, status);
  return data as unknown as CityPremiumResult;
}
