"use client";

import { createContext, useContext } from "react";
import {
  EMPTY_GEOGRAPHY,
  type GeographyReferenceData,
  type ReferenceDataEnvelope,
} from "@/lib/reference-data/types";

const fallback: ReferenceDataEnvelope<GeographyReferenceData> = {
  status: "unconfigured",
  data: EMPTY_GEOGRAPHY,
  reason: "missing_configuration",
};

const GeographyContext = createContext<ReferenceDataEnvelope<GeographyReferenceData>>(fallback);

export function ReferenceGeographyProvider({
  value,
  children,
}: {
  value: ReferenceDataEnvelope<GeographyReferenceData>;
  children: React.ReactNode;
}) {
  return <GeographyContext.Provider value={value}>{children}</GeographyContext.Provider>;
}

export function useReferenceGeography() {
  return useContext(GeographyContext);
}
