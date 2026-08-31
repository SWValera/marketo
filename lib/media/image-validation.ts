const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MIN_IMAGE_SIDE = 240;

export type ValidatedImage = {
  bytes: Uint8Array;
  byteSize: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  extension: "jpg" | "png" | "webp" | "avif";
  sha256: string;
};

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if (sof.has(marker) && length >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return null;
}

function pngDimensions(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value) || ascii(bytes, 12, 4) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const variant = ascii(bytes, 12, 4);
  if (variant === "VP8X") return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 };
  if (variant === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (variant === "VP8L" && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function avifDimensions(bytes: Uint8Array) {
  if (bytes.length < 32 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= Math.min(bytes.length, 64); offset += 4) brands.push(ascii(bytes, offset, 4));
  if (!brands.some((brand) => brand === "avif" || brand === "avis")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 4; offset + 16 <= Math.min(bytes.length, 1024 * 1024); offset += 1) {
    if (ascii(bytes, offset, 4) !== "ispe") continue;
    const width = view.getUint32(offset + 8);
    const height = view.getUint32(offset + 12);
    if (width && height) return { width, height };
  }
  return null;
}

function detect(bytes: Uint8Array) {
  const png = pngDimensions(bytes);
  if (png) return { ...png, mimeType: "image/png" as const, extension: "png" as const };
  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { ...jpeg, mimeType: "image/jpeg" as const, extension: "jpg" as const };
  const webp = webpDimensions(bytes);
  if (webp) return { ...webp, mimeType: "image/webp" as const, extension: "webp" as const };
  const avif = avifDimensions(bytes);
  if (avif) return { ...avif, mimeType: "image/avif" as const, extension: "avif" as const };
  return null;
}

export async function validateListingImage(file: File): Promise<ValidatedImage> {
  if (file.size < 32 || file.size > MAX_IMAGE_BYTES) throw new Error("invalid_image_size");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detect(bytes);
  if (!detected) throw new Error("unsupported_image_content");
  if (file.type && file.type !== detected.mimeType) throw new Error("image_mime_mismatch");
  if (Math.min(detected.width, detected.height) < MIN_IMAGE_SIDE) throw new Error("image_dimensions_too_small");
  if (detected.width * detected.height > MAX_IMAGE_PIXELS) throw new Error("image_dimensions_too_large");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { bytes, byteSize: file.size, ...detected, sha256 };
}

export const listingImageLimits = {
  maxFiles: 12,
  maxBytes: MAX_IMAGE_BYTES,
  maxTotalBytes: 60 * 1024 * 1024,
  minSide: MIN_IMAGE_SIDE,
  maxPixels: MAX_IMAGE_PIXELS,
} as const;
