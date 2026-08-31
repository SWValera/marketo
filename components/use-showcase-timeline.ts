"use client";

import { useSyncExternalStore } from "react";
import { rotationFrameAt, SHOWCASE_ROTATION_MS } from "@/lib/showcase-rotation";

const subscribeNever = () => () => undefined;
const getZeroSnapshot = () => 0;
const getTimelineSnapshot = () => rotationFrameAt(Date.now());

function subscribeTimeline(listener: () => void) {
  const now = Date.now();
  const delay = SHOWCASE_ROTATION_MS - (now % SHOWCASE_ROTATION_MS) + 1;
  let interval: number | undefined;
  const timeout = window.setTimeout(() => {
    listener();
    interval = window.setInterval(listener, SHOWCASE_ROTATION_MS);
  }, delay);
  return () => {
    window.clearTimeout(timeout);
    if (interval !== undefined) window.clearInterval(interval);
  };
}

function subscribeReducedMotion(listener: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

const getReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const getServerReducedMotion = () => false;

export function useShowcaseTimeline(paused: boolean) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  return useSyncExternalStore(
    paused || reducedMotion ? subscribeNever : subscribeTimeline,
    reducedMotion ? getZeroSnapshot : getTimelineSnapshot,
    getZeroSnapshot,
  );
}
