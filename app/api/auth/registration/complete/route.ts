import { NextResponse } from "next/server";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { capability, digest, handoffRpc, readProof } from "@/lib/auth/registration-handoff";
import { createBufferedRegistrationClient, createSupabaseServerClient } from "@/lib/supabase/server";

const response = (state: string, status = 200) => NextResponse.json({ state }, { status, headers: { "cache-control": "no-store" } });
export async function POST(request: Request) {
  if (!isSameOriginMutationRequest(request)) return response("denied", 403);
  try {
    const proof = await readProof();
    if (!proof) return response("missing");
    const lease = await digest(capability());
    const claim = await handoffRpc("claim", { read_proof: proof, lease_proof: lease });
    if (claim.state === "complete") {
      const client = await createSupabaseServerClient();
      const { data } = await client.auth.getUser();
      return response(data.user?.id === claim.user_id ? "complete" : "expired");
    }
    if (claim.state !== "ready" || !claim.code) return response(claim.state);
    const { client, commit } = await createBufferedRegistrationClient();
    let exchanged = false;
    try {
      // The email device only deposits. This request carries the ORIGINAL
      // browser's PKCE verifier cookie; the code alone cannot establish a session.
      const { data, error } = await client.auth.exchangeCodeForSession(claim.code);
      if (error || !data.session || !data.user?.email_confirmed_at) {
        if (error && (!error.status || error.status >= 500)) {
          await handoffRpc("release", { read_proof: proof, lease_proof: lease });
          return response("waiting", 503);
        }
        await handoffRpc("cancel", { read_proof: proof });
        return response("expired");
      }
      exchanged = true;
      // Finalization is idempotent for this lease. Never re-exchange a consumed code.
      const finishArgs = { read_proof: proof, lease_proof: lease, code_value: data.user.id };
      const finished = await handoffRpc("finish", finishArgs).catch(() => handoffRpc("finish", finishArgs));
      if (finished.state !== "complete") return response("expired");
      commit();
      return response("complete");
    } catch {
      if (!exchanged) await handoffRpc("release", { read_proof: proof, lease_proof: lease });
      return response(exchanged ? "expired" : "waiting", exchanged ? 200 : 503);
    }
  } catch { return response("unavailable", 503); }
}
