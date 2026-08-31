import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getListingMediaBucket } from "@/lib/media/bucket";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const filename = /^\d{2}-[a-f0-9]{20}\.(?:jpg|png|webp|avif)$/;

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  if (segments.length !== 4 || segments[0] !== "listings" || !uuid.test(segments[1]) || !uuid.test(segments[2]) || !filename.test(segments[3])) {
    return new Response("Not found", { status: 404 });
  }

  const storageKey = segments.join("/");
  const client = await createSupabaseServerClient();
  const { data: image, error: imageError } = await client
    .from("listing_images")
    .select("id, listing_id")
    .eq("storage_key", storageKey)
    .maybeSingle();
  if (imageError || !image) return new Response("Not found", { status: 404 });

  const { data: listing, error: listingError } = await client
    .from("listings")
    .select("status, published_at, deleted_at")
    .eq("id", image.listing_id)
    .maybeSingle();
  if (listingError || !listing) return new Response("Not found", { status: 404 });

  let object: R2ObjectBody | null;
  try {
    object = await getListingMediaBucket().get(storageKey);
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({ etag: object.httpEtag });
  object.writeHttpMetadata(headers);
  const isPublic = listing.status === "active" && Boolean(listing.published_at) && !listing.deleted_at;
  if (isPublic) {
    headers.set("cache-control", "public, max-age=3600, s-maxage=3600");
  } else {
    headers.set("cache-control", "private, no-store, max-age=0");
    headers.set("vary", "Cookie, Authorization");
  }
  return new Response(object.body, { headers });
}
