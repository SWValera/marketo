"use client";

import { useEffect, useState } from "react";
import {
  emptyCategoryAttributes,
  type CategoryAttributeReferenceData,
  type ReferenceDataEnvelope,
} from "@/lib/reference-data/types";
import { readLruEntry, writeLruEntry } from "@/lib/reference-data/bounded-map";

const RESPONSE_CACHE_MAX_ENTRIES = 64;
const responseCache = new Map<string, CategoryAttributeReferenceData>();

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
    if (initial?.status === "ready" && initial.data.categoryId === categoryId) {
      writeLruEntry(responseCache, categoryId, initial.data, RESPONSE_CACHE_MAX_ENTRIES);
      return;
    }
    if (readLruEntry(responseCache, categoryId)) return;

    const controller = new AbortController();
    void fetch(`/api/reference/categories/${encodeURIComponent(categoryId)}/attributes`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("reference_data_unavailable");
        return response.json() as Promise<CategoryAttributeReferenceData>;
      })
      .then((data) => {
        writeLruEntry(responseCache, categoryId, data, RESPONSE_CACHE_MAX_ENTRIES);
        setRequestState({ categoryId, status: "ready", data });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRequestState({ categoryId, status: "error", data: emptyCategoryAttributes(categoryId) });
      });

    return () => controller.abort();
  }, [categoryId, initial]);

  if (!categoryId) return { categoryId: "", status: "idle" as const, data: emptyCategoryAttributes() };
  if (initial?.status === "ready" && initial.data.categoryId === categoryId) {
    return { categoryId, status: "ready" as const, data: initial.data };
  }
  const cached = responseCache.get(categoryId);
  if (cached) return { categoryId, status: "ready" as const, data: cached };
  if (requestState?.categoryId === categoryId) return requestState;
  return { categoryId, status: "loading" as const, data: emptyCategoryAttributes(categoryId) };
}
