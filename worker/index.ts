/** Cloudflare Worker entry point for the vinext application. */
import { safelyProcessModerationQueue } from "../lib/moderation/runtime";
import handler from "vinext/server/app-router-entry";
import { withPageReadScope } from "../lib/http/read-scope";
import { canonicalRedirect } from "../lib/site-origin";

interface Env {
  ASSETS: Fetcher;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async scheduled(_controller: unknown, _env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(safelyProcessModerationQueue());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const redirect = canonicalRedirect(request.url);
    if (redirect) return Response.redirect(redirect.href, 308);
    const path = new URL(request.url).pathname;
    // No deadline/replay policy for writes, media, auth callbacks or static files.
    if (request.method !== "GET" || path === "/auth/callback" || path === "/auth/callback/"
      || /^\/(?:assets|api\/media|icons)\//.test(path)
      || /\.(?:js|css|png|svg|webp|ico|webmanifest)$/.test(path)) {
      const response = await handler.fetch(request, env, ctx);
      if (request.method === "POST" && /^\/api\/listings\/[^/]+\/submit$/.test(path) && response.ok) {
        ctx.waitUntil(safelyProcessModerationQueue());
      }
      return response;
    }
    return withPageReadScope(request, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
