import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getListingMediaBucket } from "@/lib/media/bucket";
import { listingImageLimits, validateListingImage } from "@/lib/media/image-validation";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";
import { MultipartRequestError, parseBoundedMultipartFormData } from "@/lib/http/bounded-multipart";
import { createListingImageStorageKey } from "@/lib/media/storage-key";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json({ error: "cross_origin_request_denied" }, { status: 403 });
  }
  const { id: listingId } = await params;
  if (!uuid.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  const client = await createSupabaseServerClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  const { data: listing, error: listingError } = await client.from("listings").select("id, owner_id, status").eq("id", listingId).maybeSingle();
  if (listingError) return NextResponse.json({ error: "listing_lookup_failed" }, { status: 503 });
  if (!listing || listing.owner_id !== authData.user.id) return NextResponse.json({ error: "listing_not_owned" }, { status: 403 });
  if (listing.status !== "draft" && listing.status !== "rejected") return NextResponse.json({ error: "listing_not_editable" }, { status: 409 });

  let form: FormData;
  try {
    form = await parseBoundedMultipartFormData(request, listingImageLimits.maxRequestBytes);
  } catch (error) {
    const tooLarge = error instanceof MultipartRequestError && error.code === "multipart_payload_too_large";
    return NextResponse.json({ error: tooLarge ? "photo_payload_too_large" : "invalid_multipart" }, { status: tooLarge ? 413 : 400 });
  }
  const entries = [...form.entries()];
  if (entries.some(([name, entry]) => name !== "photos" || typeof entry === "string")) {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }
  const files = entries.map(([, entry]) => entry as File);
  if (files.length === 0 || files.length > listingImageLimits.maxFiles) return NextResponse.json({ error: "invalid_photo_count" }, { status: 400 });
  if (files.reduce((total, file) => total + file.size, 0) > listingImageLimits.maxTotalBytes) return NextResponse.json({ error: "photo_payload_too_large" }, { status: 413 });

  const { data: existing, error: existingError } = await client.from("listing_images").select("id, sort_order, byte_size").eq("listing_id", listingId).order("sort_order");
  if (existingError) return NextResponse.json({ error: "image_lookup_failed" }, { status: 503 });
  if (existing.length + files.length > listingImageLimits.maxFiles) return NextResponse.json({ error: "photo_limit_exceeded" }, { status: 400 });
  const existingBytes = existing.reduce((total, image) => total + (image.byte_size ?? 0), 0);
  if (existingBytes + files.reduce((total, file) => total + file.size, 0) > listingImageLimits.maxTotalBytes) {
    return NextResponse.json({ error: "photo_payload_too_large" }, { status: 413 });
  }

  let bucket: R2Bucket;
  try {
    bucket = getListingMediaBucket();
  } catch {
    return NextResponse.json({ error: "media_storage_unavailable" }, { status: 503 });
  }
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json({ error: "media_metadata_unavailable" }, { status: 503 });
  }
  const created: Array<{ id: string; storageKey: string; sortOrder: number }> = [];
  const firstSortOrder = existing.length ? Math.max(...existing.map((image) => image.sort_order)) + 1 : 0;
  let uncommittedStorageKey: string | null = null;

  try {
    for (const [index, file] of files.entries()) {
      const image = await validateListingImage(file);
      const sortOrder = firstSortOrder + index;
      // The object identity must not depend on the racy sort-order snapshot.
      // A losing concurrent metadata insert can therefore delete only its own
      // object, never the winner's object with the same image digest.
      const storageKey = createListingImageStorageKey({
        ownerId: authData.user.id,
        listingId,
        digest: image.sha256,
        extension: image.extension,
      });
      uncommittedStorageKey = storageKey;
      const stored = await bucket.put(storageKey, image.bytes, {
        httpMetadata: { contentType: image.mimeType },
        customMetadata: { ownerId: authData.user.id, listingId, sha256: image.sha256 },
      });
      if (!stored || stored.size !== image.byteSize) {
        throw new Error("media_object_verification_failed");
      }
      const { data: metadata, error: metadataError } = await admin.from("listing_images").insert({
        listing_id: listingId,
        storage_key: storageKey,
        sort_order: sortOrder,
        width: image.width,
        height: image.height,
        byte_size: image.byteSize,
        mime_type: image.mimeType,
      }).select("id, storage_key, sort_order").single();
      if (metadataError) throw metadataError;
      created.push({ id: metadata.id, storageKey: metadata.storage_key, sortOrder: metadata.sort_order });
      uncommittedStorageKey = null;
    }
  } catch (error) {
    let cleanupFailed = false;
    const keysToDelete = new Set<string>();
    if (uncommittedStorageKey) keysToDelete.add(uncommittedStorageKey);
    if (created.length) {
      try {
        const { error: metadataCleanupError } = await admin
          .from("listing_images")
          .delete()
          .in("id", created.map((image) => image.id));
        if (metadataCleanupError) {
          cleanupFailed = true;
        } else {
          for (const image of created) keysToDelete.add(image.storageKey);
        }
      } catch {
        cleanupFailed = true;
      }
    }
    for (const storageKey of keysToDelete) {
      try {
        await bucket.delete(storageKey);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) return NextResponse.json({ error: "photo_upload_cleanup_failed" }, { status: 503 });
    const message = error instanceof Error ? error.message : "photo_upload_failed";
    const clientError = /^(?:invalid_image_size|unsupported_image_content|image_mime_mismatch|image_dimensions_too_small|image_dimensions_too_large)$/.test(message);
    return NextResponse.json({ error: clientError ? message : "photo_upload_failed" }, { status: clientError ? 400 : 500 });
  }

  return NextResponse.json({ images: created }, { status: 201 });
}
