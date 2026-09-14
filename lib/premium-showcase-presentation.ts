/** Demo items complete carousel pairs; they never occupy promotion capacity. */
export function premiumDemoCount(realCount: number): number {
  if (!Number.isSafeInteger(realCount) || realCount < 0) return 0;
  return realCount === 0 ? 2 : realCount % 2;
}

/** The existing shell tops out at 1440px (1390px content); four columns fit there. */
export function premiumCardsPerPage(contentWidth: number): number {
  return contentWidth >= 1340 ? 4 : contentWidth >= 1040 ? 3 : 2;
}

/** Dynamic page size; no additional demo padding for desktop rows. */
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
