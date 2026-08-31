import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { classifyAuthCallbackError } from "../lib/auth/callback-error.ts";
import {
  hasAnyRole,
  hasRole,
  resolveCurrentAuthContext,
} from "../lib/auth/context-core.ts";
import {
  createAuthEvent,
  createAuthEventBus,
  parseAuthEvent,
} from "../lib/auth/events.ts";

const root = new URL("../", import.meta.url);

const profileRow = {
  id: "10000000-0000-4000-8000-000000000001",
  display_name: "Ordinary User",
  avatar_path: null,
  bio: null,
  language_code: "ru",
  settlement_id: null,
  status: "active",
  verified_at: null,
  contact_phone_e164: null,
  created_at: "2026-08-30T00:00:00.000Z",
  updated_at: "2026-08-30T00:00:00.000Z",
};

function fakeClient({
  user = { id: profileRow.id, email: "user@example.kz" },
  authError = null,
  profile = profileRow,
  profileError = null,
  roles = [],
  rolesError = null,
} = {}) {
  return {
    auth: {
      async getUser() {
        return { data: { user }, error: authError };
      },
    },
    rpc(name) {
      assert.equal(name, "get_my_account_profile");
      return {
        async maybeSingle() {
          return { data: profile, error: profileError };
        },
      };
    },
    from(table) {
      assert.equal(table, "user_roles");
      return {
        select(columns) {
          assert.equal(columns, "role");
          return {
            async eq(column, value) {
              assert.equal(column, "user_id");
              assert.equal(value, user.id);
              return { data: roles.map((role) => ({ role })), error: rolesError };
            },
          };
        },
      };
    },
  };
}

test("auth context distinguishes anonymous, ordinary authenticated and profile failure states", async () => {
  const quietLogger = () => undefined;
  const anonymous = await resolveCurrentAuthContext(fakeClient({
    user: null,
    authError: { name: "AuthSessionMissingError", message: "Auth session missing!" },
  }), quietLogger);
  assert.deepEqual(anonymous, {
    status: "anonymous",
    user: null,
    profile: null,
    roles: [],
    isAuthenticated: false,
  });

  const ordinary = await resolveCurrentAuthContext(fakeClient(), quietLogger);
  assert.equal(ordinary.status, "authenticated");
  assert.equal(ordinary.profile.displayName, "Ordinary User");
  assert.equal(ordinary.accountStatus, "active");
  assert.equal(ordinary.profile.accountStatus, "active");
  assert.deepEqual(ordinary.roles, []);
  assert.equal(hasAnyRole(ordinary, ["moderator", "admin"]), false);

  const logged = [];
  const failedProfile = await resolveCurrentAuthContext(fakeClient({
    profileError: { name: "PostgrestError", code: "PGRST000", message: "network unavailable" },
  }), (details) => logged.push(details));
  assert.equal(failedProfile.status, "error");
  assert.equal(failedProfile.isAuthenticated, true);
  assert.equal(failedProfile.profile, null);
  assert.equal(logged[0].scope, "profile");
  assert.equal("message" in logged[0], false);
});

test("auth context loads server roles and role helpers do not trust client state", async () => {
  const moderator = await resolveCurrentAuthContext(fakeClient({ roles: ["moderator"] }), () => undefined);
  assert.equal(moderator.status, "authenticated");
  assert.equal(hasRole(moderator, "moderator"), true);
  assert.equal(hasRole(moderator, "admin"), false);
  assert.equal(hasAnyRole(moderator, ["moderator", "admin"]), true);

  const suspendedModerator = await resolveCurrentAuthContext(fakeClient({
    roles: ["moderator"],
    profile: { ...profileRow, status: "suspended" },
  }), () => undefined);
  assert.equal(suspendedModerator.status, "authenticated");
  assert.equal(suspendedModerator.accountStatus, "suspended");
  assert.equal(hasRole(suspendedModerator, "moderator"), false);
  assert.equal(hasAnyRole(suspendedModerator, ["moderator", "admin"]), false);

  const bannedAdmin = await resolveCurrentAuthContext(fakeClient({
    roles: ["admin"],
    profile: { ...profileRow, status: "banned" },
  }), () => undefined);
  assert.equal(hasRole(bannedAdmin, "admin"), false);
});

test("same-origin auth event bus delivers a valid confirmation once across duplicate transports", () => {
  const listeners = new Set();
  const transport = {
    publish(payload) {
      for (const listener of listeners) listener(payload);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const now = 1_777_500_000_000;
  const bus = createAuthEventBus([transport, transport], () => now);
  const received = [];
  const unsubscribe = bus.subscribe((event) => received.push(event));
  bus.publish(createAuthEvent("signup-confirmed", { id: "confirmation-1", issuedAt: now }));
  unsubscribe();
  assert.deepEqual(received.map((event) => event.type), ["signup-confirmed"]);
  assert.equal(parseAuthEvent(JSON.stringify({ version: 1, id: "old", type: "signup-confirmed", issuedAt: now - 700_000 }), now), null);
  assert.equal(parseAuthEvent("not-json", now), null);
});

test("callback errors distinguish expired and invalid links", () => {
  assert.equal(classifyAuthCallbackError({ code: "otp_expired", message: "Email link is expired" }), "expired");
  assert.equal(classifyAuthCallbackError({ message: "Token has an invalid signature" }), "invalid");
  assert.equal(classifyAuthCallbackError(null), "invalid");
});

test("the Marketo import graph contains no second ChatGPT identity adapter", async () => {
  await assert.rejects(readFile(new URL("app/chatgpt-auth.ts", root), "utf8"), { code: "ENOENT" });
  const importedModules = [];
  for (const directory of ["app", "components", "lib"]) {
    const names = await readdir(new URL(`${directory}/`, root), { recursive: true });
    for (const name of names.filter((entry) => /\.(?:ts|tsx)$/.test(entry))) {
      const source = await readFile(new URL(`${directory}/${name}`, root), "utf8");
      const sourceFile = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
          importedModules.push(statement.moduleSpecifier.text);
        }
      }
    }
  }
  assert.equal(importedModules.some((specifier) => specifier.includes("chatgpt-auth")), false);
});
