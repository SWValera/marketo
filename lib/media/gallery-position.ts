/** Native horizontal scrolling remains usable before client hydration. */
export function galleryIndex(scrollLeft: number, width: number, count: number) {
  if (!Number.isFinite(scrollLeft) || !Number.isFinite(width) || width <= 0 || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / width)));
}

export function galleryTarget(index: number, count: number) {
  return Number.isFinite(index) ? Math.max(0, Math.min(Math.max(0, count - 1), Math.round(index))) : 0;
}
