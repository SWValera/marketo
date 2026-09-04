import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deflateSync, inflateSync } from "node:zlib";
import { validateListingImage } from "../lib/media/image-validation.ts";

const root = new URL("../", import.meta.url);

function pngHeader(width, height, type = "image/png") {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new File([bytes], "photo.png", { type });
}

function jpegHeader(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 7, 8], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  return new File([bytes], "photo.jpg", { type: "image/jpeg" });
}

function webpHeader(width, height) {
  const bytes = new Uint8Array(32);
  bytes.set(textBytes("RIFF"), 0);
  bytes.set(textBytes("WEBPVP8X"), 8);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes.set([widthMinusOne & 0xff, (widthMinusOne >>> 8) & 0xff, (widthMinusOne >>> 16) & 0xff], 24);
  bytes.set([heightMinusOne & 0xff, (heightMinusOne >>> 8) & 0xff, (heightMinusOne >>> 16) & 0xff], 27);
  return new File([bytes], "photo.webp", { type: "image/webp" });
}

const CORRUPT_JPEG = Buffer.from(
  "/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCADwAPADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAL/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwF5HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/9k=",
  "base64",
);
const PREMATURE_JPEG = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCADwAPADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWAvooAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/9k=",
  "base64",
);
// Exact output from a real 240x240 baseline JPEG encoder, decoded independently
// before embedding so this test does not need an optional native image library.
const TRUNCATED_JPEG = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCADwAPADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAUH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AgAksuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/Z",
  "base64",
);
const REAL_JPEG = Buffer.from([
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSop",
  "GR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo",
  "KCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCADwAPADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAA",
  "AAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAA",
  "AAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWAvooAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAD/9k=",
].join(""), "base64");
const REAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAPAAAADwCAIAAACxN37FAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAB1klEQVR42u3SAQ0AAAjDsOtEE8KQhQ9oUgXLUj1wRiTA0GBoMDQYGkODocHQYGgwNIYGQ4OhwdBgaAwNhgZDg6HB0BgaDA2GBkODoTE0GBoMDYYGQ2NoMDQYGgwNhsbQYGgwNBgaQ4OhwdBgaDA0hgZDg6HB0GBoDA2GBkODocHQGBoMDYYGQ4OhMTQYGgwNhgZDY2gwNBgaDA2GxtBgaDA0GBoMjaHB0GBoMDSGBkODocHQYGgMDYYGQ4OhwdAYGgwNhgZDg6ExNBgaDA2GBkNjaDA0GBoMDYbG0GBoMDQYGgyNocHQYGgwNIZWAUODocHQYGgMDYYGQ4OhwdAYGgwNhgZDg6ExNBgaDA2GBkNjaDA0GBoMDYbG0GBoMDQYGgyNocHQYGgwNBgaQ4OhwdBgaAwNhgZDg6HB0BgaDA2GBkODoTE0GBoMDYYGQ2NoMDQYGgwNhsbQYGgwNBgaDI2hwdBgaDA0GBpDg6HB0GBoDK0ChgZDg6HB0BgaDA2GBkODoTE0GBoMDYYGQ2NoMDQYGgwNhsbQYGgwNBgaDI2hwdBgaDA0GBpDg6HB0GBoMDSGBkODocHQGBoMDYYGQ4OhMTQYGgwNhgZDY2gwNBgaDA2G5osFTWQEJ9v10tYAAAAASUVORK5CYII=",
  "base64",
);
const REAL_WEBP = Buffer.from(
  "UklGRqwAAABXRUJQVlA4IKAAAACQDwCdASrwAPAAPp1OpE4lpCOiICgAsBOJaW7hd2Ee3AAAHf5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D31gAAO3/+SR6uY6D/+IXexk13X/cCAAAAAAAAAAA",
  "base64",
);
const REAL_WEBP_LOSSLESS = Buffer.from("UklGRiQAAABXRUJQVlA4TBgAAAAv78A7AAdQxmoVuf8BAEX6/58i+p/6/wM=", "base64");
const REAL_WEBP_ALPHA = Buffer.from(
  "UklGRtgAAABXRUJQVlA4WAoAAAAQAAAA7wAA7wAAQUxQSBIAAAABB1DAiAgAKNL//xTR/9T/HwBWUDggoAAAAJAPAJ0BKvAA8AA+nU6kTiWkI6IgKACwE4lpbuF3YR7cAAAd/kPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D31gAAO3/+SR6uY6D/+IXexk13X/cCAAAAAAAAAAA=",
  "base64",
);

