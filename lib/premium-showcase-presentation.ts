/** Fill only the final carousel page; an empty scope has one full demo page. */
export function premiumDemoCount(realCount: number, cardsPerPage = 2): number {
  if (!Number.isSafeInteger(realCount) || realCount < 0) return 0;
  const size = [2, 3, 4].includes(cardsPerPage) ? cardsPerPage : 2;
  return realCount === 0 ? size : (size - realCount % size) % size;
}

/** Expanded city slots are independent of carousel padding. National has no capacity. */
export function premiumExpandedDemoCount(realCount: number, capacity: number | null, cardsPerPage: number) {
  return capacity === null ? (realCount === 0 ? cardsPerPage : 0) : Math.max(0, capacity - realCount);
}

/** Actual content width plus viewport geometry, never device identification. */
export function premiumCardsPerPage(contentWidth: number, landscape = false, shortLandscape = false): number {
  if (shortLandscape && landscape && contentWidth >= 480) return 3;
  return contentWidth >= 1340 || (landscape && contentWidth >= 860) ? 4 : 2;
}

/** Slice already composed carousel items, preserving the server order. */
export function premiumCarouselPage<T>(items: readonly T[], requestedPage: number, cardsPerPage = 2) {
  const size = [2, 3, 4].includes(cardsPerPage) ? cardsPerPage : 2;
  const pageCount = Math.ceil(items.length / size);
  const requested = Number.isSafeInteger(requestedPage) ? requestedPage : 0;
  const pageIndex = pageCount ? ((requested % pageCount) + pageCount) % pageCount : 0;
  return { pageIndex, pageCount, items: items.slice(pageIndex * size, pageIndex * size + size) };
}

/** Current, next and previous pages only; preserves the server's real-first order. */
export function premiumPreparedIndexes(length: number, page: number, size: number) {
  const count = Math.ceil(length / size);
  const indexes = new Set<number>();
  if (!count) return indexes;
  for (const offset of [0, 1, -1]) {
    const current = ((page + offset) % count + count) % count;
    for (let i = current * size; i < Math.min(length, (current + 1) * size); i++) indexes.add(i);
  }
  return indexes;
}
