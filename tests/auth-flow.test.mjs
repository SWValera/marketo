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
  assert.equal(callback.pathname, "/api/auth/callback");
  assert.equal(callback.searchParams.get("next"), "/publish");
  assert.equal(callback.searchParams.get("flow"), "signup");
  const recovery = new URL(authCallbackUrl("https://marketo.kz", "/login?password_reset=success", "recovery"));
  assert.equal(recovery.searchParams.get("flow"), "recovery");
});

test("frontend auth implements register, login, refreshed session, recovery, password update, callback and logout", async () => {
  const [form, callback, authResult, updatePassword, events, logout, profileEdit, publishPage, proxy] = await Promise.all([
    readFile(new URL("components/auth-form.tsx", root), "utf8"),
    readFile(new URL("lib/auth/email-callback.ts", root), "utf8"),
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
  assert.match(updatePassword, /getRequestUser\(/);
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
  assert.match(proxy, /getRequestUser\(client\)/);
  const verifiedUser = await readFile(new URL("lib/auth/request-user.ts", root), "utf8");
  assert.match(verifiedUser, /client\.auth\.getUser\(\)/);
  assert.doesNotMatch(verifiedUser, /auth\.getSession\(/);
});

test("auth and profile messages are complete in RU and KK", () => {
  const required = [
    "auth.mode.login", "auth.mode.register", "auth.mode.recover",
    "auth.submit.login", "auth.submit.register", "auth.submit.recover",
    "auth.submit.update-password", "auth.errorGeneric", "auth.logout",
    "auth.confirmedSignIn", "auth.resend", "auth.errorCallbackExpired",
    "profile.requiredError", "profile.phoneError", "profile.saveError",
    "profile.login", "profile.register", "profile.recover", "profile.loadErrorTitle", "auth.readErrorTitle", "auth.readErrorNote",
  ];
  for (const key of required) {
    assert.ok(messages.ru[key]?.trim(), `missing RU ${key}`);
    assert.ok(messages.kk[key]?.trim(), `missing KK ${key}`);
  }
});

test("recovery email opens the canonical server OTP callback without an originating PKCE verifier", async () => {
  const template = await readFile(new URL("supabase/templates/recovery.html", root), "utf8");
  assert.doesNotMatch(template, /ConfirmationURL|localhost|workers\.dev|access_token|refresh_token/);
  assert.equal((template.match(/https:\/\/jevu\.kz\/api\/auth\/callback\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery&amp;flow=recovery/g) ?? []).length, 3);
  assert.match(template, /Восстановление пароля/);
});
