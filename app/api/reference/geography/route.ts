import {
  GEOGRAPHY_REFERENCE_EXPECTED_COUNTRY_COUNT,
  GEOGRAPHY_REFERENCE_EXPECTED_REGION_COUNT,
  GEOGRAPHY_REFERENCE_EXPECTED_SETTLEMENT_COUNT,
  GEOGRAPHY_REFERENCE_VERSION,
} from "@/lib/reference-data/release";
import { getGeographyReferences } from "@/lib/reference-data/server";

const etag = `W/"marketo-geography-${GEOGRAPHY_REFERENCE_VERSION}"`;

export async function GET(request: Request) {
  const result = await getGeographyReferences();
  if (result.status !== "ready") {
    return Response.json(
      { error: result.reason ?? "reference_data_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const requestedVersion = new URL(request.url).searchParams.get("v");
  const versioned = requestedVersion === GEOGRAPHY_REFERENCE_VERSION;
  const expectedReleaseReady = result.data.countries.length === GEOGRAPHY_REFERENCE_EXPECTED_COUNTRY_COUNT
    && result.data.regions.length === GEOGRAPHY_REFERENCE_EXPECTED_REGION_COUNT
    && result.data.settlements.length === GEOGRAPHY_REFERENCE_EXPECTED_SETTLEMENT_COUNT;
  if (versioned && !expectedReleaseReady) {
    return Response.json(
      { error: "reference_release_not_ready" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return Response.json(result.data, {
    headers: {
      "cache-control": versioned
        ? "public, max-age=31536000, s-maxage=31536000, immutable"
        : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      etag,
      "x-marketo-reference-version": GEOGRAPHY_REFERENCE_VERSION,
    },
  });
}
