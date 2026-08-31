import { protectedMediaUrl } from "../../media/public-url.ts";

export class ModerationDataError extends Error {
  readonly code: "QUEUE_UNAVAILABLE" | "DETAIL_UNAVAILABLE";

  constructor(code: "QUEUE_UNAVAILABLE" | "DETAIL_UNAVAILABLE", cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ModerationDataError";
    this.code = code;
  }
}

export function normalizeModerationQueueQueryResult<T>(result: {
  data: T[] | null;
  error: { code?: string; message?: string } | null;
  count: number | null;
}) {
  if (result.error || !result.data || result.count === null) {
    throw new ModerationDataError("QUEUE_UNAVAILABLE", result.error);
  }
  return { rows: result.data, total: result.count };
}

export function moderationMediaUrl(storageKey: string | null) {
  return protectedMediaUrl(storageKey);
}
