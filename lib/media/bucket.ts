import { env } from "cloudflare:workers";

export function getListingMediaBucket(): R2Bucket {
  const bucket = env.MARKETO_MEDIA;
  if (!bucket) throw new Error("MARKETO_MEDIA R2 binding is not configured.");
  return bucket;
}
