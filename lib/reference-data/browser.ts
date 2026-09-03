"use client";

import { listActiveCategories, mapCategoryReferenceRows } from "@/lib/data/supabase/categories";
import {
  listActiveCountries,
  listActiveRegions,
  listSelectableSettlements,
  mapGeographyReferenceRows,
} from "@/lib/data/supabase/geography";
import { createSingleFlightTtlLoader } from "@/lib/reference-data/cache";
import type {
  CategoryReferenceData,
  GeographyReferenceData,
  ReferenceDataEnvelope,
} from "@/lib/reference-data/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const BROWSER_REFERENCE_TTL_MS = 5 * 60 * 1000;

async function requestCategoryReferences(): Promise<ReferenceDataEnvelope<CategoryReferenceData>> {
  const rows = await listActiveCategories(getSupabaseBrowserClient());
  return { status: "ready", data: mapCategoryReferenceRows(rows) };
}

async function requestGeographyReferences(): Promise<ReferenceDataEnvelope<GeographyReferenceData>> {
  const client = getSupabaseBrowserClient();
  const [countries, regions, settlements] = await Promise.all([
    listActiveCountries(client),
    listActiveRegions(client),
    listSelectableSettlements(client),
  ]);
  return { status: "ready", data: mapGeographyReferenceRows(countries, regions, settlements) };
}

export const loadBrowserCategoryReferences = createSingleFlightTtlLoader(
  requestCategoryReferences,
  BROWSER_REFERENCE_TTL_MS,
);

export const loadBrowserGeographyReferences = createSingleFlightTtlLoader(
  requestGeographyReferences,
  BROWSER_REFERENCE_TTL_MS,
);
