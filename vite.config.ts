import vinext from "vinext";
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { publicSupabaseBuildEnvGuard } from "./build/public-supabase-env-guard";
import { sites } from "./build/sites-vite-plugin";

const hostingConfigPath = fileURLToPath(new URL("./.openai/hosting.json", import.meta.url));
const hostingConfig = existsSync(hostingConfigPath)
  ? JSON.parse(readFileSync(hostingConfigPath, "utf8")) as { r2: string | null }
  : { r2: null };
const { r2 } = hostingConfig;
const mediaBucketName = process.env.MARKETO_MEDIA_BUCKET_NAME?.trim();
if (r2 && !mediaBucketName) {
  throw new Error("MARKETO_MEDIA_BUCKET_NAME is required when the MARKETO_MEDIA binding is enabled.");
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",

  r2_buckets: r2
    ? [
      {
        binding: r2,
        bucket_name: mediaBucketName!,
      },
    ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
      publicSupabaseBuildEnvGuard(),
    ],
  };
});
