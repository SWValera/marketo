import { createSupabasePublicServerClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getListingMediaBucket } from "@/lib/media/bucket";
import { isListingMediaFilename, trustedListingMediaContentType } from "@/lib/media/storage-key";

import { getListingImageProcessor } from "@/lib/media/photo-service";
import { listingThumbnail, listingDetailImage } from "@/lib/media/listing-thumbnail";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const avatarFilename = /^[a-z0-9][a-z0-9_-]{0,127}\.(?:jpe?g|png|webp|avif)$/i;

const avatarContentTypes: Record<string, string> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

async function servePublicAvatar(segments: string[]) {
  if (segments.length !== 3 || segments[0] !== "avatars" || !uuid.test(segments[1]) || !avatarFilename.test(segments[2])) {
    return new Response("Not found", { status: 404 });
  }

  const storageKey = segments.join("/");
  let profile: { avatar_path: string | null } | null;
  try {
    const client = createSupabasePublicServerClient();
    const result = await client
      .from("seller_profiles")
      .select("avatar_path")
      .eq("id", segments[1])
      .maybeSingle();
    if (result.error) return new Response("Media unavailable", { status: 503 });
    profile = result.data;
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }

  // The public profile row is the authorization source: arbitrary avatar-like
  // keys must never turn this endpoint into a public R2 object proxy.
  if (!profile || profile.avatar_path !== storageKey) {
    return new Response("Not found", { status: 404 });
  }

  let object: R2ObjectBody | null;
  try {
    object = await getListingMediaBucket().get(storageKey);
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }
  if (!object) return new Response("Not found", { status: 404 });

  const extension = segments[2].slice(segments[2].lastIndexOf(".") + 1).toLowerCase();
  const headers = new Headers({
    "cache-control": "public, max-age=3600, s-maxage=3600",
    "content-type": avatarContentTypes[extension],
    etag: object.httpEtag,
    "x-content-type-options": "nosniff",
  });
  return new Response(object.body, { headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  if (segments[0] === "avatars") return servePublicAvatar(segments);
  if (segments.length !== 4 || segments[0] !== "listings" || !uuid.test(segments[1]) || !uuid.test(segments[2]) || !isListingMediaFilename(segments[3])) {
    return new Response("Not found", { status: 404 });
  }

  const storageKey = segments.join("/");
  let image: { mime_type: string | null } | null = null;
  let isPublic = false;
  try {
    const publicClient = createSupabasePublicServerClient();
    const publicResult = await publicClient
      .from("listing_images")
      .select("mime_type")
      .eq("storage_key", storageKey)
      .maybeSingle();
    if (publicResult.error) return new Response("Media unavailable", { status: 503 });
    image = publicResult.data;
    isPublic = Boolean(image);
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }

  if (!image) {
    try {
      const client = await createSupabaseServerClient();
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) return new Response("Not found", { status: 404 });
      const protectedResult = await client
        .from("listing_images")
        .select("mime_type")
        .eq("storage_key", storageKey)
        .maybeSingle();
      if (protectedResult.error) return new Response("Media unavailable", { status: 503 });
      image = protectedResult.data;
    } catch {
      return new Response("Media unavailable", { status: 503 });
    }
  }
  if (!image) return new Response("Not found", { status: 404 });

  const contentType = trustedListingMediaContentType(storageKey, image.mime_type);
  if (!contentType) return new Response("Media unavailable", { status: 503 });

  let object: R2ObjectBody | null;
  try {
    object = await getListingMediaBucket().get(storageKey);
  } catch {
    return new Response("Media unavailable", { status: 503 });
  }
  if (!object) return new Response("Not found", { status: 404 });

  const variant = new URL(request.url).searchParams.get("variant");
  const transform = variant === listingThumbnail.variant ? listingThumbnail : variant === listingDetailImage.variant ? listingDetailImage : null;
  const etag = transform ? 'W/"' + object.httpEtag.replaceAll('"', '') + '-' + transform.variant + '-v1"' : object.httpEtag;
  const headers = new Headers({
    "content-type": transform ? "image/webp" : contentType,
    etag,
    "x-content-type-options": "nosniff",
    // Revalidate public eligibility before browser reuse; private images are never stored.
    "cache-control": isPublic ? "private, no-cache, must-revalidate" : "private, no-store, max-age=0",
    vary: "Cookie, Authorization",
  });
  const tags = request.headers.get("if-none-match")?.split(",").map((tag) => tag.trim().replace(/^W\//, ""));
  if (isPublic && tags?.some((tag) => tag === "*" || tag === etag.replace(/^W\//, ""))) {
    void object.body.cancel().catch(() => {});
    return new Response(null, { status: 304, headers });
  }
  if (transform) {
    // This key is internal only. An edge hit can NEVER bypass the live RLS check above.
    const cache = isPublic && typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;
    const cacheUrl = new URL(request.url);
    cacheUrl.search = "";
    cacheUrl.searchParams.set("variant", transform.variant);
    cacheUrl.searchParams.set("media-etag", etag);
    const cacheKey = new Request(cacheUrl);
    try {
      const cached = await cache?.match(cacheKey);
      if (cached) {
        void object.body.cancel().catch(() => {});
        headers.set("x-media-cache", "hit");
        return new Response(cached.body, { headers });
      }
    } catch { /* Cache availability must not determine image availability. */ }
    try {
      const output = await getListingImageProcessor().input(object.body).transform({
        width: transform.width, height: transform.height, fit: transform.variant === "card" ? "cover" : "scale-down",
      }).output({ format: "image/webp", quality: transform.quality, anim: false });
      const thumbnail = output.response();
      if (!thumbnail.ok || !thumbnail.body) throw new Error("thumbnail_unavailable");
      headers.set("x-media-cache", "miss");
      if (cache) {
        const copy = thumbnail.clone();
        try {
          await cache.put(cacheKey, new Response(copy.body, { headers: {
            "content-type": "image/webp", "cache-control": "public, max-age=86400",
          } }));
        } catch { /* Deliver the authorized image even when the edge cache is unavailable. */ }
      }
      return new Response(thumbnail.body, { headers });
    } catch {
      return new Response("Media unavailable", { status: 503 });
    }
  }
  return new Response(object.body, { headers });
}
