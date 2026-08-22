export type LocalizedText = {
  ru: string;
  kk: string;
};

export type ReferenceDataStatus = "ready" | "unconfigured" | "error";

export type ReferenceDataEnvelope<T> = {
  status: ReferenceDataStatus;
  data: T;
  reason?: "missing_configuration" | "query_failed";
};

export type ReferenceCountry = {
  id: string;
  code: string;
  slug: string;
  name: LocalizedText;
  currencyCode: string;
  currencySymbol: string;
  currencyExponent: number;
  phoneCode: string;
  sortOrder: number;
};

export type ReferenceRegion = {
  id: string;
  countryId: string;
  code: string;
  slug: string;
  name: LocalizedText;
  kind: "region" | "republican_city" | "territory";
  sortOrder: number;
};

export type ReferenceSettlement = {
  id: string;
  regionId: string;
  parentId: string | null;
  katoCode: string | null;
  slug: string;
  name: LocalizedText;
  kind: "city" | "town" | "urban_settlement" | "village" | "district" | "city_district" | "other";
  sortOrder: number;
};

export type GeographyReferenceData = {
  countries: ReferenceCountry[];
  regions: ReferenceRegion[];
  settlements: ReferenceSettlement[];
};

export type CategoryPriceMode = "price" | "salary" | "free" | "exchange";

export type ReferenceCategory = {
  id: string;
  parentId: string | null;
  slug: string;
  name: LocalizedText;
  icon: string | null;
  tone: string | null;
  searchPlaceholder: LocalizedText | null;
  titlePlaceholder: LocalizedText | null;
  descriptionHint: LocalizedText | null;
  priceMode: CategoryPriceMode;
  sortOrder: number;
};

export type CategoryReferenceData = {
  categories: ReferenceCategory[];
};

export type CategoryAttributeDataType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "range"
  | "date";

export type ReferenceAttributeOption = {
  id: string;
  attributeId: string;
  value: string;
  label: LocalizedText;
  sortOrder: number;
};

export type ReferenceCategoryAttribute = {
  id: string;
  categoryId: string;
  key: string;
  label: LocalizedText;
  dataType: CategoryAttributeDataType;
  unit: LocalizedText | null;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  inheritsToChildren: boolean;
  validation: unknown;
  sortOrder: number;
  options: ReferenceAttributeOption[];
};

export type CategoryAttributeReferenceData = {
  categoryId: string;
  attributes: ReferenceCategoryAttribute[];
};

export const EMPTY_GEOGRAPHY: GeographyReferenceData = {
  countries: [],
  regions: [],
  settlements: [],
};

export const EMPTY_CATEGORIES: CategoryReferenceData = {
  categories: [],
};

export function emptyCategoryAttributes(categoryId = ""): CategoryAttributeReferenceData {
  return { categoryId, attributes: [] };
}
