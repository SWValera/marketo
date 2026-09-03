import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deflateSync } from "node:zlib";

import { MultipartRequestError, parseBoundedMultipartFormData } from "../lib/http/bounded-multipart.ts";
import { publicMediaUrl, protectedMediaUrl } from "../lib/media/public-url.ts";
import {
  createListingImageStorageKey,
  encodeMediaStoragePath,
  isListingMediaFilename,
  trustedListingMediaContentType,
} from "../lib/media/storage-key.ts";
import { listingImageLimits, validateListingImage } from "../lib/media/image-validation.ts";
import {
  isLegacyServiceRoleJwt,
  isServerOnlySupabaseKey,
  validatePublicSupabaseConfig,
} from "../lib/supabase/public-config-validation.ts";

const root = new URL("../", import.meta.url);
const ownerId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const digest = "a".repeat(64);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, checksum]);
}

function highDecodedCostPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(5_000, 0);
  header.writeUInt32BE(4_000, 4);
  header[8] = 16;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.alloc(0))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("multipart parsing enforces the byte ceiling before FormData parsing", async () => {
  let bodyRead = false;
  const rejectedByLength = {
    headers: new Headers({
      "content-length": "9",
      "content-type": "multipart/form-data; boundary=x",
    }),
    get body() {
      bodyRead = true;
      return new ReadableStream();
    },
  };
  await assert.rejects(
    parseBoundedMultipartFormData(rejectedByLength, 8),
    (error) => error instanceof MultipartRequestError && error.code === "multipart_payload_too_large",
  );
  assert.equal(bodyRead, false);

  const rejectedByStream = new Request("https://example.test/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: new Uint8Array(9),
  });
  await assert.rejects(
    parseBoundedMultipartFormData(rejectedByStream, 8),
    (error) => error instanceof MultipartRequestError && error.code === "multipart_payload_too_large",
  );

  const form = new FormData();
  form.append("photos", new File(["image"], "photo.jpg", { type: "image/jpeg" }));
  const parsed = await parseBoundedMultipartFormData(new Request("https://example.test/upload", {
    method: "POST",
    body: form,
  }), 4_096);
  assert.equal(parsed.getAll("photos").length, 1);
});

test("listing object keys are unique per upload attempt and remain route-compatible", () => {
  const first = createListingImageStorageKey({
    ownerId,
    listingId,
    digest,
    extension: "jpg",
    nonce: "33333333-3333-4333-8333-333333333333",
  });
  const second = createListingImageStorageKey({
    ownerId,
    listingId,
    digest,
    extension: "jpg",
    nonce: "44444444-4444-4444-8444-444444444444",
  });
  assert.notEqual(first, second);
  assert.equal(isListingMediaFilename(first.split("/").at(-1)), true);
  assert.equal(isListingMediaFilename(second.split("/").at(-1)), true);
  assert.equal(isListingMediaFilename(`00-${digest.slice(0, 20)}.jpg`), true, "legacy keys remain readable");
});

test("media paths reject traversal and public delivery always uses the revocable route", () => {
  assert.equal(encodeMediaStoragePath("listings/a/../secret.jpg"), null);
  assert.equal(encodeMediaStoragePath("listings//photo.jpg"), null);
  assert.equal(encodeMediaStoragePath("listings\\photo.jpg"), null);
  assert.equal(protectedMediaUrl("listings/a/photo one.jpg"), "/api/media/listings/a/photo%20one.jpg");

  const previous = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://public-bucket.example.test";
  try {
    assert.equal(publicMediaUrl("listings/a/photo.jpg"), "/api/media/listings/a/photo.jpg");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = previous;
  }
});

test("listing media MIME is controlled by the storage key and database contract", () => {
  assert.equal(trustedListingMediaContentType("listings/a/photo.jpg", "image/jpeg"), "image/jpeg");
  assert.equal(trustedListingMediaContentType("listings/a/photo.png", null), "image/png");
  assert.equal(trustedListingMediaContentType("listings/a/photo.jpg", "text/html"), null);
  assert.equal(trustedListingMediaContentType("listings/a/photo.jpg", "image/png"), null);
  assert.equal(trustedListingMediaContentType("listings/a/photo.svg", null), null);
});

