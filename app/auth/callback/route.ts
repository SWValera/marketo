// Compatibility for links already sent; new email flows use /api/auth/callback.
export { handleEmailAuthCallback as GET } from "@/lib/auth/email-callback";
