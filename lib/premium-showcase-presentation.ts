/** Demo items complete carousel pairs; they never occupy promotion capacity. */
export function premiumDemoCount(realCount: number): number {
  if (!Number.isSafeInteger(realCount) || realCount < 0) return 0;
  return realCount === 0 ? 2 : realCount % 2;
}

/** A real page of two items, with deterministic circular navigation. */
export function premiumCarouselPage<T>(items: readonly T[], requestedPage: number) {
  const pageCount = Math.ceil(items.length / 2);
  const requested = Number.isSafeInteger(requestedPage) ? requestedPage : 0;
  const pageIndex = pageCount ? ((requested % pageCount) + pageCount) % pageCount : 0;
  return { pageIndex, pageCount, items: items.slice(pageIndex * 2, pageIndex * 2 + 2) };
}
