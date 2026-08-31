export const NATIVE_TYPESCRIPT_STRIP_FLAG = "--experimental-strip-types";
export const MINIMUM_SUPPORTED_NODE_VERSION = "22.13.0";

const enabledStripTypesPattern = /(^|\s)--experimental-strip-types(?=\s|$)/;
const disabledStripTypesPattern = /(^|\s)--no-experimental-strip-types(?=\s|$)/g;

export function prepareNodeRuntimeEnvironment(baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  const configuredOptions = String(environment.NODE_OPTIONS ?? "")
    .replace(disabledStripTypesPattern, "$1")
    .trim();

  environment.NODE_OPTIONS = enabledStripTypesPattern.test(configuredOptions)
    ? configuredOptions
    : [configuredOptions, NATIVE_TYPESCRIPT_STRIP_FLAG].filter(Boolean).join(" ");

  return environment;
}
