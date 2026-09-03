const uuidSource = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuid = new RegExp(`^${uuidSource}$`, "i");
const sha256 = /^[a-f0-9]{64}$/;
const listingFilename = new RegExp(
  `^(?:\\d{2}-[a-f0-9]{20}|[a-f0-9]{20}-${uuidSource})\\.(?:jpg|png|webp|avif)$`,
  "i",
);

const supportedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const extensionContentTypes: Record<string, string> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function encodeMediaStoragePath(storageKey: string | null) {
  if (!storageKey || /[\\\u0000-\u001f\u007f]/.test(storageKey)) return null;
  const segments = storageKey.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.map(encodeURIComponent).join("/");
}

export function createListingImageStorageKey(input: {
  ownerId: string;
  listingId: string;
  digest: string;
  extension: "jpg" | "png";
  nonce?: string;
}) {
  const unique = input.nonce ?? crypto.randomUUID();
  if (!uuid.test(input.ownerId) || !uuid.test(input.listingId) || !sha256.test(input.digest) || !uuid.test(unique)) {
    throw new Error("invalid_media_storage_key");
  }
  return `listings/${input.ownerId}/${input.listingId}/${input.digest.slice(0, 20)}-${unique}.${input.extension}`;
}

export function isListingMediaFilename(value: string) {
  return listingFilename.test(value);
}

export function trustedListingMediaContentType(storageKey: string, storedContentType: string | null) {
  const extension = storageKey.slice(storageKey.lastIndexOf(".") + 1).toLowerCase();
  const extensionType = extensionContentTypes[extension];
  if (!extensionType) return null;
  if (storedContentType !== null && (!supportedContentTypes.has(storedContentType) || storedContentType !== extensionType)) return null;
  return extensionType;
}
