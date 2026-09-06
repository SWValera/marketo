export const ownerListingTabs = ["all", "active", "drafts", "pending", "archive"] as const;
export type OwnerListingTab = typeof ownerListingTabs[number];
export function normalizeOwnerListingTab(value: unknown): OwnerListingTab {
  return typeof value === "string" && ownerListingTabs.includes(value as OwnerListingTab) ? value as OwnerListingTab : "all";
}
export function ownerListingFilter(tab: OwnerListingTab, now: string) {
  if (tab === "active") return `and(status.eq.active,expires_at.gt.${now})`;
  if (tab === "drafts") return "status.in.(draft,rejected)";
  if (tab === "pending") return "status.eq.pending";
  if (tab === "archive") return `status.in.(archived,expired,sold),and(status.eq.active,or(expires_at.lte.${now},expires_at.is.null))`;
  return null;
}
export function ownerProfileHref(tab: OwnerListingTab, page: number | string = 1) {
  return `/profile?tab=${tab}&page=${page}`;
}
