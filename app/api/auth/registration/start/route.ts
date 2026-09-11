import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { capability, clientRateProof, digest, HANDOFF_COOKIE, handoffRpc, readProof } from "@/lib/auth/registration-handoff";

export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) return NextResponse.json({ error: "origin" }, { status: 403 });
  try {
    const previous = await readProof();
    const read = capability();
    const write = capability();
    const result = await handoffRpc("start", { read_proof: await digest(read), write_proof: await digest(write), client_proof: await clientRateProof(request), lease_proof: previous });
    if (result.state !== "waiting") return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    (await cookies()).set(HANDOFF_COOKIE, read, { path: "/", maxAge: 3600, secure: new URL(request.url).protocol === "https:", httpOnly: true, sameSite: "lax" });
    const callback = new URL("/api/auth/callback", request.url);
    callback.searchParams.set("flow", "signup");
    callback.searchParams.set("bridge", write);
    return NextResponse.json({ callback: callback.toString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "registration_unavailable" }, { status: 503 });
  }
}
