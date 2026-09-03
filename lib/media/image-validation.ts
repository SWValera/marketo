const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const MIN_IMAGE_SIDE = 240;
const MAX_JPEG_MARKERS = 4_096;
const MAX_JPEG_BLOCKS = 1_500_000;
const MAX_PNG_CHUNKS = 4_096;
const MAX_DECODED_IMAGE_BYTES = 64 * 1024 * 1024;

export type ValidatedImage = {
  bytes: Uint8Array;
  byteSize: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
  sha256: string;
};

type DetectedImage = Omit<ValidatedImage, "bytes" | "byteSize" | "sha256"> & {
  verifyPayload?: () => Promise<boolean>;
};

type JpegFrameComponent = { horizontalSampling: number; verticalSampling: number; quantizationTable: number };
type JpegFrame = {
  width: number;
  height: number;
  maxHorizontalSampling: number;
  maxVerticalSampling: number;
  components: Map<number, JpegFrameComponent>;
};
type JpegHuffmanTable = Array<Map<number, number>>;
type JpegScanComponent = { frame: JpegFrameComponent; dcTable: JpegHuffmanTable; acTable: JpegHuffmanTable };

const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function matches(bytes: Uint8Array, offset: number, expected: Uint8Array) {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function pngCrc(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) crc = PNG_CRC_TABLE[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parseJpegQuantizationTables(bytes: Uint8Array, start: number, end: number, tables: Set<number>) {
  if (start >= end) return false;
  let offset = start;
  while (offset < end) {
    const descriptor = bytes[offset++];
    const precision = descriptor >>> 4;
    const tableId = descriptor & 0x0f;
    // This validator intentionally supports only baseline DCT JPEG, whose
    // quantization tables use 8-bit precision.
    if (precision !== 0 || tableId > 3) return false;
    const valueBytes = 1;
    const tableBytes = 64 * valueBytes;
    if (tableBytes > end - offset) return false;
    for (let index = 0; index < 64; index += 1) {
      const value = valueBytes === 1 ? bytes[offset + index] : readUint16BE(bytes, offset + index * 2);
      if (value === 0) return false;
    }
    tables.add(tableId);
    offset += tableBytes;
  }
  return offset === end;
}

function parseJpegHuffmanTables(bytes: Uint8Array, start: number, end: number, tables: Map<number, JpegHuffmanTable>) {
  if (start >= end) return false;
  let offset = start;
  while (offset < end) {
    if (end - offset < 17) return false;
    const descriptor = bytes[offset++];
    const tableClass = descriptor >>> 4;
    const tableId = descriptor & 0x0f;
    if (tableClass > 1 || tableId > 3) return false;
    const counts = bytes.subarray(offset, offset + 16);
    offset += 16;
    const symbolCount = counts.reduce((total, count) => total + count, 0);
    if (symbolCount === 0 || symbolCount > end - offset) return false;

    const lookup = Array.from({ length: 17 }, () => new Map<number, number>());
    let code = 0;
    let symbolOffset = 0;
    for (let bitLength = 1; bitLength <= 16; bitLength += 1) {
      const count = counts[bitLength - 1];
      if (code + count > (1 << bitLength) - 1) return false;
      for (let index = 0; index < count; index += 1) {
        const symbol = bytes[offset + symbolOffset++];
        if (tableClass === 0 && symbol > 11) return false;
        if (tableClass === 1) {
          const runLength = symbol >>> 4;
          const magnitudeBits = symbol & 0x0f;
          if (magnitudeBits > 10 || (magnitudeBits === 0 && runLength !== 0 && runLength !== 15)) return false;
        }
        lookup[bitLength].set(code + index, symbol);
      }
      code = (code + count) << 1;
    }
    tables.set((tableClass << 4) | tableId, lookup);
    offset += symbolCount;
  }
  return offset === end;
}

function validateJpegEntropy(
  bytes: Uint8Array,
  scanOffset: number,
  frame: JpegFrame,
  scanComponents: JpegScanComponent[],
  restartInterval: number,
) {
  // This proves the supported baseline scan is structurally complete through
  // EOI. It intentionally does not claim IDCT or colour-conversion decoding.
  let offset = scanOffset;
  let currentByte = 0;
  let remainingBits = 0;
  let pendingMarker: number | undefined;

  const readEntropyByte = () => {
    if (offset >= bytes.length) return null;
    const value = bytes[offset++];
    if (value !== 0xff) return value;
    if (offset >= bytes.length) return null;
    let marker = bytes[offset++];
    if (marker === 0x00) return 0xff;
    while (marker === 0xff) {
      if (offset >= bytes.length) return null;
      marker = bytes[offset++];
    }
    if (marker === 0x00) return null;
    pendingMarker = marker;
    return null;
  };

  const readBit = () => {
    if (remainingBits === 0) {
      const value = readEntropyByte();
      if (value === null) return null;
      currentByte = value;
      remainingBits = 8;
    }
    remainingBits -= 1;
    return (currentByte >>> remainingBits) & 1;
  };

  const consumeBits = (count: number) => {
    for (let index = 0; index < count; index += 1) if (readBit() === null) return false;
    return true;
  };

  const decodeHuffman = (table: JpegHuffmanTable) => {
    let code = 0;
    for (let bitLength = 1; bitLength <= 16; bitLength += 1) {
      const bit = readBit();
      if (bit === null) return null;
      code = (code << 1) | bit;
      const symbol = table[bitLength].get(code);
      if (symbol !== undefined) return symbol;
    }
    return null;
  };

  const finishByte = () => {
    if (remainingBits === 0) return true;
    const mask = (1 << remainingBits) - 1;
    const valid = (currentByte & mask) === mask;
    remainingBits = 0;
    return valid;
  };

  const takeMarker = () => {
    if (pendingMarker !== undefined) {
      const marker = pendingMarker;
      pendingMarker = undefined;
      return marker;
    }
    if (offset >= bytes.length || bytes[offset++] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length || bytes[offset] === 0x00) return null;
    return bytes[offset++];
  };

  const mcuColumns = Math.ceil(frame.width / (8 * frame.maxHorizontalSampling));
  const mcuRows = Math.ceil(frame.height / (8 * frame.maxVerticalSampling));
  const blocksPerMcu = scanComponents.reduce(
    (total, component) => total + component.frame.horizontalSampling * component.frame.verticalSampling,
    0,
  );
  const totalMcus = mcuColumns * mcuRows;
  if (!Number.isSafeInteger(totalMcus) || totalMcus <= 0 || totalMcus > Math.floor(MAX_JPEG_BLOCKS / blocksPerMcu)) return false;

  let restartIndex = 0;
  for (let mcu = 0; mcu < totalMcus; mcu += 1) {
    for (const component of scanComponents) {
      const blockCount = component.frame.horizontalSampling * component.frame.verticalSampling;
      for (let block = 0; block < blockCount; block += 1) {
        const dcMagnitudeBits = decodeHuffman(component.dcTable);
        if (dcMagnitudeBits === null || !consumeBits(dcMagnitudeBits)) return false;

        let coefficient = 1;
        while (coefficient < 64) {
          const symbol = decodeHuffman(component.acTable);
          if (symbol === null) return false;
          const runLength = symbol >>> 4;
          const magnitudeBits = symbol & 0x0f;
          if (magnitudeBits === 0) {
            if (runLength === 0) break;
            coefficient += 16;
            if (coefficient > 64) return false;
            continue;
          }
          coefficient += runLength;
          if (coefficient >= 64 || !consumeBits(magnitudeBits)) return false;
          coefficient += 1;
        }
      }
    }

    const completedMcus = mcu + 1;
    if (restartInterval > 0 && completedMcus % restartInterval === 0 && completedMcus < totalMcus) {
      if (!finishByte() || takeMarker() !== 0xd0 + (restartIndex & 7)) return false;
      restartIndex += 1;
    }
  }

  return finishByte() && takeMarker() === 0xd9 && offset === bytes.length;
}

function parseJpeg(bytes: Uint8Array): DetectedImage | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const quantizationTables = new Set<number>();
  const huffmanTables = new Map<number, JpegHuffmanTable>();
  let frame: JpegFrame | null = null;
  let restartInterval = 0;
  let sawRestartInterval = false;
  let offset = 2;
  let markerCount = 0;

  while (offset < bytes.length && markerCount < MAX_JPEG_MARKERS) {
    if (bytes[offset++] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    markerCount += 1;
    if (marker === 0x00 || marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) return null;
    if (offset + 2 > bytes.length) return null;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || length > bytes.length - offset) return null;
    const payloadStart = offset + 2;
    const segmentEnd = offset + length;

    if (marker === 0xdb) {
      if (!parseJpegQuantizationTables(bytes, payloadStart, segmentEnd, quantizationTables)) return null;
    } else if (marker === 0xc4) {
      if (!parseJpegHuffmanTables(bytes, payloadStart, segmentEnd, huffmanTables)) return null;
    } else if (marker === 0xc0) {
      if (frame || length < 11) return null;
      const precision = bytes[payloadStart];
      const height = readUint16BE(bytes, payloadStart + 1);
      const width = readUint16BE(bytes, payloadStart + 3);
      const componentCount = bytes[payloadStart + 5];
      if (precision !== 8 || height === 0 || width === 0 || ![1, 3, 4].includes(componentCount) || length !== 8 + componentCount * 3) return null;
      const components = new Map<number, JpegFrameComponent>();
      let maxHorizontalSampling = 0;
      let maxVerticalSampling = 0;
      let blocksPerMcu = 0;
      for (let index = 0; index < componentCount; index += 1) {
        const componentOffset = payloadStart + 6 + index * 3;
        const id = bytes[componentOffset];
        const sampling = bytes[componentOffset + 1];
        const horizontalSampling = sampling >>> 4;
        const verticalSampling = sampling & 0x0f;
        const quantizationTable = bytes[componentOffset + 2];
        if (components.has(id) || horizontalSampling < 1 || horizontalSampling > 4 || verticalSampling < 1 || verticalSampling > 4 || quantizationTable > 3) return null;
        components.set(id, { horizontalSampling, verticalSampling, quantizationTable });
        maxHorizontalSampling = Math.max(maxHorizontalSampling, horizontalSampling);
        maxVerticalSampling = Math.max(maxVerticalSampling, verticalSampling);
        blocksPerMcu += horizontalSampling * verticalSampling;
      }
      if (blocksPerMcu > 10 || [...components.values()].some(
        (component) => maxHorizontalSampling % component.horizontalSampling !== 0
          || maxVerticalSampling % component.verticalSampling !== 0,
      )) return null;
      frame = { width, height, maxHorizontalSampling, maxVerticalSampling, components };
    } else if (marker === 0xdd) {
      if (sawRestartInterval || length !== 4) return null;
      sawRestartInterval = true;
      restartInterval = readUint16BE(bytes, payloadStart);
    } else if (marker === 0xda) {
      if (!frame) return null;
      const scanComponentCount = bytes[payloadStart];
      if (scanComponentCount !== frame.components.size || length !== 6 + scanComponentCount * 2) return null;
      const scanComponents: JpegScanComponent[] = [];
      const selectedComponents = new Set<number>();
      let scanPosition = payloadStart + 1;
      for (let index = 0; index < scanComponentCount; index += 1) {
        const componentId = bytes[scanPosition++];
        const selectors = bytes[scanPosition++];
        const frameComponent = frame.components.get(componentId);
        const dcTable = huffmanTables.get(selectors >>> 4);
        const acTable = huffmanTables.get(0x10 | (selectors & 0x0f));
        if (!frameComponent || selectedComponents.has(componentId) || !dcTable || !acTable || !quantizationTables.has(frameComponent.quantizationTable)) return null;
        selectedComponents.add(componentId);
        scanComponents.push({ frame: frameComponent, dcTable, acTable });
      }
      if (bytes[scanPosition] !== 0 || bytes[scanPosition + 1] !== 63 || bytes[scanPosition + 2] !== 0) return null;
      const jpegFrame = frame;
      return {
        width: jpegFrame.width,
        height: jpegFrame.height,
        mimeType: "image/jpeg",
        extension: "jpg",
        verifyPayload: async () => validateJpegEntropy(bytes, segmentEnd, jpegFrame, scanComponents, restartInterval),
      };
    } else if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) {
      // Only baseline Huffman JPEG plus metadata/comment segments is supported.
      return null;
    }
    offset = segmentEnd;
  }
  return null;
}

