"use client";

import { createSingleFlightTtlLoader } from "@/lib/reference-data/cache";
import {
  CATEGORY_REFERENCE_VERSION,
  GEOGRAPHY_REFERENCE_VERSION,
} from "@/lib/reference-data/release";
import type {
  CategoryReferenceData,
  GeographyReferenceData,
  ReferenceDataEnvelope,
} from "@/lib/reference-data/types";

const BROWSER_REFERENCE_TTL_MS = 5 * 60 * 1000;

async function requestCategoryReferences(): Promise<ReferenceDataEnvelope<CategoryReferenceData>> {
  const response = await fetch(`/api/reference/categories?v=${encodeURIComponent(CATEGORY_REFERENCE_VERSION)}`, {
    headers: { accept: "application/json" },
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("category_reference_unavailable");
  const data = await response.json() as CategoryReferenceData;
  if (!data || !Array.isArray(data.categories)) throw new Error("category_reference_malformed");
  return { status: "ready", data };
}

async function requestGeographyReferences(): Promise<ReferenceDataEnvelope<GeographyReferenceData>> {
  const response = await fetch(`/api/reference/geography?v=${encodeURIComponent(GEOGRAPHY_REFERENCE_VERSION)}`, {
    headers: { accept: "application/json" },
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("geography_reference_unavailable");
  const data = await response.json() as GeographyReferenceData;
  if (!data || !Array.isArray(data.countries) || !Array.isArray(data.regions) || !Array.isArray(data.settlements)) {
    throw new Error("geography_reference_malformed");
  }
  return { status: "ready", data };
}

export const loadBrowserCategoryReferences = createSingleFlightTtlLoader(
  requestCategoryReferences,
  BROWSER_REFERENCE_TTL_MS,
);

export const loadBrowserGeographyReferences = createSingleFlightTtlLoader(
  requestGeographyReferences,
  BROWSER_REFERENCE_TTL_MS,
);
