import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-origin";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/profile", "/messages", "/notifications", "/favorites", "/publish", "/login", "/settings", "/help"] }, sitemap: `${SITE_ORIGIN}/sitemap.xml`, host: SITE_ORIGIN };
}