test("image validation rejects a within-pixel-limit decompression amplification input", async () => {
  assert.equal(5_000 * 4_000, listingImageLimits.maxPixels);
  await assert.rejects(
    validateListingImage(new File([highDecodedCostPng()], "amplification.png", { type: "image/png" })),
    /unsupported_image_content/,
  );
});

test("runtime public configuration rejects service-role JWTs and matches build URL rules", () => {
  const publicKey = "sb_publishable_public_test_key";
  assert.deepEqual(validatePublicSupabaseConfig("https://project.supabase.co/", publicKey), {
    url: "https://project.supabase.co",
    publishableKey: publicKey,
  });
  assert.throws(() => validatePublicSupabaseConfig(" https://project.supabase.co", publicKey), /whitespace/);
  assert.throws(() => validatePublicSupabaseConfig("https://user:password@project.supabase.co", publicKey), /credential-free/);
  assert.throws(() => validatePublicSupabaseConfig("http://project.supabase.co", publicKey), /HTTPS/);
  assert.doesNotThrow(() => validatePublicSupabaseConfig("http://localhost:54321", publicKey));

  const serviceRoleJwt = [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from('{"role":"service_role"}').toString("base64url"),
    "signature",
  ].join(".");
  assert.equal(isLegacyServiceRoleJwt(serviceRoleJwt), true);
  assert.equal(isServerOnlySupabaseKey(serviceRoleJwt), true);
  assert.throws(() => validatePublicSupabaseConfig("https://project.supabase.co", serviceRoleJwt), /server-only/);
});

test("upload and media routes preserve fail-closed cleanup and error classification", async () => {
  const [uploadRoute, mediaRoute, submitRoute, imageValidation, requestRouting] = await Promise.all([
    readFile(new URL("app/api/listings/[id]/images/route.ts", root), "utf8"),
    readFile(new URL("app/api/media/[...key]/route.ts", root), "utf8"),
    readFile(new URL("app/api/listings/[id]/submit/route.ts", root), "utf8"),
    readFile(new URL("lib/media/image-validation.ts", root), "utf8"),
    import("../lib/http/request-routing.ts"),
  ]);
  assert.match(uploadRoute, /parseBoundedMultipartFormData\(request, listingImageLimits\.maxRequestBytes\)/);
  assert.doesNotMatch(uploadRoute, /request\.formData\(/);
  assert.match(uploadRoute, /createListingImageStorageKey/);
  assert.match(uploadRoute, /metadataCleanupError/);
  assert.match(uploadRoute, /photo_upload_cleanup_failed/);
  assert.match(mediaRoute, /publicResult\.error.*status: 503/s);
  assert.match(mediaRoute, /protectedResult\.error.*status: 503/s);
  assert.match(mediaRoute, /client\.auth\.getUser\(\)/);
  assert.match(mediaRoute, /x-content-type-options.*nosniff/s);
  assert.doesNotMatch(mediaRoute, /writeHttpMetadata/);
  assert.match(submitRoute, /code === "42501" \? 409 : 500/);
  assert.match(imageValidation, /expectedBytes > MAX_DECODED_IMAGE_BYTES/);
  assert.equal(listingImageLimits.maxPixels, 20_000_000);
  assert.equal(listingImageLimits.maxDecodedBytes, 64 * 1024 * 1024);
  assert.equal(listingImageLimits.maxRequestBytes, listingImageLimits.maxTotalBytes + 512 * 1024);
  assert.equal(requestRouting.classifyRequestRouting("/api/media/listings/public/photo.jpg", "GET"), "continue");
  assert.equal(requestRouting.classifyRequestRouting("/api/media/listings/private/photo.jpg", "HEAD"), "continue");
});
