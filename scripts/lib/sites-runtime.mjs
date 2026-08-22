import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export const projectRoot = resolve(moduleDirectory, "../..");

export class ProcessExecutionError extends Error {
  constructor(message, { exitCode = null, signal = null, timedOut = false } = {}) {
    super(message);
    this.name = "ProcessExecutionError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.timedOut = timedOut;
  }
}

export function createSitesEnvironment(baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  const configuredRuntimeRoot = environment.SITES_RUNTIME_ROOT;
  const runtimeRoot = configuredRuntimeRoot
    ? (isAbsolute(configuredRuntimeRoot) ? configuredRuntimeRoot : resolve(projectRoot, configuredRuntimeRoot))
    : join(projectRoot, ".sites-runtime");

  const paths = {
    runtimeRoot,
    home: join(runtimeRoot, "home"),
    npmCache: join(runtimeRoot, "npm-cache"),
    xdgConfig: join(runtimeRoot, "xdg-config"),
    temporary: join(runtimeRoot, "tmp"),
    wranglerLogs: join(runtimeRoot, "wrangler", "logs"),
    miniflareRegistry: join(runtimeRoot, "wrangler", "registry"),
    updateCheck: join(runtimeRoot, "tmp", "update-check"),
  };

  for (const directory of [paths.home, paths.npmCache, paths.xdgConfig, paths.temporary, paths.wranglerLogs, paths.updateCheck]) {
    mkdirSync(directory, { recursive: true });
  }

  // Wrangler's bundled update notifier performs a registry request even for a
  // deploy --dry-run. Prime its short-lived cache so local validation remains
  // genuinely offline; npm ci remains the authoritative version check.
  const rootPackage = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const configuredWrangler = rootPackage.devDependencies?.wrangler ?? "0.0.0";
  const installedWranglerPath = join(projectRoot, "node_modules", "wrangler", "package.json");
  const wranglerVersion = existsSync(installedWranglerPath)
    ? JSON.parse(readFileSync(installedWranglerPath, "utf8")).version
    : String(configuredWrangler).replace(/^[^\d]*/, "");
  writeFileSync(join(paths.updateCheck, "wrangler-latest.json"), JSON.stringify({
    lastUpdate: Date.now(),
    latest: wranglerVersion,
  }));

  Object.assign(environment, {
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    HOME: paths.home,
    XDG_CONFIG_HOME: paths.xdgConfig,
    TMPDIR: paths.temporary,
    TMP: paths.temporary,
    TEMP: paths.temporary,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: paths.wranglerLogs,
    MINIFLARE_REGISTRY_PATH: paths.miniflareRegistry,
    npm_config_cache: paths.npmCache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  });

  for (const key of [
    "NPM_CONFIG_CACHE",
    "npm_config_proxy",
    "npm_config_http_proxy",
    "npm_config_https_proxy",
    "NPM_CONFIG_PROXY",
    "NPM_CONFIG_HTTP_PROXY",
    "NPM_CONFIG_HTTPS_PROXY",
  ]) {
    delete environment[key];
  }

  return { environment, paths, projectRoot };
}

export function parseDuration(value, fallbackMilliseconds) {
  if (value === undefined || value === null || value === "") return fallbackMilliseconds;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const units = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  return Math.round(Number(match[1]) * units[(match[2] ?? "ms").toLowerCase()]);
}

export function resolveLocalBin(packageName, binName = packageName) {
  const packageDirectory = join(projectRoot, "node_modules", ...packageName.split("/"));
  const packageJsonPath = join(packageDirectory, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`${packageName} is unavailable. Run npm run install:ci and wait for it to finish.`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const relativeBin = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.[binName];
  if (!relativeBin) throw new Error(`${packageName} does not expose the ${binName} executable.`);

  const binPath = resolve(packageDirectory, relativeBin);
  if (!existsSync(binPath)) throw new Error(`Missing executable for ${packageName}: ${binPath}`);
  return binPath;
}

export function runProcess(command, args = [], options = {}) {
  const {
    cwd = projectRoot,
    environment = process.env,
    timeoutMilliseconds = 0,
    killAfterMilliseconds = 10_000,
    capture = false,
    label = command,
  } = options;

  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let timeoutHandle;
    let killHandle;
    let timedOut = false;
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });

    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }

    const signalHandlers = new Map();
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => {
        if (!child.killed) child.kill(signal);
      };
      signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    };

    if (timeoutMilliseconds > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        if (!child.killed) child.kill("SIGTERM");
        killHandle = setTimeout(() => {
          if (!settled) child.kill("SIGKILL");
        }, killAfterMilliseconds);
      }, timeoutMilliseconds);
      timeoutHandle.unref?.();
    }

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new ProcessExecutionError(`Could not start ${label}: ${error.message}`));
    });

    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        rejectPromise(new ProcessExecutionError(`${label} exceeded its time limit.`, { exitCode: 124, signal, timedOut: true }));
        return;
      }
      if (exitCode !== 0) {
        const detail = capture && stderr.trim() ? `\n${stderr.trim()}` : "";
        rejectPromise(new ProcessExecutionError(`${label} failed with exit code ${exitCode ?? "unknown"}.${detail}`, { exitCode, signal }));
        return;
      }
      resolvePromise({ exitCode, signal, stdout, stderr });
    });
  });
}

export function runLocalBin(packageName, binName, args = [], options = {}) {
  const binPath = resolveLocalBin(packageName, binName);
  return runProcess(process.execPath, [binPath, ...args], { ...options, label: options.label ?? binName });
}

export function runNodeScript(relativePath, args = [], options = {}) {
  return runProcess(process.execPath, [resolve(projectRoot, relativePath), ...args], {
    ...options,
    label: options.label ?? relativePath,
  });
}

export function runNpm(args = [], options = {}) {
  const environment = options.environment ?? process.env;
  const npmExecPath = environment.npm_execpath ?? process.env.npm_execpath;
  if (!npmExecPath || !existsSync(npmExecPath)) {
    throw new Error("npm executable metadata is unavailable. Run this command through npm run.");
  }
  return runProcess(process.execPath, [npmExecPath, ...args], { ...options, label: options.label ?? `npm ${args.join(" ")}` });
}

export function reportFailure(error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (typeof error?.exitCode === "number") process.exitCode = error.exitCode;
  else if (error?.signal === "SIGINT") process.exitCode = 130;
  else if (error?.signal === "SIGTERM") process.exitCode = 143;
  else process.exitCode = 1;
}
