import type { OwnerDraftBundle } from "@/lib/data/types";

export { createSingleFlightTtlLoader } from "../reference-data/cache.ts";

export type PublishLoadFailure =
  | "authentication"
  | "not_found"
  | "not_editable"
  | "temporary"
  | "unexpected";

export class PublishLoadError extends Error {
  readonly reason: PublishLoadFailure;

  constructor(reason: PublishLoadFailure) {
    super(`publish_load_${reason}`);
    this.name = "PublishLoadError";
    this.reason = reason;
  }
}

export function publishLoadFailureForStatus(status: number): PublishLoadFailure {
  if (status === 401) return "authentication";
  if (status === 404) return "not_found";
  if (status === 409) return "not_editable";
  if (status === 503) return "temporary";
  return "unexpected";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isOwnerDraftBundle(value: unknown): value is OwnerDraftBundle {
  if (!isRecord(value)) return false;
  const stringFields = [
    "id",
    "slug",
    "categoryId",
    "categorySlug",
    "settlementId",
    "title",
    "description",
    "contactName",
    "contactPhone",
    "updatedAt",
  ];
  return stringFields.every((field) => typeof value[field] === "string")
    && (value.status === "draft" || value.status === "rejected")
    && (value.price === null || (typeof value.price === "number" && Number.isFinite(value.price)))
    && value.currencyCode === "KZT"
    && typeof value.allowMessages === "boolean"
    && isRecord(value.attributes)
    && Array.isArray(value.images)
    && value.images.every((image) => isRecord(image)
      && typeof image.id === "string"
      && typeof image.url === "string"
      && typeof image.sortOrder === "number")
    && isNullableString(value.rejectionReasonCode)
    && isNullableString(value.rejectedAt);
}

export async function readPublishDraftResponse(response: {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}): Promise<OwnerDraftBundle> {
  if (!response.ok) throw new PublishLoadError(publishLoadFailureForStatus(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PublishLoadError("unexpected");
  }
  if (!isRecord(body) || !isOwnerDraftBundle(body.listing)) {
    throw new PublishLoadError("unexpected");
  }
  return body.listing;
}

export function isPublishLoadRetryable(reason: PublishLoadFailure) {
  return reason === "temporary";
}

export function publishEditorPath(listingId: string | null) {
  return listingId ? `/publish?listing=${encodeURIComponent(listingId)}` : "/publish";
}

export function publishLoginHref(listingId: string | null) {
  return `/login?next=${encodeURIComponent(publishEditorPath(listingId))}`;
}
