export type ListingAttributePreview =
  | { known: false }
  | { known: true; value: string | number | boolean };

/**
 * Catalog cards deliberately omit category attributes from their fast payload.
 * Unknown values must not be treated as a failed client-side match: the server
 * catalog RPC remains authoritative when the user applies the filter.
 */
export function readListingAttributePreview(
  attributes: Record<string, string | number | boolean> | undefined,
  key: string,
): ListingAttributePreview {
  if (!attributes || !Object.prototype.hasOwnProperty.call(attributes, key)) {
    return { known: false };
  }
  return { known: true, value: attributes[key] };
}
