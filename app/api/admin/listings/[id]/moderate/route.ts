import { NextResponse } from "next/server";
import { z } from "zod";
import { ModerationAccessError, requireModerationAccess } from "@/lib/auth/moderation-access";
import { moderationRepository } from "@/lib/data/repositories";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import {
  isModerationRejectionReason,
  MODERATION_NOTE_MAX_LENGTH,
} from "@/lib/moderation/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reasonCode: z.string().trim().max(64).nullable().optional(),
  note: z.string().trim().max(MODERATION_NOTE_MAX_LENGTH).nullable().optional(),
}).strict();

function accessFailure(error: ModerationAccessError) {
  if (error.reason === "anonymous") return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  if (error.reason === "unavailable") return NextResponse.json({ error: "authorization_unavailable" }, { status: 500 });
  return NextResponse.json({ error: "moderation_forbidden" }, { status: 403 });
}

function rpcFailure(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  if (code === "42501") return NextResponse.json({ error: "moderation_forbidden" }, { status: 403 });
  if (code === "P0002" || /listing is unavailable/i.test(message)) {
    return NextResponse.json({ error: "listing_unavailable" }, { status: 404 });
  }
  if (/transition/i.test(message)) {
    return NextResponse.json({ error: "listing_already_moderated" }, { status: 409 });
  }
  if (code === "22023" || /reason_code|note is too long|invalid moderation/i.test(message)) {
    return NextResponse.json({ error: "invalid_moderation_input" }, { status: 422 });
  }
  console.error("[marketo-moderation] decision failed", {
    name: typeof record.name === "string" ? record.name : "Error",
    ...(code ? { code } : {}),
  });
  return NextResponse.json({ error: "moderation_failed" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "cross_origin_request_denied" }, { status: 403 });
  }

  try {
    await requireModerationAccess();
  } catch (error) {
    if (error instanceof ModerationAccessError) return accessFailure(error);
    return NextResponse.json({ error: "authorization_unavailable" }, { status: 500 });
  }

  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_moderation_input" }, { status: 400 });
  if (parsed.data.decision === "reject" && !isModerationRejectionReason(parsed.data.reasonCode)) {
    return NextResponse.json({ error: "rejection_reason_required" }, { status: 422 });
  }
  const reasonCode = parsed.data.decision === "reject" && isModerationRejectionReason(parsed.data.reasonCode)
    ? parsed.data.reasonCode
    : undefined;

  try {
    await moderationRepository.decide(
      await createSupabaseServerClient(),
      id,
      parsed.data.decision,
      reasonCode,
      parsed.data.note ?? undefined,
    );
    return NextResponse.json({
      listing: { id, status: parsed.data.decision === "approve" ? "active" : "rejected" },
    });
  } catch (error) {
    return rpcFailure(error);
  }
}
