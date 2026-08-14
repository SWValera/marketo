import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PWA manifest and icons are complete", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  for (const icon of ["marketo-180.png", "marketo-192.png", "marketo-512.png", "marketo-maskable-512.png"]) {
    assert.ok((await stat(new URL(`public/icons/${icon}`, root))).size > 100);
  }
});

test("PWA install always opens on platform choice", async () => {
  const source = await readFile(new URL("components/pwa-install.tsx", root), "utf8");
  assert.match(source, /const showInstall[\s\S]*setChoice\(null\)[\s\S]*setOpen\(true\)/);
  assert.match(source, /setChoice\("ios"\)/);
  assert.match(source, /setChoice\("android"\)/);
});

test("shell helpers never execute another shell helper directly", async () => {
  for (const file of ["build-verified.sh", "install-ci.sh", "validate-artifact.sh"]) {
    const source = await readFile(new URL(`scripts/${file}`, root), "utf8");
    assert.doesNotMatch(source, /^\s*(?:exec\s+)?"\$\{script_dir\}\/sites-env\.sh"/m);
    assert.match(source, /source "\$\{script_dir\}\/sites-env\.sh"/);
  }
  const build = await readFile(new URL("scripts/build-verified.sh", root), "utf8");
  assert.match(build, /bash "\$\{script_dir\}\/validate-artifact\.sh"/);
});

test("source contains no absolute local Windows paths", async () => {
  const files = ["package.json", "vite.config.ts", "next.config.ts", "README.md"];
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.doesNotMatch(source, /[A-Za-z]:\\\\/);
  }
});
