import { listingImageLimits } from "./image-validation.ts";

const MAX_SOURCE_IMAGE_PIXELS = 100_000_000;
const MAX_SOURCE_IMAGE_DIMENSION = 12_000;
const MAX_OUTPUT_IMAGE_DIMENSION = 2_560;
const OUTPUT_MIME_TYPE = "image/webp" as const;
const OUTPUT_EXTENSION = "webp" as const;
const OUTPUT_QUALITY = 84;

type ImageFamily = "jpeg" | "png" | "webp" | "heic";

export type NormalizedListingImage = {
  bytes: Uint8Array;
  byteSize: number;
  width: number;
  height: number;
  mimeType: typeof OUTPUT_MIME_TYPE;
  extension: typeof OUTPUT_EXTENSION;
  sha256: string;
};

function imageFamily(value: string | null | undefined): ImageFamily | null {
  const normalized = value?.split(";", 1)[0].trim().toLowerCase();
  if (!normalized) return null;
  if (["jpeg", "jpg", "image/jpeg", "image/jpg", "image/pjpeg"].includes(normalized)) return "jpeg";
  if (["png", "image/png", "image/x-png"].includes(normalized)) return "png";
  if (["webp", "image/webp"].includes(normalized)) return "webp";
  if (["heic", "heif", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(normalized)) {
    return "heic";
  }
  return null;
}

function streamBytes(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function validDimensions(info: ImageInfoResponse): info is Extract<ImageInfoResponse, { width: number }> {
  return "width" in info
    && Number.isSafeInteger(info.width)
    && Number.isSafeInteger(info.height)
    && info.width > 0
    && info.height > 0;
}

function isInvalidImageError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 9412;
}

/**
 * Decode every user image with Cloudflare Images and keep only a normalized,
 * metadata-free WebP derivative. The original bytes never reach R2.
 */
export async function normalizeListingImage(file: File, images: ImagesBinding): Promise<NormalizedListingImage> {
  if (file.size < 32 || file.size > listingImageLimits.maxBytes) throw new Error("invalid_image_size");

  let sourceInfo: ImageInfoResponse;
  try {
    sourceInfo = await images.info(file.stream());
  } catch (error) {
    throw new Error(isInvalidImageError(error) ? "unsupported_image_content" : "image_processing_failed");
  }
  if (!validDimensions(sourceInfo)) throw new Error("unsupported_image_content");

  const detectedFamily = imageFamily(sourceInfo.format);
  if (!detectedFamily) throw new Error("unsupported_image_content");
  const declaredType = file.type.trim().toLowerCase();
  const declaredFamily = imageFamily(declaredType);
  if (declaredType && declaredType !== "application/octet-stream" && !declaredFamily) {
    throw new Error("unsupported_image_content");
  }
  if (declaredFamily && declaredFamily !== detectedFamily) throw new Error("image_mime_mismatch");

  if (Math.min(sourceInfo.width, sourceInfo.height) < listingImageLimits.minSide) {
    throw new Error("image_dimensions_too_small");
  }
  if (sourceInfo.width > MAX_SOURCE_IMAGE_DIMENSION
    || sourceInfo.height > MAX_SOURCE_IMAGE_DIMENSION
    || sourceInfo.width > Math.floor(MAX_SOURCE_IMAGE_PIXELS / sourceInfo.height)) {
    throw new Error("image_dimensions_too_large");
  }

  let response: Response;
  try {
    const result = await images
      .input(file.stream())
      .transform({ width: MAX_OUTPUT_IMAGE_DIMENSION, height: MAX_OUTPUT_IMAGE_DIMENSION, fit: "scale-down" })
      .output({ format: OUTPUT_MIME_TYPE, quality: OUTPUT_QUALITY, anim: false });
    response = result.response();
  } catch (error) {
    throw new Error(isInvalidImageError(error) ? "unsupported_image_content" : "image_processing_failed");
  }
  if (!response.ok || imageFamily(response.headers.get("content-type")) !== "webp") {
    throw new Error("image_processing_failed");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 32 || bytes.length > listingImageLimits.maxBytes) throw new Error("normalized_image_too_large");

  let outputInfo: ImageInfoResponse;
  try {
    outputInfo = await images.info(streamBytes(bytes));
  } catch {
    throw new Error("image_processing_failed");
  }
  if (!validDimensions(outputInfo)
    || imageFamily(outputInfo.format) !== "webp"
    || outputInfo.width > MAX_OUTPUT_IMAGE_DIMENSION
    || outputInfo.height > MAX_OUTPUT_IMAGE_DIMENSION) {
    throw new Error("image_processing_failed");
  }

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    bytes,
    byteSize: bytes.length,
    width: outputInfo.width,
    height: outputInfo.height,
    mimeType: OUTPUT_MIME_TYPE,
    extension: OUTPUT_EXTENSION,
    sha256,
  };
}

export const listingImageNormalization = {
  maxSourcePixels: MAX_SOURCE_IMAGE_PIXELS,
  maxSourceDimension: MAX_SOURCE_IMAGE_DIMENSION,
  maxOutputDimension: MAX_OUTPUT_IMAGE_DIMENSION,
  outputMimeType: OUTPUT_MIME_TYPE,
  outputQuality: OUTPUT_QUALITY,
} as const;
