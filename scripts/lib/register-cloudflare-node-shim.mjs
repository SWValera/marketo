import { register } from "node:module";

const registrationKey = Symbol.for("marketo.cloudflareNodeLoaderRegistered");
if (!globalThis[registrationKey]) {
  register(new URL("./cloudflare-node-loader.mjs", import.meta.url));
  globalThis[registrationKey] = true;
}
