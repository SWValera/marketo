/** Demo cards only fill the initial four tiles or an odd mobile row.
 * They never represent available promotion slots or enter the active count.
 */
export function premiumDemoCount(realCount: number): number {
  if (!Number.isSafeInteger(realCount) || realCount < 0) return 0;
  if (realCount < 4) return 4 - realCount;
  return realCount < 15 && realCount % 2 === 1 ? 1 : 0;
}
