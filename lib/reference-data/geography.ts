import type {
  GeographyReferenceData,
  ReferenceRegion,
  ReferenceSettlement,
} from "@/lib/reference-data/types";

export function getRegion(reference: GeographyReferenceData, regionId?: string | null) {
  return regionId ? reference.regions.find((region) => region.id === regionId) : undefined;
}

export function getSettlement(reference: GeographyReferenceData, value?: string | null) {
  if (!value || value === "all") return undefined;
  return reference.settlements.find((settlement) => settlement.id === value || settlement.slug === value);
}

export function getFeaturedSettlements(reference: GeographyReferenceData, limit = 8) {
  const regionById = new Map(reference.regions.map((region) => [region.id, region]));
  const sorted = [...reference.settlements].sort((left, right) => {
    const leftRegion = regionById.get(left.regionId);
    const rightRegion = regionById.get(right.regionId);
    const leftPriority = leftRegion?.kind === "republican_city" ? 0 : 1;
    const rightPriority = rightRegion?.kind === "republican_city" ? 0 : 1;
    return leftPriority - rightPriority
      || (leftRegion?.sortOrder ?? 0) - (rightRegion?.sortOrder ?? 0)
      || left.sortOrder - right.sortOrder
      || left.name.ru.localeCompare(right.name.ru, "ru");
  });

  const selected: ReferenceSettlement[] = [];
  const representedRegions = new Set<string>();
  for (const settlement of sorted) {
    const region = regionById.get(settlement.regionId);
    if (region?.kind !== "republican_city" && representedRegions.has(settlement.regionId)) continue;
    selected.push(settlement);
    representedRegions.add(settlement.regionId);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function searchSettlements(reference: GeographyReferenceData, query: string) {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ru");
  const regionById = new Map<string, ReferenceRegion>(reference.regions.map((region) => [region.id, region]));
  if (!normalized) return reference.settlements;

  return reference.settlements.filter((settlement) => {
    const region = regionById.get(settlement.regionId);
    return `${settlement.name.ru} ${settlement.name.kk} ${region?.name.ru ?? ""} ${region?.name.kk ?? ""}`
      .toLocaleLowerCase("ru")
      .includes(normalized);
  });
}
