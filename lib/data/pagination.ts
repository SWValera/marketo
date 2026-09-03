export type PageInput = number | string | string[] | undefined;

export function normalizePositivePage(value: PageInput) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === "number") {
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 1;
  }
  if (typeof candidate !== "string" || !/^[1-9]\d*$/.test(candidate)) return 1;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

export function normalizePageSize(value: number | undefined, fallback: number, maximum: number) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.min(value as number, maximum)
    : fallback;
}

export function pageWindow(total: number, page: number, pageSize: number) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("invalid_exact_count");
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const outOfRange = page > 1 && page > totalPages;
  if (outOfRange || total === 0) {
    return { totalPages, outOfRange, offset: null, rangeEnd: null };
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    return { totalPages, outOfRange: true, offset: null, rangeEnd: null };
  }
  return { totalPages, outOfRange: false, offset, rangeEnd: offset + pageSize - 1 };
}
