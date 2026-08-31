import assert from "node:assert/strict";
import test from "node:test";
import {
  rotationFrameAt,
  rotationIndexAt,
  showcaseWindow,
  SHOWCASE_ROTATION_MS,
} from "../lib/showcase-rotation.ts";

test("Home return advances by true elapsed 3-second steps", () => {
  const leftHomeAt = 1_800_000_000_000;
  const homeFrame = rotationFrameAt(leftHomeAt);
  const returnedFrame = rotationFrameAt(leftHomeAt + 9_500);

  assert.equal(SHOWCASE_ROTATION_MS, 3_000);
  assert.equal(returnedFrame - homeFrame, 3);
  assert.equal(rotationIndexAt(returnedFrame, 20), (rotationIndexAt(homeFrame, 20) + 3) % 20);
  assert.equal(rotationFrameAt(leftHomeAt + 9_500), returnedFrame, "refresh/remount must resolve the same frame");
});

test("manual offset changes position without stopping elapsed-time autoplay", () => {
  const leftHomeAt = 1_800_000_000_000;
  const initialFrame = rotationFrameAt(leftHomeAt);
  const returnedFrame = rotationFrameAt(leftHomeAt + 9_500);
  const manualOffset = -1;

  assert.equal(
    rotationIndexAt(returnedFrame, 20, manualOffset),
    (rotationIndexAt(initialFrame, 20, manualOffset) + 3) % 20,
  );
});

test("deterministic wrapping gives every placement the first slot fairly", () => {
  const items = Array.from({ length: 7 }, (_, index) => `placement-${index}`);
  const firstSlots = new Set(
    Array.from({ length: items.length }, (_, frame) => showcaseWindow(items, frame, 0, 3)[0]),
  );

  assert.equal(firstSlots.size, items.length);
  assert.deepEqual(showcaseWindow(items, 6, 0, 3), [items[6], items[0], items[1]]);
});
