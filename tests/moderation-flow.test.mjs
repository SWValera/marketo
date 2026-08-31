import assert from "node:assert/strict";
import test from "node:test";
import { evaluateModerationAccess } from "../lib/auth/moderation-access-core.ts";
import {
  ModerationDataError,
  moderationMediaUrl,
  normalizeModerationQueueQueryResult,
} from "../lib/data/supabase/moderation-core.ts";
import { isSameOriginMutationRequest } from "../lib/http/same-origin.ts";
import {
  isModerationRejectionReason,
  MODERATION_NOTE_MAX_LENGTH,
  MODERATION_REJECTION_REASONS,
} from "../lib/moderation/policy.ts";

const profile = {
  id: "10000000-0000-4000-8000-000000000001",
  displayName: "Staff",
  avatarUrl: null,
  cityId: null,
  bio: null,
  verified: false,
  language: "ru",
  accountStatus: "active",
};

function authenticated(roles, accountStatus = "active") {
  return {
    status: "authenticated",
    user: { id: profile.id, email: "staff@example.kz" },
    profile: { ...profile, accountStatus },
    accountStatus,
    roles,
    isAuthenticated: true,
  };
}

test("moderation guard accepts only active moderator or admin contexts", () => {
  assert.equal(evaluateModerationAccess(authenticated(["moderator"])).allowed, true);
  assert.equal(evaluateModerationAccess(authenticated(["admin"])).allowed, true);
  assert.deepEqual(evaluateModerationAccess(authenticated([])).reason, "forbidden");
  assert.deepEqual(evaluateModerationAccess(authenticated(["support"])).reason, "forbidden");
  assert.deepEqual(evaluateModerationAccess(authenticated(["moderator"], "suspended")).reason, "inactive");
  assert.deepEqual(evaluateModerationAccess(authenticated(["admin"], "banned")).reason, "inactive");
  assert.deepEqual(evaluateModerationAccess({ status: "anonymous", user: null, profile: null, roles: [], isAuthenticated: false }).reason, "anonymous");
  assert.deepEqual(evaluateModerationAccess({ status: "error", user: null, profile: null, roles: [], isAuthenticated: false, errorCode: "AUTH_CONTEXT_UNAVAILABLE" }).reason, "unavailable");
});

test("queue normalization distinguishes true empty, real totals and failures", () => {
  assert.deepEqual(normalizeModerationQueueQueryResult({ data: [], error: null, count: 0 }), { rows: [], total: 0 });
  const rows = [{ id: "one" }, { id: "two" }];
  assert.deepEqual(normalizeModerationQueueQueryResult({ data: rows, error: null, count: 2 }), { rows, total: 2 });
  assert.throws(
    () => normalizeModerationQueueQueryResult({ data: null, error: { code: "PGRST000" }, count: null }),
    (error) => error instanceof ModerationDataError && error.code === "QUEUE_UNAVAILABLE",
  );
});

test("moderation mutation origin and rejection policy are bounded", () => {
  assert.equal(isSameOriginMutationRequest(new Request("https://marketo.kz/api/admin", { method: "POST", headers: { origin: "https://marketo.kz" } })), true);
  assert.equal(isSameOriginMutationRequest(new Request("https://marketo.kz/api/admin", { method: "POST", headers: { origin: "https://evil.example" } })), false);
  assert.equal(isSameOriginMutationRequest(new Request("https://marketo.kz/api/admin", { method: "POST", headers: { "sec-fetch-site": "same-origin" } })), true);
  assert.equal(MODERATION_REJECTION_REASONS.length, 6);
  assert.equal(isModerationRejectionReason("wrong_category"), true);
  assert.equal(isModerationRejectionReason("free form reason"), false);
  assert.equal(MODERATION_NOTE_MAX_LENGTH, 2000);
});

test("pending moderation media stays same-origin even when a public CDN is configured", () => {
  const previous = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.example.test/media";
  try {
    assert.equal(moderationMediaUrl("listings/owner/listing/00-photo.webp"), "/api/media/listings/owner/listing/00-photo.webp");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = previous;
  }
});