function pngPassSize(size: number, start: number, step: number) {
  return size <= start ? 0 : Math.ceil((size - start) / step);
}

async function validatePngImageData(
  parts: Uint8Array[],
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  interlace: number,
) {
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = channels * bitDepth;
  const passDefinitions = interlace === 0
    ? [[0, 0, 1, 1]]
    : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  const plans = passDefinitions.flatMap(([xStart, yStart, xStep, yStep]) => {
    const passWidth = pngPassSize(width, xStart, xStep);
    const rows = pngPassSize(height, yStart, yStep);
    return passWidth === 0 || rows === 0 ? [] : [{ rows, rowBytes: Math.ceil((passWidth * bitsPerPixel) / 8) }];
  });
  const expectedBytes = plans.reduce((total, plan) => total + plan.rows * (plan.rowBytes + 1), 0);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_DECODED_IMAGE_BYTES) return false;

  let partIndex = 0;
  const compressed = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (partIndex < parts.length) controller.enqueue(parts[partIndex++]);
      else controller.close();
    },
  });
  const decompressor = new DecompressionStream("deflate") as unknown as TransformStream<Uint8Array, Uint8Array>;
  const reader = compressed.pipeThrough(decompressor).getReader();
  let planIndex = 0;
  let rowIndex = 0;
  let rowRemaining = -1;
  let producedBytes = 0;

  const completeRow = () => {
    rowIndex += 1;
    rowRemaining = -1;
    if (rowIndex === plans[planIndex].rows) {
      planIndex += 1;
      rowIndex = 0;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      let offset = 0;
      producedBytes += value.length;
      if (producedBytes > expectedBytes) {
        await reader.cancel();
        return false;
      }
      while (offset < value.length) {
        if (planIndex >= plans.length) {
          await reader.cancel();
          return false;
        }
        if (rowRemaining === -1) {
          if (value[offset++] > 4) {
            await reader.cancel();
            return false;
          }
          rowRemaining = plans[planIndex].rowBytes;
          if (rowRemaining === 0) completeRow();
          continue;
        }
        const consumed = Math.min(rowRemaining, value.length - offset);
        rowRemaining -= consumed;
        offset += consumed;
        if (rowRemaining === 0) completeRow();
      }
    }
  } catch {
    return false;
  }
  return producedBytes === expectedBytes && planIndex === plans.length && rowRemaining === -1;
}

