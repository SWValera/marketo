import {
  CATEGORY_REFERENCE_EXPECTED_CATEGORY_COUNT,
  CATEGORY_REFERENCE_VERSION,
} from "@/lib/reference-data/release";
import { getCategoryReferences } from "@/lib/reference-data/server";

const etag = `W/"marketo-categories-${CATEGORY_REFERENCE_VERSION}"`;

export async function GET(request: Request) {
  const result = await getCategoryReferences();
  if (result.status !== "ready") {
    return Response.json(
      { error: result.reason ?? "reference_data_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const requestedVersion = new URL(request.url).searchParams.get("v");
  const versioned = requestedVersion === CATEGORY_REFERENCE_VERSION;
  if (versioned && result.data.categories.length !== CATEGORY_REFERENCE_EXPECTED_CATEGORY_COUNT) {
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
      "x-marketo-reference-version": CATEGORY_REFERENCE_VERSION,
    },
  });
}
