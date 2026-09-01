import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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

test("listing image validator sniffs bytes, dimensions, MIME and digest", async () => {
  const valid = await validateListingImage(pngHeader(1200, 900));
  assert.deepEqual({ width: valid.width, height: valid.height, mime: valid.mimeType, extension: valid.extension }, {
    width: 1200,
    height: 900,
    mime: "image/png",
    extension: "png",
  });
  assert.match(valid.sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(validateListingImage(pngHeader(1200, 900, "image/jpeg")), /image_mime_mismatch/);
  await assert.rejects(validateListingImage(pngHeader(120, 120)), /image_dimensions_too_small/);
  await assert.rejects(validateListingImage(new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"] , "image.svg", { type: "image/svg+xml" })), /unsupported_image_content/);
});

test("real listing flow persists draft, verified photos and moderation submission server-side", async () => {
  const [publish, publishPage, loader, draftRoute, draftReadRoute, imageRoute, submitRoute, mediaRoute, hosting] = await Promise.all([
    readFile(new URL("components/publish-form.tsx", root), "utf8"),
    readFile(new URL("app/publish/page.tsx", root), "utf8"),
    readFile(new URL("components/publish-form-loader.tsx", root), "utf8"),
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
  assert.match(loader, /listActiveCategories/);
  assert.match(loader, /mapCategoryReferenceRows/);
  assert.doesNotMatch(loader, /CATEGORY_COLUMNS/);
  assert.match(loader, /createSingleFlightTtlLoader/);
  assert.match(loader, /CATEGORY_CATALOG_TTL_MS/);
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
  assert.doesNotMatch(mediaRoute, /createSupabasePublicServerClient/);
  assert.match(mediaRoute, /private, no-store/);
  assert.doesNotMatch(mediaRoute, /public, max-age=86400, immutable/);
  assert.equal(JSON.parse(hosting).r2, "MARKETO_MEDIA");
});

test("public listing detail renders the resolved seller name", async () => {
  const page = await readFile(new URL("app/listing/[slug]/page.tsx", root), "utf8");
  const repositories = await readFile(new URL("lib/data/repositories.ts", root), "utf8");
  assert.match(repositories, /sellerName: seller\?\.display_name/);
  assert.match(page, /<strong>\{listing\.sellerName\}<\/strong>/);
});
