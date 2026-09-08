import { AsyncLocalStorage } from "node:async_hooks";
import { cache as reactCache } from "react";
import { fetchWithDeadline } from "./fetch-deadline.ts";

// Per incoming read, never an isolate-global pending request or identity cache.
export const PAGE_READ_BUDGET_MS = 9_000;
type ReadScope = { signal: AbortSignal; deadline: number; memo: Map<unknown, unknown> };
const storage = new AsyncLocalStorage<ReadScope>();

export function readScope() { return storage.getStore(); }

export function requestMemo<T>(key: unknown, load: () => Promise<T>): Promise<T> {
  const scope = storage.getStore();
  if (!scope) return load();
  if (!scope.memo.has(key)) scope.memo.set(key, Promise.resolve().then(load));
  return scope.memo.get(key) as Promise<T>;
}

/** Memoizes successes AND failures across metadata and content of this request. */
export function requestCache<Args extends unknown[], Value>(load: (...args: Args) => Promise<Value>) {
  const fallback = reactCache(load);
  return (...args: Args): Promise<Value> => {
    if (!storage.getStore()) return fallback(...args);
    const scope = storage.getStore()!;
    if (!scope.memo.has(load)) scope.memo.set(load, new Map<string, Promise<Value>>());
    const entries = scope.memo.get(load) as Map<string, Promise<Value>>;
    // Used only with zero args or primitive reference IDs/locale/query strings.
    const key = JSON.stringify(args);
    if (!entries.has(key)) entries.set(key, Promise.resolve().then(() => load(...args)));
    return entries.get(key)!;
  };
}

export function fetchWithinRead(input: RequestInfo | URL, init?: RequestInit) {
  const scope = storage.getStore();
  if (!scope) return fetchWithDeadline(input, init);
  scope.signal.throwIfAborted();
  const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return fetchWithDeadline(input, {
    ...init,
    signal: inherited ? AbortSignal.any([inherited, scope.signal]) : scope.signal,
  }, Math.max(1, scope.deadline - Date.now()));
}

function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function withPageReadScope(request: Request, handle: () => Promise<Response>, milliseconds = PAGE_READ_BUDGET_MS) {
  const control = new AbortController();
  const dataControl = new AbortController();
  const abort = () => { control.abort(request.signal.reason); dataControl.abort(request.signal.reason); };
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => control.abort(new DOMException("Page read deadline exceeded", "AbortError")), milliseconds);
  // Leave a bounded slice to render the existing honest error state after data
  // cancellation. Do not cut off that fallback at the same instant as the API.
  const dataMilliseconds = Math.max(1, milliseconds - Math.min(250, milliseconds / 10));
  const dataTimer = setTimeout(() => dataControl.abort(new DOMException("Data read deadline exceeded", "AbortError")), dataMilliseconds);
  const scope: ReadScope = { signal: dataControl.signal, deadline: Date.now() + dataMilliseconds, memo: new Map() };
  const dispose = () => { clearTimeout(timer); clearTimeout(dataTimer); request.signal.removeEventListener("abort", abort); };
  try {
    const response = await storage.run(scope, () => untilAbort(handle(), control.signal));
    if (!response.body) { dispose(); return response; }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await storage.run(scope, () => untilAbort(reader.read(), control.signal));
          if (result.done) { dispose(); controller.close(); }
          else controller.enqueue(result.value);
        } catch (error) {
          dispose(); controller.error(error);
          void reader.cancel(error).catch(() => {});
        }
      },
      cancel(reason) { control.abort(reason); dataControl.abort(reason); dispose(); void reader.cancel(reason).catch(() => {}); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) { dispose(); throw error; }
}
