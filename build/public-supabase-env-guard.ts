import type { Plugin } from "vite";

type BuildEnvironment = Readonly<Record<string, string | undefined>>;
type BuildDefines = Readonly<Record<string, unknown>> | undefined;

const URL_NAME = "NEXT_PUBLIC_SUPABASE_URL";
const PUBLISHABLE_NAME = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const ANON_NAME = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const KEY_NAMES = [PUBLISHABLE_NAME, ANON_NAME] as const;

function assertInline(define: BuildDefines, name: string, value: string) {
  if (define?.[`process.env.${name}`] !== JSON.stringify(value)) {
    throw new Error(`vinext did not inline ${name} into the browser build.`);
  }
}

function isLegacyServiceRoleJwt(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    return Boolean(payload && typeof payload === "object" && "role" in payload && payload.role === "service_role");
  } catch {
    return false;
  }
}

export function assertPublicSupabaseBrowserBuild(
  environment: BuildEnvironment,
  define: BuildDefines,
) {
  const rawUrl = environment[URL_NAME];
  if (!rawUrl?.trim()) {
    throw new Error(`Missing required browser build variable: ${URL_NAME}.`);
  }
  if (rawUrl !== rawUrl.trim()) {
    throw new Error(`${URL_NAME} must not contain leading or trailing whitespace.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(`${URL_NAME} is not a valid URL.`);
  }

  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname);
  if (
    parsedUrl.username
    || parsedUrl.password
    || (parsedUrl.protocol !== "https:" && !(localHost && parsedUrl.protocol === "http:"))
  ) {
    throw new Error(`${URL_NAME} must be a credential-free HTTPS URL outside local development.`);
  }

  const selectedName = environment[PUBLISHABLE_NAME] !== undefined
    ? PUBLISHABLE_NAME
    : ANON_NAME;
  const selectedKey = environment[selectedName];
  if (!selectedKey?.trim()) {
    throw new Error(`Missing required browser build variable: ${PUBLISHABLE_NAME} or ${ANON_NAME}.`);
  }

  for (const name of KEY_NAMES) {
    const value = environment[name];
    if (value === undefined) continue;
    if (value !== value.trim()) {
      throw new Error(`${name} must not contain leading or trailing whitespace.`);
    }
    if (/^(?:sb_secret_|service_role)/i.test(value) || isLegacyServiceRoleJwt(value)) {
      throw new Error("A server-only Supabase key cannot be exposed through NEXT_PUBLIC_*.");
    }
    assertInline(define, name, value);
  }
  assertInline(define, URL_NAME, rawUrl);
}

export function publicSupabaseBuildEnvGuard(): Plugin {
  return {
    name: "marketo:public-supabase-build-env",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      assertPublicSupabaseBrowserBuild(process.env, config.define);
    },
  };
}
