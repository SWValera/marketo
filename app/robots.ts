import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/profile", "/messages", "/notifications", "/favorites", "/publish", "/login", "/settings", "/help"] }, sitemap: "https://marketo.kz/sitemap.xml", host: "https://marketo.kz" };
}
