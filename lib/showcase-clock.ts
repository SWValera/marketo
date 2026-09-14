import { rotationFrameAt, rotationIndexAt, SHOWCASE_ROTATION_MS } from "./showcase-rotation.ts";

export type ShowcaseClockEnvironment = {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
  isVisible: () => boolean;
  subscribeActivity: (listener: (active: boolean) => void) => () => void;
};

/** Lazy external store: no timers/listeners until React subscribes after commit. */
export function createShowcaseClock(
  options: { pageCount: number; paused: boolean; scope: string },
  environment: ShowcaseClockEnvironment,
) {
  const { pageCount, paused } = options;
  const enabled = !paused && pageCount > 1;
  const listeners = new Set<() => void>();
  let timer: number | undefined;
  let removeActivity: (() => void) | undefined;
  let active = true;
  let manual: { bucket: number; page: number } | undefined;

  const getSnapshot = () => {
    if (!enabled) return 0;
    const bucket = rotationFrameAt(environment.now());
    return manual?.bucket === bucket ? manual.page : rotationIndexAt(bucket, pageCount);
  };
  const notify = () => listeners.forEach((listener) => listener());
  const clearTimer = () => {
    if (timer !== undefined) environment.clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clearTimer();
    if (!enabled || !listeners.size || !active || !environment.isVisible()) return;
    const remainder = environment.now() % SHOWCASE_ROTATION_MS;
    timer = environment.setTimeout(() => {
      timer = undefined;
      manual = undefined;
      notify();
      // Recalculate from wall clock even if the browser delayed this callback.
      schedule();
    }, SHOWCASE_ROTATION_MS - remainder);
  };

  return {
    getSnapshot,
    getServerSnapshot: () => 0,
    selectPage: (page: number) => {
      if (!enabled) return;
      manual = { bucket: rotationFrameAt(environment.now()), page: rotationIndexAt(page, pageCount) };
      notify();
      // Manual interaction never restarts or duplicates the boundary timer.
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1 && enabled) {
        active = environment.isVisible();
        removeActivity = environment.subscribeActivity((visible) => {
          active = visible;
          manual = undefined;
          notify();
          schedule();
        });
        schedule();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearTimer();
          removeActivity?.();
          removeActivity = undefined;
          manual = undefined;
        }
      };
    },
  };
}
