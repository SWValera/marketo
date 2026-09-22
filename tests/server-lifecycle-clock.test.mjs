import assert from "node:assert/strict";
import test from "node:test";
import { readServerTime, refreshServerTime, subscribeServerTime, millisecondsUntilServerDeadline } from "../lib/lifecycle/server-clock.ts";

test("device clock cannot expire server state; concurrent readers share one uncached read; failures retain confirmed time", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const serverNow = 2000000000000;
  let calls = 0, fail = false;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/api/lifecycle/time");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "omit");
    if (fail) throw new Error("offline");
    return Response.json({ now: serverNow });
  };
  const unsubscribe = subscribeServerTime(() => {});
  try {
    await Promise.all([refreshServerTime(), refreshServerTime(), refreshServerTime()]);
    assert.equal(calls, 1);
    for (const shift of [40, -40]) {
      Date.now = () => serverNow + shift * 86400000;
      await refreshServerTime();
      assert.equal(readServerTime(), serverNow);
      const remaining = millisecondsUntilServerDeadline(serverNow + 60000);
      assert.ok(remaining > 59000 && remaining <= 60000);
    }
    fail = true;
    assert.equal(await refreshServerTime(), false);
    assert.equal(readServerTime(), serverNow);
    fail = false;
    window.dispatchEvent(new Event("pageshow"));
    await refreshServerTime();
    assert.equal(readServerTime(), serverNow);
    globalThis.fetch = async () => Response.json({ now: "invalid" });
    assert.equal(await refreshServerTime(), false);
    assert.equal(readServerTime(), serverNow);
  } finally {
    unsubscribe();globalThis.fetch = originalFetch;Date.now = originalNow;
    globalThis.window = previousWindow;globalThis.document = previousDocument;
  }
});
