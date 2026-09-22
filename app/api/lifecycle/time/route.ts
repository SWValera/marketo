import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Read-only Worker time. All persisted lifecycle transitions remain in PostgreSQL. */
export function GET() {
  return NextResponse.json({ now: Date.now() }, {
    headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" },
  });
}