function parsePng(bytes: Uint8Array): DetectedImage | null {
  if (!matches(bytes, 0, PNG_SIGNATURE)) return null;
  let offset = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let sawHeader = false;
  let sawPalette = false;
  let sawPhysicalDimensions = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let imageDataBytes = 0;
  const imageData: Uint8Array[] = [];

  while (offset < bytes.length && chunkCount < MAX_PNG_CHUNKS) {
    if (bytes.length - offset < 12) return null;
    const chunkStart = offset;
    const length = readUint32BE(bytes, offset);
    if (length > 0x7fffffff || length > bytes.length - offset - 12) return null;
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const nextOffset = dataEnd + 4;
    const typeBytes = bytes.subarray(typeOffset, typeOffset + 4);
    if (!typeBytes.every((value) => (value >= 65 && value <= 90) || (value >= 97 && value <= 122)) || (typeBytes[2] & 0x20) !== 0) return null;
    if (pngCrc(bytes, typeOffset, dataEnd) !== readUint32BE(bytes, dataEnd)) return null;
    const type = ascii(bytes, typeOffset, 4);
    chunkCount += 1;

    if (!sawHeader && (chunkStart !== PNG_SIGNATURE.length || type !== "IHDR")) return null;
    if (sawImageData && type !== "IDAT") imageDataEnded = true;

    if (type === "IHDR") {
      if (sawHeader || chunkStart !== PNG_SIGNATURE.length || length !== 13) return null;
      width = readUint32BE(bytes, dataOffset);
      height = readUint32BE(bytes, dataOffset + 4);
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      interlace = bytes[dataOffset + 12];
      // Indexed-colour samples require palette-index validation after PNG
      // unfiltering. That decoder is intentionally outside this bounded
      // subset, so colour type 3 fails closed.
      const validDepths: Record<number, readonly number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        4: [8, 16],
        6: [8, 16],
      };
      if (width === 0 || height === 0 || !validDepths[colorType]?.includes(bitDepth) || compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) return null;
      sawHeader = true;
    } else if (type === "PLTE") {
      const entries = length / 3;
      if (!sawHeader || sawPalette || sawImageData || length === 0 || length % 3 !== 0 || entries > 256 || colorType === 0 || colorType === 4 || (colorType === 3 && entries > 2 ** bitDepth)) return null;
      sawPalette = true;
    } else if (type === "IDAT") {
      if (!sawHeader || imageDataEnded || (colorType === 3 && !sawPalette)) return null;
      sawImageData = true;
      imageDataBytes += length;
      imageData.push(bytes.subarray(dataOffset, dataEnd));
    } else if (type === "IEND") {
      if (!sawHeader || !sawImageData || imageDataBytes === 0 || length !== 0 || nextOffset !== bytes.length) return null;
      return {
        width,
        height,
        mimeType: "image/png",
        extension: "png",
        verifyPayload: async () => validatePngImageData(imageData, width, height, bitDepth, colorType, interlace),
      };
    } else if (type === "pHYs") {
      const unit = bytes[dataOffset + 8];
      if (!sawHeader || sawPhysicalDimensions || sawImageData || length !== 9 || unit > 1) return null;
      if (unit === 1 && (readUint32BE(bytes, dataOffset) === 0 || readUint32BE(bytes, dataOffset + 4) === 0)) return null;
      sawPhysicalDimensions = true;
    } else {
      // Unknown critical chunks and unvalidated ancillary metadata are outside
      // the supported subset. Reject them instead of accepting ambiguous
      // ordering or format-specific semantics.
      return null;
    }
    offset = nextOffset;
  }
  return null;
}

