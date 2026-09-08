/** Cloudflare Worker entry point for the vinext application. */
import handler from "vinext/server/app-router-entry";
import { withPageReadScope } from "../lib/http/read-scope";

interface Env {
  ASSETS: Fetcher;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    // No deadline/replay policy for writes, media, auth callbacks or static files.
    if (request.method !== "GET" || path === "/auth/callback" || path === "/auth/callback/"
      || /^\/(?:assets|api\/media|icons)\//.test(path)
      || /\.(?:js|css|png|svg|webp|ico|webmanifest)$/.test(path)) {
      return handler.fetch(request, env, ctx);
    }
    return withPageReadScope(request, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
