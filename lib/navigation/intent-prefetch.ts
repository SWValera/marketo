type TimerHandle = ReturnType<typeof setTimeout>;

type IntentPrefetchClock = {
  schedule: (callback: () => void, delayMilliseconds: number) => TimerHandle;
  cancel: (handle: TimerHandle) => void;
};

const browserClock: IntentPrefetchClock = {
  schedule: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
  cancel: (handle) => clearTimeout(handle),
};

export function createIntentPrefetchController(
  prefetch: () => void,
  delayMilliseconds = 150,
  clock: IntentPrefetchClock = browserClock,
) {
  let timer: TimerHandle | null = null;
  let requested = false;

  function cancel() {
    if (timer === null) return;
    clock.cancel(timer);
    timer = null;
  }

  function request() {
    cancel();
    if (requested) return;
    requested = true;
    prefetch();
  }

  function schedule() {
    if (requested || timer !== null) return;
    timer = clock.schedule(() => {
      timer = null;
      request();
    }, delayMilliseconds);
  }

  return { cancel, dispose: cancel, request, schedule };
}