function detect(bytes: Uint8Array): DetectedImage | null {
  if (matches(bytes, 0, PNG_SIGNATURE)) return parsePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return parseJpeg(bytes);
  // The Worker upload runtime has no trusted VP8/VP8L decoder. RIFF metadata
  // cannot prove that a WebP payload decodes, so WebP fails closed rather than
  // being accepted by a header-only parser.
  // AVIF container metadata is not proof that its primary AV1 payload decodes.
  // The Worker upload runtime has no trusted AV1 decoder, so AVIF remains
  // deliberately unsupported instead of accepting metadata-only validation.
  return null;
}

export async function validateListingImage(file: File): Promise<ValidatedImage> {
  if (file.size < 32 || file.size > MAX_IMAGE_BYTES) throw new Error("invalid_image_size");
  if (file.type === "image/avif") throw new Error("unsupported_image_content");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("invalid_image_size");
  const detected = detect(bytes);
  if (!detected) throw new Error("unsupported_image_content");
  if (file.type && file.type !== detected.mimeType) throw new Error("image_mime_mismatch");
  if (Math.min(detected.width, detected.height) < MIN_IMAGE_SIDE) throw new Error("image_dimensions_too_small");
  if (detected.width > Math.floor(MAX_IMAGE_PIXELS / detected.height)) throw new Error("image_dimensions_too_large");
  if (detected.verifyPayload && !(await detected.verifyPayload())) throw new Error("unsupported_image_content");
  const image = {
    width: detected.width,
    height: detected.height,
    mimeType: detected.mimeType,
    extension: detected.extension,
  };
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { bytes, byteSize: file.size, ...image, sha256 };
}

export const listingImageLimits = {
  maxFiles: 12,
  maxBytes: MAX_IMAGE_BYTES,
  maxTotalBytes: 60 * 1024 * 1024,
  maxRequestBytes: 60 * 1024 * 1024 + 512 * 1024,
  minSide: MIN_IMAGE_SIDE,
  maxPixels: MAX_IMAGE_PIXELS,
  maxDecodedBytes: MAX_DECODED_IMAGE_BYTES,
} as const;
