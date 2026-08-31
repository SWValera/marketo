import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getListingMediaBucket } from "@/lib/media/bucket";
import { listingImageLimits, validateListingImage } from "@/lib/media/image-validation";
import { isSameOriginMutationRequest } from "@/lib/http/same-origin";

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

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  const files = form.getAll("photos").filter((entry): entry is File => typeof entry !== "string");
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

  try {
    for (const [index, file] of files.entries()) {
      const image = await validateListingImage(file);
      const sortOrder = firstSortOrder + index;
      const storageKey = `listings/${authData.user.id}/${listingId}/${String(sortOrder).padStart(2, "0")}-${image.sha256.slice(0, 20)}.${image.extension}`;
      const stored = await bucket.put(storageKey, image.bytes, {
        httpMetadata: { contentType: image.mimeType },
        customMetadata: { ownerId: authData.user.id, listingId, sha256: image.sha256 },
      });
      if (!stored || stored.size !== image.byteSize) {
        await bucket.delete(storageKey);
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
      if (metadataError) {
        await bucket.delete(storageKey);
        throw metadataError;
      }
      created.push({ id: metadata.id, storageKey: metadata.storage_key, sortOrder: metadata.sort_order });
    }
  } catch (error) {
    if (created.length) {
      await admin.from("listing_images").delete().in("id", created.map((image) => image.id));
      await Promise.all(created.map((image) => bucket.delete(image.storageKey)));
    }
    const message = error instanceof Error ? error.message : "photo_upload_failed";
    const clientError = /^(?:invalid_image_size|unsupported_image_content|image_mime_mismatch|image_dimensions_too_small|image_dimensions_too_large)$/.test(message);
    return NextResponse.json({ error: clientError ? message : "photo_upload_failed" }, { status: clientError ? 400 : 500 });
  }

  return NextResponse.json({ images: created }, { status: 201 });
}
