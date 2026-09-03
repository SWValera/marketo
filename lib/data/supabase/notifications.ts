import type { MarketoSupabaseClient } from "@/lib/data/supabase/client";
import { normalizePageSize, normalizePositivePage, pageWindow } from "@/lib/data/pagination";
import type { Notification, PageResult } from "@/lib/data/types";
import { safeInternalPath } from "@/lib/auth/redirect";

const MAX_NOTIFICATION_PAGE_SIZE = 100;

export class NotificationDataError extends Error {
  constructor(
    public readonly code: "LIST_UNAVAILABLE" | "MUTATION_FAILED",
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "NotificationDataError";
  }
}

function payloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function listNotifications(client: MarketoSupabaseClient, userId: string, limit = 40) {
  const { data, error } = await client.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(Math.min(limit, 100));
  if (error) throw error;
  return data;
}

export async function listNotificationPage(
  client: MarketoSupabaseClient,
  userId: string,
  options: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
): Promise<PageResult<Notification>> {
  const page = normalizePositivePage(options.page);
  const pageSize = normalizePageSize(options.pageSize, 40, MAX_NOTIFICATION_PAGE_SIZE);
  const applyFilter = <T extends { is(column: string, value: null): T }>(query: T) => options.unreadOnly
    ? query.is("read_at", null)
    : query;
  const countResult = await applyFilter(
    client.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId),
  );
  if (countResult.error || countResult.count === null) {
    throw new NotificationDataError("LIST_UNAVAILABLE", { cause: countResult.error });
  }
  const window = pageWindow(countResult.count, page, pageSize);
  if (window.offset === null || window.rangeEnd === null) {
    return { items: [], total: countResult.count, nextCursor: null };
  }
  const offset = window.offset;
  const result = await applyFilter(
    client
      .from("notifications")
      .select("id, type, payload, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, window.rangeEnd),
  );
  if (result.error) throw new NotificationDataError("LIST_UNAVAILABLE", { cause: result.error });
  const items = (result.data ?? []).map((row) => {
    const payload = payloadObject(row.payload);
    const explicitHref = payloadText(payload, "href");
    return {
      id: row.id,
      title: payloadText(payload, "title") || row.type,
      body: payloadText(payload, "body"),
      href: explicitHref ? safeInternalPath(explicitHref, "/notifications") : null,
      createdAt: row.created_at,
      read: row.read_at !== null,
    } satisfies Notification;
  });
  return {
    items,
    total: countResult.count,
    nextCursor: offset + items.length < countResult.count ? String(page + 1) : null,
  };
}

export async function markNotificationRead(client: MarketoSupabaseClient, notificationId: string) {
  const { error } = await client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
  if (error) throw new NotificationDataError("MUTATION_FAILED", { cause: error });
}
