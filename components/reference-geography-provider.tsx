"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  EMPTY_GEOGRAPHY,
  type GeographyReferenceData,
  type ReferenceDataEnvelope,
} from "@/lib/reference-data/types";

type GeographyContextValue = ReferenceDataEnvelope<GeographyReferenceData> & {
  ensureLoaded: () => void;
};

const fallback: GeographyContextValue = {
  status: "unconfigured",
  data: EMPTY_GEOGRAPHY,
  reason: "missing_configuration",
  ensureLoaded: () => undefined,
};

const GeographyContext = createContext<GeographyContextValue>(fallback);

export function ReferenceGeographyProvider({ children }: { children: React.ReactNode }) {
  const [reference, setReference] = useState<ReferenceDataEnvelope<GeographyReferenceData>>(fallback);
  const loading = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (reference.status === "ready" || loading.current) return;
    loading.current = true;
    void import("@/lib/reference-data/browser")
      .then(({ loadBrowserGeographyReferences }) => loadBrowserGeographyReferences())
      .then(setReference)
      .catch(() => setReference({ status: "error", data: EMPTY_GEOGRAPHY, reason: "query_failed" }))
      .finally(() => { loading.current = false; });
  }, [reference.status]);

  return <GeographyContext.Provider value={{ ...reference, ensureLoaded }}>{children}</GeographyContext.Provider>;
}

export function useReferenceGeography() {
  return useContext(GeographyContext);
}