function imageFile(bytes, name, type) {
  return new File([bytes], name, { type });
}

function findPngChunk(bytes, wanted) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString("ascii", offset + 4, offset + 8) === wanted) return { offset, length };
    offset += 12 + length;
  }
  return null;
}

function testCrc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rewritePngCrc(bytes, chunkOffset) {
  const length = bytes.readUInt32BE(chunkOffset);
  const crcStart = chunkOffset + 4;
  const crcOffset = chunkOffset + 8 + length;
  bytes.writeUInt32BE(testCrc32(bytes, crcStart, crcOffset), crcOffset);
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(testCrc32(chunk, 4, 8 + data.length), 8 + data.length);
  return chunk;
}

function replacePngImageData(bytes, uncompressed) {
  const imageData = findPngChunk(bytes, "IDAT");
  if (!imageData) throw new Error("PNG fixture has no IDAT chunk");
  const nextOffset = imageData.offset + 12 + imageData.length;
  return Buffer.concat([
    bytes.subarray(0, imageData.offset),
    pngChunk("IDAT", deflateSync(uncompressed)),
    bytes.subarray(nextOffset),
  ]);
}

function replacePngCompressedData(bytes, compressed) {
  const imageData = findPngChunk(bytes, "IDAT");
  if (!imageData) throw new Error("PNG fixture has no IDAT chunk");
  const nextOffset = imageData.offset + 12 + imageData.length;
  return Buffer.concat([
    bytes.subarray(0, imageData.offset),
    pngChunk("IDAT", compressed),
    bytes.subarray(nextOffset),
  ]);
}

function textBytes(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function uint32(...values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value));
  return bytes;
}

function isoBox(type, ...payloads) {
  const size = 8 + payloads.reduce((total, payload) => total + payload.length, 0);
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, size);
  bytes.set(textBytes(type), 4);
  let offset = 8;
  for (const payload of payloads) {
    bytes.set(payload, offset);
    offset += payload.length;
  }
  return bytes;
}

function metadataOnlyAvif(type = "") {
  const fileType = isoBox("ftyp", textBytes("avif"), uint32(0), textBytes("avifmif1"));
  const dimensions = isoBox("ispe", uint32(0, 1200, 900));
  const configuration = isoBox("av1C", Uint8Array.of(0x81, 0x08, 0x0c, 0));
  const metadata = isoBox("meta", uint32(0), dimensions, configuration);
  const media = isoBox("mdat", Uint8Array.of(0));
  return new File([fileType, metadata, media], "synthetic.avif", { type });
}

const REAL_AVIF = Buffer.from(
  "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAASgAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgQgMAAAAABRpc3BlAAAAAAAABLAAAAOEAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAABSbWRhdBIACgoaKmV/B8EBDQaEMjoZIAAAAUAAFwyArfhclJ9I3VzZ8oJTDsTGSGqoFC6buAyArfhclJ9I3VzZ8oJSpz/m8j/T2K9phzxg",
  "base64",
);

