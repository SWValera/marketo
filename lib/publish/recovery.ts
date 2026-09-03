import { z } from "zod";
import type { PublishAttributeValues } from "./contract.ts";

export const PUBLISH_RECOVERY_SCHEMA_VERSION = 1 as const;
export const PUBLISH_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PublishRecoveryFields = {
  categorySlug: string;
  cityId: string;
  title: string;
  description: string;
  priceDigits: string;
  attributes: PublishAttributeValues;
  contactName: string;
  contactPhone: string;
  allowMessages: boolean;
};

export type PublishRecoveryDraft = {
  schemaVersion: typeof PUBLISH_RECOVERY_SCHEMA_VERSION;
  userId: string;
  savedAt: number;
  fields: PublishRecoveryFields;
  serverListingId?: string;
};

const attributeValueSchema = z.union([
  z.string().max(5_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.object({ min: z.union([z.string(), z.number()]), max: z.union([z.string(), z.number()]) }).strict(),
]);

const recoverySchema = z.object({
  schemaVersion: z.literal(PUBLISH_RECOVERY_SCHEMA_VERSION),
  userId: z.string().uuid(),
  savedAt: z.number().int().nonnegative(),
  fields: z.object({
    categorySlug: z.string().max(200),
    cityId: z.string().max(64),
    title: z.string().max(120),
    description: z.string().max(20_000),
    priceDigits: z.string().regex(/^\d*$/).max(20),
    attributes: z.record(z.string(), attributeValueSchema),
    contactName: z.string().max(80),
    contactPhone: z.string().max(24),
    allowMessages: z.boolean(),
  }).strict(),
  serverListingId: z.string().uuid().optional(),
}).strict();

export function publishRecoveryKey(userId: string) {
  return `marketo-listing-draft:${userId}`;
}

export type PublishRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readPublishRecovery(
  storage: PublishRecoveryStorage | null,
  expectedUserId: string,
  now = Date.now(),
) {
  if (!storage) return { status: "unavailable" as const, draft: null };
  try {
    return parsePublishRecovery(storage.getItem(publishRecoveryKey(expectedUserId)), expectedUserId, now);
  } catch {
    return { status: "unavailable" as const, draft: null };
  }
}

export function savePublishRecovery(storage: PublishRecoveryStorage | null, draft: PublishRecoveryDraft) {
  if (!storage) return false;
  try {
    storage.setItem(publishRecoveryKey(draft.userId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removePublishRecovery(storage: PublishRecoveryStorage | null, userId: string) {
  if (!storage) return false;
  try {
    storage.removeItem(publishRecoveryKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function createPublishRecovery(
  userId: string,
  fields: PublishRecoveryFields,
  serverListingId?: string | null,
  savedAt = Date.now(),
): PublishRecoveryDraft {
  return {
    schemaVersion: PUBLISH_RECOVERY_SCHEMA_VERSION,
    userId,
    savedAt,
    fields,
    ...(serverListingId ? { serverListingId } : {}),
  };
}

export function parsePublishRecovery(
  raw: string | null,
  expectedUserId: string,
  now = Date.now(),
):
  | { status: "empty" | "invalid" | "foreign" | "stale"; draft: null }
  | { status: "ready"; draft: PublishRecoveryDraft } {
  if (!raw) return { status: "empty", draft: null };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: "invalid", draft: null };
  }
  const parsed = recoverySchema.safeParse(value);
  if (!parsed.success) return { status: "invalid", draft: null };
  if (parsed.data.userId !== expectedUserId) return { status: "foreign", draft: null };
  if (parsed.data.savedAt > now + 60_000 || now - parsed.data.savedAt > PUBLISH_RECOVERY_TTL_MS) {
    return { status: "stale", draft: null };
  }
  return { status: "ready", draft: parsed.data as PublishRecoveryDraft };
}
