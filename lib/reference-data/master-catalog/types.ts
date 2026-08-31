export type MasterLocalizedText = { ru: string; kk: string };

export type MasterCatalogNode = {
  slug: string;
  name?: MasterLocalizedText;
  icon?: string;
  tone?: string;
  searchPlaceholder?: MasterLocalizedText;
  titlePlaceholder?: MasterLocalizedText;
  descriptionHint?: MasterLocalizedText;
  priceMode?: "price" | "salary" | "free" | "exchange";
  children?: MasterCatalogNode[];
  /** Attribute profiles inherited by descendants unless a child overrides them. */
  schemaProfiles?: string[];
  /** Explicitly marks a catch-all leaf whose breadth is intentional. */
  intentionalFallback?: boolean;
};

export type CatalogEntry = readonly [
  slug: string,
  ru: string,
  kk: string,
  profiles?: readonly string[],
];

export const tx = (ru: string, kk: string): MasterLocalizedText => ({ ru, kk });

export const leaf = (
  slug: string,
  ru: string,
  kk: string,
  schemaProfiles?: readonly string[],
): MasterCatalogNode => ({
  slug,
  name: tx(ru, kk),
  ...(schemaProfiles ? { schemaProfiles: [...schemaProfiles] } : {}),
});

export const fallbackLeaf = (
  slug: string,
  ru: string,
  kk: string,
  schemaProfiles?: readonly string[],
): MasterCatalogNode => ({
  ...leaf(slug, ru, kk, schemaProfiles),
  intentionalFallback: true,
});

export const leaves = (
  entries: readonly CatalogEntry[],
  inheritedProfiles?: readonly string[],
): MasterCatalogNode[] => entries.map(([slug, ru, kk, profiles]) =>
  leaf(slug, ru, kk, profiles ?? inheritedProfiles));

export const branch = (
  slug: string,
  ru: string,
  kk: string,
  children: MasterCatalogNode[],
  schemaProfiles?: readonly string[],
): MasterCatalogNode => ({
  slug,
  name: tx(ru, kk),
  children,
  ...(schemaProfiles ? { schemaProfiles: [...schemaProfiles] } : {}),
});

export const overlay = (
  slug: string,
  children: MasterCatalogNode[],
  schemaProfiles?: readonly string[],
): MasterCatalogNode => ({
  slug,
  children,
  ...(schemaProfiles ? { schemaProfiles: [...schemaProfiles] } : {}),
});
