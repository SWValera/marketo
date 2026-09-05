import { NextResponse } from "next/server";
import { getCategoryAttributeOptionReferences } from "@/lib/reference-data/server";
import { CATEGORY_REFERENCE_VERSION } from "@/lib/reference-data/release";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const parentOptionId = url.searchParams.get("parent_option_id") ?? undefined;
  const query = (url.searchParams.get("q") ?? "").slice(0, 64);
  const versioned = url.searchParams.get("v") === CATEGORY_REFERENCE_VERSION;

  if (!UUID.test(id) || (parentOptionId && !UUID.test(parentOptionId))) {
    return NextResponse.json({ error: "invalid_reference_id" }, { status: 400 });
  }

  const result = await getCategoryAttributeOptionReferences(id, parentOptionId, query);
  if (result.status !== "ready") {
    return NextResponse.json({ error: "reference_data_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ options: result.data }, {
    headers: {
      "cache-control": versioned
        ? "public, max-age=300, s-maxage=300, must-revalidate"
        : "no-store",
      "x-marketo-reference-version": CATEGORY_REFERENCE_VERSION,
    },
  });
}
