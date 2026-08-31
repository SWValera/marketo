// Node-only substitute used by artifact and rendered-HTML tests. Production
// continues to resolve `cloudflare:workers` natively inside workerd.
export const env = globalThis.__MARKETO_CLOUDFLARE_ENV__ ?? {};
