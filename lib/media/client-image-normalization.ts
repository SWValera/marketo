"use client";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
// Covers the 8064x6048 (48 MP) iPhone sensor output without allowing even
// larger sources to force an unbounded RGBA decode in a mobile browser.
const MAX_SOURCE_PIXELS = 50_000_000;
const MAX_SOURCE_DIMENSION = 12_000;
const MIN_IMAGE_SIDE = 240;
const MAX_OUTPUT_DIMENSION = 2_560;
const JPEG_QUALITIES = [0.86, 0.76, 0.66] as const;

export type ClientDecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
};

export type ClientImageRuntime = {
  decode(file: File): Promise<ClientDecodedImage>;
  encodeJpeg(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob>;
};

function browserRuntime(): ClientImageRuntime {
  return {
    decode(file) {
      return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        let settled = false;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          image.onload = null;
          image.onerror = null;
          image.removeAttribute("src");
          URL.revokeObjectURL(objectUrl);
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          release();
          reject(new Error("image_decode_failed"));
        };
        image.decoding = "async";
        image.onload = () => {
          if (settled) return;
          settled = true;
          resolve({
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            release,
          });
        };
        image.onerror = fail;
        image.src = objectUrl;
      });
    },
    async encodeJpeg(source, width, height, quality) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      // Older iOS WebKit builds can reject the newer colorSpace option even
      // though their 2D canvas encoder is otherwise fully usable.
      const context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" })
        ?? canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("image_encode_failed");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      canvas.width = 1;
      canvas.height = 1;
      if (!blob) throw new Error("image_encode_failed");
      return blob;
    },
  };
}

export function clientListingImageSize(width: number, height: number) {
  if (!Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || Math.min(width, height) < MIN_IMAGE_SIDE
    || width > MAX_SOURCE_DIMENSION
    || height > MAX_SOURCE_DIMENSION
    || width > Math.floor(MAX_SOURCE_PIXELS / height)) {
    throw new Error("invalid_image_dimensions");
  }
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / width, MAX_OUTPUT_DIMENSION / height);
  const output = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  if (Math.min(output.width, output.height) < MIN_IMAGE_SIDE) throw new Error("invalid_image_dimensions");
  return output;
}

/**
 * Decode on the user's device and upload only a bounded, metadata-free JPEG.
 * The iOS photo picker exports a JPEG when the input requests JPEG/PNG/WebP.
 * Newer WebKit builds may also hand this function HEIC directly; every
 * decodable source follows the same path, so the R2 upload contract is
 * deterministic.
 */
export async function normalizeListingPhotoForUpload(file: File, runtime: ClientImageRuntime = browserRuntime()) {
  if (file.size < 32 || file.size > MAX_SOURCE_BYTES) throw new Error("invalid_image_size");
  const decoded = await runtime.decode(file);
  try {
    const size = clientListingImageSize(decoded.width, decoded.height);
    let output: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      const candidate = await runtime.encodeJpeg(decoded.source, size.width, size.height, quality);
      if (candidate.type !== "image/jpeg" || candidate.size < 32) throw new Error("image_encode_failed");
      output = candidate;
      if (candidate.size <= MAX_SOURCE_BYTES) break;
    }
    if (!output || output.size > MAX_SOURCE_BYTES) throw new Error("normalized_image_too_large");
    const basename = file.name.replace(/\.[^./\\]+$/, "").trim() || "photo";
    return new File([output], `${basename}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    decoded.release();
  }
}

export const clientListingImageNormalization = {
  maxSourceBytes: MAX_SOURCE_BYTES,
  maxSourcePixels: MAX_SOURCE_PIXELS,
  maxSourceDimension: MAX_SOURCE_DIMENSION,
  minSide: MIN_IMAGE_SIDE,
  maxOutputDimension: MAX_OUTPUT_DIMENSION,
  outputMimeType: "image/jpeg",
} as const;
