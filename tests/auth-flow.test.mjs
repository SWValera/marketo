import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authCallbackUrl, safeInternalPath } from "../lib/auth/redirect.ts";
import { messages } from "../lib/i18n/messages.ts";

const root = new URL("../", import.meta.url);

test("auth redirect targets remain internal", () => {
  assert.equal(safeInternalPath("/publish?step=2"), "/publish?step=2");
  assert.equal(safeInternalPath("https://evil.example/steal"), "/profile");
  assert.equal(safeInternalPath("//evil.example/steal"), "/profile");
  assert.equal(safeInternalPath("/\\evil.example"), "/profile");
  const callback = new URL(authCallbackUrl("https://marketo.kz", "/publish"));
  assert.equal(callback.origin, "https://marketo.kz");
  assert.equal(callback.pathname, "/auth/callback");
  assert.equal(callback.searchParams.get("next"), "/publish");
  assert.equal(callback.searchParams.get("flow"), "signup");
  const recovery = new URL(authCallbackUrl("https://marketo.kz", "/login?password_reset=success", "recovery"));
  assert.equal(recovery.searchParams.get("flow"), "recovery");
});

test("frontend auth implements register, login, refreshed session, recovery, password update, callback and logout", async () => {
  const [form, callback, authResult, updatePassword, events, logout, profileEdit, publishPage, proxy] = await Promise.all([
    readFile(new URL("components/auth-form.tsx", root), "utf8"),
    readFile(new URL("app/auth/callback/route.ts", root), "utf8"),
    readFile(new URL("components/auth-result-content.tsx", root), "utf8"),
    readFile(new URL("app/auth/update-password/page.tsx", root), "utf8"),
    readFile(new URL("lib/auth/events.ts", root), "utf8"),
    readFile(new URL("components/logout-button.tsx", root), "utf8"),
    readFile(new URL("components/profile-edit-content.tsx", root), "utf8"),
    readFile(new URL("app/publish/page.tsx", root), "utf8"),
    readFile(new URL("proxy.ts", root), "utf8"),
  ]);
  for (const method of ["signUp", "signInWithPassword", "resetPasswordForEmail", "updateUser"]) assert.match(form, new RegExp(`auth\\.${method}`));
  assert.match(form, /auth\.resend/);
  assert.match(form, /confirmedAndSignIn/);
  assert.match(form, /auth\.crossDeviceNote/);
  assert.doesNotMatch(form, /setInterval|password.*loop/i);
  assert.match(callback, /exchangeCodeForSession|verifyOtp/);
  assert.match(callback, /classifyAuthCallbackError/);
  assert.match(authResult, /publishBrowserAuthEvent\("signup-confirmed"\)/);
  assert.match(updatePassword, /auth\.getUser\(\)/);
  assert.match(events, /BroadcastChannel/);
  assert.match(events, /storage/);
  assert.match(logout, /auth\.signOut/);
  assert.match(profileEdit, /updateCurrentAccountProfile/);
  assert.match(publishPage, /getCurrentAuthContext\(\)/);
  assert.match(publishPage, /authContext\.status === "anonymous"/);
  assert.match(publishPage, /redirect\(publishLoginHref\(validRequestedListing\)\)/);
  assert.match(proxy, /createServerClient<Database>/);
  assert.match(proxy, /request\.cookies\.getAll\(\)/);
  assert.match(proxy, /response\.cookies\.set/);
  assert.match(proxy, /client\.auth\.getUser\(\)/);
});

test("auth and profile messages are complete in RU and KK", () => {
  const required = [
    "auth.mode.login", "auth.mode.register", "auth.mode.recover",
    "auth.submit.login", "auth.submit.register", "auth.submit.recover",
    "auth.submit.update-password", "auth.errorGeneric", "auth.logout",
    "auth.confirmedSignIn", "auth.resend", "auth.errorCallbackExpired",
    "profile.requiredError", "profile.phoneError", "profile.saveError",
    "profile.login", "profile.register", "profile.recover", "profile.loadErrorTitle",
  ];
  for (const key of required) {
    assert.ok(messages.ru[key]?.trim(), `missing RU ${key}`);
    assert.ok(messages.kk[key]?.trim(), `missing KK ${key}`);
  }
});
