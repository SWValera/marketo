import { NextResponse } from "next/server";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { handoffRpc, readProof } from "@/lib/auth/registration-handoff";
export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) return NextResponse.json({ error: "origin" }, { status: 403 });
  try {
    const proof = await readProof();
    if (proof) await handoffRpc("cancel", { read_proof: proof });
    // Do not clear a cookie here: a parallel successful start may have replaced it.
    return NextResponse.json({ state: "cancelled" }, { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ state: "unavailable" }, { status: 503 }); }
}
