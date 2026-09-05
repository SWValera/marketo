import { NextResponse } from "next/server";
import { getCategoryAttributeReferences } from "@/lib/reference-data/server";
import { CATEGORY_REFERENCE_VERSION } from "@/lib/reference-data/release";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid_category_id" }, { status: 400 });
  const versioned = new URL(request.url).searchParams.get("v") === CATEGORY_REFERENCE_VERSION;

  const result = await getCategoryAttributeReferences(id);
  if (result.status !== "ready") {
    return NextResponse.json(
      { error: result.reason ?? "reference_data_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(result.data, {
    headers: {
      "Cache-Control": versioned
        ? "public, max-age=300, s-maxage=300, must-revalidate"
        : "no-store",
      "x-marketo-reference-version": CATEGORY_REFERENCE_VERSION,
    },
  });
}
