export const SHOWCASE_ROTATION_MS = 3000;

export type RotationAnchor = {
  anchorMs: number;
  baseIndex: number;
};

/**
 * The fixed epoch keeps the rotation timeline alive while Home is unmounted.
 * A refresh, navigation, or locale change therefore resolves the same frame
 * for the same moment instead of restarting a component-local interval.
 */
export const SHOWCASE_ROTATION_ANCHOR: RotationAnchor = Object.freeze({
  anchorMs: 0,
  baseIndex: 0,
});

export function rotationFrameAt(
  nowMs: number,
  anchor: RotationAnchor = SHOWCASE_ROTATION_ANCHOR,
  intervalMs = SHOWCASE_ROTATION_MS,
) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(anchor.anchorMs) || !Number.isFinite(anchor.baseIndex)) return 0;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return Math.trunc(anchor.baseIndex);
  const elapsedMs = Math.max(0, nowMs - anchor.anchorMs);
  return Math.trunc(anchor.baseIndex) + Math.floor(elapsedMs / intervalMs);
}

export function rotationIndexAt(frame: number, itemCount: number, manualOffset = 0) {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) return 0;
  const value = Math.trunc(frame) + Math.trunc(manualOffset);
  return ((value % itemCount) + itemCount) % itemCount;
}

export function showcaseWindow<T>(items: readonly T[], frame: number, manualOffset = 0, visibleCount = 3): T[] {
  if (!items.length || !Number.isSafeInteger(visibleCount) || visibleCount < 1) return [];
  const start = rotationIndexAt(frame, items.length, manualOffset);
  return Array.from(
    { length: Math.min(visibleCount, items.length) },
    (_, index) => items[(start + index) % items.length],
  );
}
