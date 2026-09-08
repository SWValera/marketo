"use client";

import { useEffect, useState } from "react";
import {
  emptyCategoryAttributes,
  type CategoryAttributeReferenceData,
  type ReferenceDataEnvelope,
} from "@/lib/reference-data/types";
import { readLruEntry, writeLruEntry } from "@/lib/reference-data/bounded-map";
import { CATEGORY_REFERENCE_VERSION } from "@/lib/reference-data/release";
import { fetchWithDeadline } from "@/lib/http/fetch-deadline";

const RESPONSE_CACHE_MAX_ENTRIES = 64;
const responseCache = new Map<string, CategoryAttributeReferenceData>();
const inFlightRequests = new Map<string, Promise<CategoryAttributeReferenceData>>();

function requestCategoryAttributes(categoryId: string) {
  const cacheKey = `${CATEGORY_REFERENCE_VERSION}:${categoryId}`;
  const cached = readLruEntry(responseCache, cacheKey);
  if (cached) return Promise.resolve(cached);

  const pending = inFlightRequests.get(cacheKey);
  if (pending) return pending;

  const request = fetchWithDeadline(`/api/reference/categories/${encodeURIComponent(categoryId)}/attributes?v=${encodeURIComponent(CATEGORY_REFERENCE_VERSION)}`, {
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("reference_data_unavailable");
      return response.json() as Promise<CategoryAttributeReferenceData>;
    })
    .then((data) => {
      writeLruEntry(responseCache, cacheKey, data, RESPONSE_CACHE_MAX_ENTRIES);
      return data;
    })
    .finally(() => {
      if (inFlightRequests.get(cacheKey) === request) inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, request);
  return request;
}

export function useCategoryAttributes(
  categoryId: string | undefined,
  initial?: ReferenceDataEnvelope<CategoryAttributeReferenceData>,
) {
  const [requestState, setRequestState] = useState<{
    categoryId: string;
    status: "ready" | "error";
    data: CategoryAttributeReferenceData;
  } | null>(null);

  useEffect(() => {
    if (!categoryId) return;
    const cacheKey = `${CATEGORY_REFERENCE_VERSION}:${categoryId}`;
    if (initial?.status === "ready" && initial.data.categoryId === categoryId) {
      writeLruEntry(responseCache, cacheKey, initial.data, RESPONSE_CACHE_MAX_ENTRIES);
      return;
    }
    if (readLruEntry(responseCache, cacheKey)) return;

    let active = true;
    void requestCategoryAttributes(categoryId)
      .then((data) => {
        if (!active) return;
        setRequestState({ categoryId, status: "ready", data });
      })
      .catch(() => {
        if (!active) return;
        setRequestState({ categoryId, status: "error", data: emptyCategoryAttributes(categoryId) });
      });

    // Keep the shared public request alive so another mounted consumer can
    // reuse it; only detach this component's state update on cleanup.
    return () => { active = false; };
  }, [categoryId, initial]);

  if (!categoryId) return { categoryId: "", status: "idle" as const, data: emptyCategoryAttributes() };
  if (initial?.status === "ready" && initial.data.categoryId === categoryId) {
    return { categoryId, status: "ready" as const, data: initial.data };
  }
  const cached = responseCache.get(`${CATEGORY_REFERENCE_VERSION}:${categoryId}`);
  if (cached) return { categoryId, status: "ready" as const, data: cached };
  if (requestState?.categoryId === categoryId) return requestState;
  return { categoryId, status: "loading" as const, data: emptyCategoryAttributes(categoryId) };
}