test("listing image validator accepts real baseline JPEG and fully checked PNG payloads", async () => {
  const png = await validateListingImage(imageFile(REAL_PNG, "photo.png", "image/png"));
  assert.deepEqual({ width: png.width, height: png.height, mime: png.mimeType, extension: png.extension }, {
    width: 240,
    height: 240,
    mime: "image/png",
    extension: "png",
  });
  assert.match(png.sha256, /^[a-f0-9]{64}$/);

  const jpeg = await validateListingImage(imageFile(REAL_JPEG, "photo.jpg", "image/jpeg"));
  assert.deepEqual({ width: jpeg.width, height: jpeg.height, mime: jpeg.mimeType, extension: jpeg.extension }, {
    width: 240,
    height: 240,
    mime: "image/jpeg",
    extension: "jpg",
  });

  await assert.rejects(validateListingImage(imageFile(REAL_PNG, "photo.png", "image/jpeg")), /image_mime_mismatch/);
  const smallPng = Buffer.from(REAL_PNG);
  smallPng.writeUInt32BE(120, 16);
  smallPng.writeUInt32BE(120, 20);
  rewritePngCrc(smallPng, 8);
  await assert.rejects(validateListingImage(imageFile(smallPng, "small.png", "image/png")), /image_dimensions_too_small/);
  const oversizedPng = Buffer.from(REAL_PNG);
  oversizedPng.writeUInt32BE(10_000, 16);
  oversizedPng.writeUInt32BE(10_000, 20);
  rewritePngCrc(oversizedPng, 8);
  await assert.rejects(validateListingImage(imageFile(oversizedPng, "oversized.png", "image/png")), /image_dimensions_too_large/);
  await assert.rejects(validateListingImage(new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"] , "image.svg", { type: "image/svg+xml" })), /unsupported_image_content/);
});

test("listing image validator rejects synthetic, truncated, malformed, and ambiguous JPEG structures", async () => {
  const badSegmentLength = Buffer.from(REAL_JPEG);
  badSegmentLength.writeUInt16BE(1, 4);
  const scanMarker = REAL_JPEG.indexOf(Buffer.from([0xff, 0xda]));
  assert.ok(scanMarker > 32);
  const noScanPayload = Buffer.concat([REAL_JPEG.subarray(0, scanMarker), Buffer.from([0xff, 0xd9])]);
  const noEntropyPayload = Buffer.concat([REAL_JPEG.subarray(0, scanMarker + 14), Buffer.from([0xff, 0xd9])]);
  const quantizationMarker = REAL_JPEG.indexOf(Buffer.from([0xff, 0xdb]));
  assert.ok(quantizationMarker > 0);
  const highPrecisionQuantization = Buffer.from(REAL_JPEG);
  highPrecisionQuantization[quantizationMarker + 4] |= 0x10;
  const restartInterval = Buffer.from([0xff, 0xdd, 0x00, 0x04, 0x00, 0x01]);
  const duplicateRestartInterval = Buffer.concat([
    REAL_JPEG.subarray(0, scanMarker),
    restartInterval,
    restartInterval,
    REAL_JPEG.subarray(scanMarker),
  ]);
  const trailingPayload = Buffer.concat([REAL_JPEG, Buffer.from([0])]);

  for (const file of [
    jpegHeader(1200, 900),
    imageFile(CORRUPT_JPEG, "premature-entropy-end.jpg", "image/jpeg"),
    imageFile(PREMATURE_JPEG, "short-entropy.jpg", "image/jpeg"),
    imageFile(TRUNCATED_JPEG, "truncated-embedded.jpg", "image/jpeg"),
    imageFile(REAL_JPEG.subarray(0, -1), "truncated.jpg", "image/jpeg"),
    imageFile(badSegmentLength, "bad-segment.jpg", "image/jpeg"),
    imageFile(noScanPayload, "no-scan.jpg", "image/jpeg"),
    imageFile(noEntropyPayload, "no-entropy.jpg", "image/jpeg"),
    imageFile(highPrecisionQuantization, "unsupported-quantization.jpg", "image/jpeg"),
    imageFile(duplicateRestartInterval, "duplicate-restart-interval.jpg", "image/jpeg"),
    imageFile(trailingPayload, "trailing.jpg", "image/jpeg"),
  ]) {
    await assert.rejects(validateListingImage(file), /unsupported_image_content/);
  }
});

test("listing image validator rejects incomplete and corrupt PNG containers and image streams", async () => {
  const imageData = findPngChunk(REAL_PNG, "IDAT");
  const imageEnd = findPngChunk(REAL_PNG, "IEND");
  const physicalDimensions = findPngChunk(REAL_PNG, "pHYs");
  assert.ok(imageData && imageEnd && physicalDimensions);
  const missingImageData = Buffer.concat([REAL_PNG.subarray(0, imageData.offset), REAL_PNG.subarray(imageEnd.offset)]);
  const badBounds = Buffer.from(REAL_PNG);
  badBounds.writeUInt32BE(0x7fffffff, imageData.offset);
  const badCrc = Buffer.from(REAL_PNG);
  badCrc[imageData.offset + 8] ^= 1;
  const invalidZlib = Buffer.from(REAL_PNG);
  invalidZlib[imageData.offset + 8] = 0;
  rewritePngCrc(invalidZlib, imageData.offset);
  const ihdrEnd = 8 + 12 + 13;
  const duplicateHeader = Buffer.concat([
    REAL_PNG.subarray(0, ihdrEnd),
    REAL_PNG.subarray(8, ihdrEnd),
    REAL_PNG.subarray(ihdrEnd),
  ]);
  const invalidColourDepth = Buffer.from(REAL_PNG);
  invalidColourDepth[24] = 4;
  rewritePngCrc(invalidColourDepth, 8);
  const duplicatePhysicalDimensions = Buffer.concat([
    REAL_PNG.subarray(0, physicalDimensions.offset + 12 + physicalDimensions.length),
    REAL_PNG.subarray(physicalDimensions.offset, physicalDimensions.offset + 12 + physicalDimensions.length),
    REAL_PNG.subarray(physicalDimensions.offset + 12 + physicalDimensions.length),
  ]);
  const uncompressed = inflateSync(REAL_PNG.subarray(imageData.offset + 8, imageData.offset + 8 + imageData.length));
  const compressed = REAL_PNG.subarray(imageData.offset + 8, imageData.offset + 8 + imageData.length);
  const invalidFilterData = Buffer.from(uncompressed);
  invalidFilterData[0] = 5;
  const invalidFilter = replacePngImageData(REAL_PNG, invalidFilterData);
  const shortRaster = replacePngImageData(REAL_PNG, uncompressed.subarray(0, -1));
  const trailingCompressedByte = replacePngCompressedData(REAL_PNG, Buffer.concat([compressed, Buffer.from([0])]));
  const unsupportedAncillary = Buffer.concat([
    REAL_PNG.subarray(0, imageData.offset),
    pngChunk("tEXt", Buffer.from("author\0unvalidated")),
    REAL_PNG.subarray(imageData.offset),
  ]);
  const trailingPayload = Buffer.concat([REAL_PNG, Buffer.from([0])]);

  for (const file of [
    pngHeader(1200, 900),
    imageFile(REAL_PNG.subarray(0, imageEnd.offset), "missing-iend.png", "image/png"),
    imageFile(missingImageData, "missing-idat.png", "image/png"),
    imageFile(badBounds, "bad-bounds.png", "image/png"),
    imageFile(badCrc, "bad-crc.png", "image/png"),
    imageFile(invalidZlib, "bad-zlib.png", "image/png"),
    imageFile(duplicateHeader, "duplicate-ihdr.png", "image/png"),
    imageFile(invalidColourDepth, "invalid-colour-depth.png", "image/png"),
    imageFile(duplicatePhysicalDimensions, "duplicate-phys.png", "image/png"),
    imageFile(invalidFilter, "invalid-filter.png", "image/png"),
    imageFile(shortRaster, "short-raster.png", "image/png"),
    imageFile(trailingCompressedByte, "trailing-compressed-byte.png", "image/png"),
    imageFile(unsupportedAncillary, "unsupported-ancillary.png", "image/png"),
    imageFile(trailingPayload, "trailing.png", "image/png"),
  ]) {
    await assert.rejects(validateListingImage(file), /unsupported_image_content/);
  }
});

test("listing image validator fails closed for genuine and malformed WebP without a trusted decoder", async () => {
  const badRiffSize = Buffer.from(REAL_WEBP);
  badRiffSize.writeUInt32LE(badRiffSize.readUInt32LE(4) - 2, 4);
  const badChunkBounds = Buffer.from(REAL_WEBP);
  badChunkBounds.writeUInt32LE(0xffffffff, 16);
  const badVp8Start = Buffer.from(REAL_WEBP);
  badVp8Start[23] ^= 1;
  const badVp8Partition = Buffer.from(REAL_WEBP);
  badVp8Partition[20] = 0xf0;
  badVp8Partition[21] = 0xff;
  badVp8Partition[22] = 0xff;
  const badVp8lVersion = Buffer.from(REAL_WEBP_LOSSLESS);
  badVp8lVersion[24] |= 0x20;
  const badVp8xReserved = Buffer.from(REAL_WEBP_ALPHA);
  badVp8xReserved[20] |= 0x80;
  const badVp8xDimensions = Buffer.from(REAL_WEBP_ALPHA);
  badVp8xDimensions[24] -= 1;

  for (const file of [
    imageFile(REAL_WEBP, "real-lossy.webp", "image/webp"),
    imageFile(REAL_WEBP_LOSSLESS, "real-lossless.webp", "image/webp"),
    imageFile(REAL_WEBP_ALPHA, "real-alpha.webp", "image/webp"),
    webpHeader(1200, 900),
    imageFile(REAL_WEBP.subarray(0, -1), "truncated.webp", "image/webp"),
    imageFile(badRiffSize, "bad-riff.webp", "image/webp"),
    imageFile(badChunkBounds, "bad-chunk.webp", "image/webp"),
    imageFile(badVp8Start, "bad-vp8.webp", "image/webp"),
    imageFile(badVp8Partition, "bad-partition.webp", "image/webp"),
    imageFile(badVp8lVersion, "bad-vp8l.webp", "image/webp"),
    imageFile(badVp8xReserved, "bad-vp8x.webp", "image/webp"),
    imageFile(badVp8xDimensions, "bad-canvas.webp", "image/webp"),
    imageFile(Buffer.concat([REAL_WEBP, Buffer.from([0, 0])]), "trailing.webp", "image/webp"),
  ]) {
    await assert.rejects(validateListingImage(file), /unsupported_image_content/);
  }
});

test("listing image validator fails closed for real, untyped, truncated, and metadata-only AVIF", async () => {
  const truncated = REAL_AVIF.subarray(0, REAL_AVIF.length - 1);
  for (const file of [
    new File([REAL_AVIF], "real.avif", { type: "image/avif" }),
    new File([REAL_AVIF], "real-untyped.avif", { type: "" }),
    new File([truncated], "truncated.avif", { type: "" }),
    metadataOnlyAvif("image/avif"),
    metadataOnlyAvif(""),
  ]) {
    await assert.rejects(validateListingImage(file), /unsupported_image_content/);
  }
});

test("listing image validator rejects an intact AVIF container with a damaged AV1 payload", async () => {
  const damagedPayload = Buffer.from(REAL_AVIF);
  const mediaBoxType = damagedPayload.indexOf(Buffer.from("mdat"));
  assert.ok(mediaBoxType > 0);
  damagedPayload.fill(0, mediaBoxType + 4);

  await assert.rejects(
    validateListingImage(new File([damagedPayload], "damaged.avif", { type: "" })),
    /unsupported_image_content/,
  );
});

test("real listing flow persists draft, verified photos and moderation submission server-side", async () => {
  const [publish, publishPage, loader, browserReferences, draftRoute, draftReadRoute, imageRoute, submitRoute, mediaRoute, hosting] = await Promise.all([
    readFile(new URL("components/publish-form.tsx", root), "utf8"),
    readFile(new URL("app/publish/page.tsx", root), "utf8"),
    readFile(new URL("components/publish-form-loader.tsx", root), "utf8"),
    readFile(new URL("lib/reference-data/browser.ts", root), "utf8"),
    readFile(new URL("app/api/listings/route.ts", root), "utf8"),
    readFile(new URL("app/api/listings/[id]/route.ts", root), "utf8"),
    readFile(new URL("app/api/listings/[id]/images/route.ts", root), "utf8"),
    readFile(new URL("app/api/listings/[id]/submit/route.ts", root), "utf8"),
    readFile(new URL("app/api/media/[...key]/route.ts", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);
  assert.match(publish, /currentListingId \? `\/api\/listings\/\$\{currentListingId\}` : "\/api\/listings"/);
  assert.match(publish, /method: currentListingId \? "PATCH" : "POST"/);
  assert.match(publish, /\/images`/);
  assert.match(publish, /\/submit`/);
  assert.match(publish, /image\/jpeg,image\/png/);
  assert.doesNotMatch(publish, /image\/webp/);
  assert.doesNotMatch(publish, /image\/avif/);
  assert.match(loader, /loadBrowserCategoryReferences/);
  assert.doesNotMatch(loader, /listActiveCategories|mapCategoryReferenceRows/);
  assert.doesNotMatch(loader, /CATEGORY_COLUMNS/);
  assert.match(browserReferences, /listActiveCategories/);
  assert.match(browserReferences, /mapCategoryReferenceRows/);
  assert.match(browserReferences, /createSingleFlightTtlLoader/);
  assert.match(loader, /const draft = requestedListingId \? await loadDraft/);
  assert.match(loader, /isPublishLoadRetryable\(state\.reason\)/);
  assert.match(loader, /key=\{state\.draft\?\.id \?\? "create"\}/);
  assert.doesNotMatch(publishPage, /getCategoryReferences|getMyListingDraftBundle/);
  assert.match(draftRoute, /create_listing_draft/);
  for (const status of [401, 404, 409, 503]) assert.match(draftReadRoute, new RegExp(`status: ${status}`));
  assert.match(imageRoute, /validateListingImage/);
  assert.match(imageRoute, /listing\.owner_id !== authData\.user\.id/);
  assert.match(imageRoute, /bucket\.put/);
  assert.match(imageRoute, /stored\.size !== image\.byteSize/);
  assert.match(imageRoute, /existingBytes \+ files\.reduce/);
  assert.match(imageRoute, /listing_images/);
  assert.match(imageRoute, /bucket\.delete/);
  assert.match(submitRoute, /submitListing/);
  assert.match(mediaRoute, /listing_images/);
  assert.match(mediaRoute, /createSupabaseServerClient/);
  const protectedListingMediaStart = mediaRoute.indexOf("if (segments.length !== 4");
  assert.ok(protectedListingMediaStart >= 0);
  const protectedListingMediaBranch = mediaRoute.slice(protectedListingMediaStart);
  assert.match(protectedListingMediaBranch, /createSupabaseServerClient/);
  assert.match(protectedListingMediaBranch, /createSupabasePublicServerClient/);
  assert.match(mediaRoute, /if \(segments\[0\] === "avatars"\) return servePublicAvatar\(segments\)/);
  assert.match(mediaRoute, /private, no-store/);
  assert.doesNotMatch(mediaRoute, /public, max-age=86400, immutable/);
  assert.equal(JSON.parse(hosting).r2, "MARKETO_MEDIA");
});

test("public listing detail renders the resolved seller name", async () => {
  const page = await readFile(new URL("app/listing/[slug]/page.tsx", root), "utf8");
  const repositories = await readFile(new URL("lib/data/repositories.ts", root), "utf8");
  assert.match(
    repositories,
    /if \(!seller\?\.display_name\) throw new PublicListingDataError\("INVALID_RELATION"\);/,
  );
  assert.match(repositories, /sellerName: seller\.display_name/);
  assert.match(repositories, /category\.id !== row\.category_id/);
  assert.match(repositories, /attributeDefinitions: hydrated\.definitions/);
  assert.match(page, /<strong>\{listing\.sellerName\}<\/strong>/);
  assert.match(page, /listing\.attributeDefinitions\.flatMap/);
  assert.doesNotMatch(page, /getCategoryReferences|getCategoryAttributeReferences/);
});
