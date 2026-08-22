import { createHash, randomUUID } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  createSitesEnvironment,
  parseDuration,
  projectRoot,
  reportFailure,
  resolveLocalBin,
  runNpm,
} from "./lib/sites-runtime.mjs";

class InstallError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function pathsEqual(left, right) {
  const normalize = (value) => {
    const normalized = resolve(value);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

async function acquireInstallLock(lockPath) {
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), project_root: projectRoot })}\n`);
      return async () => {
        await handle.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let lock = {};
      try {
        const lockSource = await readFile(lockPath, "utf8");
        if (lockSource.trim()) lock = JSON.parse(lockSource);
      } catch {
        // Empty and legacy flock files are stale unless they name a live owner.
      }
      let ownerAlive = false;
      if (Number.isInteger(lock.pid)) {
        try {
          process.kill(lock.pid, 0);
          ownerAlive = true;
        } catch (probeError) {
          ownerAlive = probeError.code === "EPERM";
        }
      }
      if (ownerAlive) throw new InstallError(`Another dependency install is already running for ${projectRoot}.`, 75);
      await unlink(lockPath).catch(() => {});
    }
  }
  throw new InstallError(`Could not acquire the dependency install lock for ${projectRoot}.`, 75);
}

async function rejectOverlappingLinuxInstall() {
  if (process.platform !== "linux") return;
  const procEntries = await readdir("/proc").catch(() => []);
  for (const entry of procEntries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid || pid === process.ppid) continue;
    const processPath = join("/proc", entry);
    const processCwd = await readlink(join(processPath, "cwd")).catch(() => null);
    if (!processCwd || !pathsEqual(processCwd, projectRoot)) continue;
    const command = await readFile(join(processPath, "cmdline")).catch(() => null);
    if (command && command.toString("utf8").replaceAll("\0", " ").includes("npm ci")) {
      throw new InstallError(`Another npm ci is visible in ${projectRoot}; refusing to overlap installs.`, 75);
    }
  }
}

async function copyDirectoryContents(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    await cp(join(source, entry.name), join(destination, entry.name), { recursive: true, force: true });
  }
}

function lockedVinext(lock) {
  const vinext = lock.packages?.["node_modules/vinext"];
  if (!vinext?.resolved || !vinext?.integrity) {
    throw new InstallError("package-lock.json does not contain a resolved, integrity-pinned vinext tarball.", 65);
  }
  return vinext;
}

function registryTarballUrl(lockedUrl, registryUrl) {
  const locked = new URL(lockedUrl);
  const registry = new URL(registryUrl);
  if (locked.hostname === "registry.npmjs.org") {
    locked.protocol = registry.protocol;
    locked.host = registry.host;
    locked.pathname = `${registry.pathname.replace(/\/$/, "")}${locked.pathname}`;
  }
  return locked.href;
}

async function verifyLockedTarball(vinext, registry, preflightDirectory, environment) {
  await rm(preflightDirectory, { recursive: true, force: true });
  await mkdir(preflightDirectory, { recursive: true });
  console.log("[sites] downloading the complete locked vinext tarball");
  const packResult = await runNpm([
    "pack",
    registryTarballUrl(vinext.resolved, registry),
    "--ignore-scripts",
    "--pack-destination",
    preflightDirectory,
    "--json",
  ], {
    environment,
    cwd: projectRoot,
    capture: true,
    timeoutMilliseconds: 120_000,
    killAfterMilliseconds: 15_000,
    label: "locked Vinext tarball download",
  });

  let packed;
  try {
    packed = JSON.parse(packResult.stdout);
  } catch {
    throw new InstallError("npm did not return valid metadata for the locked Vinext tarball.", 65);
  }
  const filename = packed?.[0]?.filename;
  if (!filename) throw new InstallError("npm did not produce the locked Vinext tarball.", 65);

  console.log("[sites] verifying locked vinext tarball integrity");
  const integrity = vinext.integrity.trim().split(/\s+/)[0];
  const separator = integrity.indexOf("-");
  if (separator <= 0) throw new InstallError(`Unsupported integrity value: ${integrity}`, 65);
  const algorithm = integrity.slice(0, separator);
  const expected = integrity.slice(separator + 1);
  const actual = createHash(algorithm)
    .update(await readFile(join(preflightDirectory, basename(filename))))
    .digest("base64");
  if (actual !== expected) throw new InstallError(`Vinext tarball integrity mismatch for ${algorithm}.`, 65);
  console.log("[sites] network and integrity preflight passed");
}

async function main() {
  const { environment, paths } = createSitesEnvironment();
  const expectedHome = paths.home;
  const expectedCache = paths.npmCache;
  const packageLockPath = join(projectRoot, "package-lock.json");

  console.log("[sites] validating writable install environment");
  if (!pathsEqual(environment.HOME, expectedHome)) {
    throw new InstallError(`Expected HOME=${expectedHome}, got HOME=${environment.HOME}.`, 78);
  }
  const npmCacheResult = await runNpm(["config", "get", "cache"], {
    environment,
    cwd: projectRoot,
    capture: true,
    label: "npm cache lookup",
  });
  const actualCache = npmCacheResult.stdout.trim();
  if (!pathsEqual(actualCache, expectedCache)) {
    throw new InstallError(`Expected npm cache ${expectedCache}, got ${actualCache}.`, 78);
  }

  const writeToken = `.sites-write-test-${process.pid}-${randomUUID()}`;
  const homeTest = join(expectedHome, writeToken);
  const cacheTest = join(expectedCache, writeToken);
  await writeFile(homeTest, "ok");
  await writeFile(cacheTest, "ok");
  await Promise.all([unlink(homeTest), unlink(cacheTest)]);
  console.log(`[sites] environment passed: HOME=${expectedHome}, cache=${expectedCache}`);

  const releaseLock = await acquireInstallLock(join(paths.runtimeRoot, "install.lock"));
  try {
    await rejectOverlappingLinuxInstall();
    const lockfileSha256 = await sha256(packageLockPath);
    let useSeededCache = false;
    const seedCache = environment.SITES_NPM_CACHE_SEED;
    if (seedCache) {
      try {
        await access(seedCache);
        const seedDigest = (await readFile(join(seedCache, ".sites-lockfile-sha256"), "utf8").catch(() => "")).trim();
        if (seedDigest === lockfileSha256) {
          console.log("[sites] restoring image-seeded npm cache");
          await copyDirectoryContents(seedCache, expectedCache);
          useSeededCache = true;
          console.log("[sites] image cache seed matched; registry fallback remains available");
        } else {
          console.log("[sites] image cache seed does not match this lockfile; using the network path");
        }
      } catch {
        // A missing optional seed is equivalent to the normal network path.
      }
    }

    const lock = JSON.parse(await readFile(packageLockPath, "utf8"));
    const vinext = lockedVinext(lock);
    if (!useSeededCache) {
      const registryResult = await runNpm(["config", "get", "registry"], {
        environment,
        cwd: projectRoot,
        capture: true,
        label: "npm registry lookup",
      });
      await verifyLockedTarball(vinext, registryResult.stdout.trim(), join(paths.runtimeRoot, "preflight"), environment);
    }

    console.log("[sites] running exactly one bounded npm ci");
    const installEnvironment = {
      ...environment,
      NPM_CONFIG_MAXSOCKETS: "1",
      NPM_CONFIG_FETCH_RETRIES: "0",
      NPM_CONFIG_FETCH_TIMEOUT: "30000",
    };
    const npmArguments = ["ci", "--cache", expectedCache];
    if (useSeededCache) npmArguments.push("--prefer-offline");
    await runNpm(npmArguments, {
      environment: installEnvironment,
      cwd: projectRoot,
      timeoutMilliseconds: parseDuration(environment.SITES_INSTALL_TIMEOUT, 480_000),
      killAfterMilliseconds: parseDuration(environment.SITES_INSTALL_KILL_AFTER, 15_000),
      label: "npm ci",
    });

    resolveLocalBin("vinext", "vinext");
    await writeFile(join(projectRoot, "node_modules", ".sites-install.json"), `${JSON.stringify({
      lockfile_sha256: lockfileSha256,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    }, null, 2)}\n`);
    console.log("[sites] npm ci passed and vinext is available");
  } finally {
    await releaseLock();
  }
}

main().catch(reportFailure);
