export const DATA_REQUEST_TIMEOUT_MS = 10_000;

/** Keep the deadline alive through response body consumption, not just headers. */
export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMilliseconds = DATA_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const deadline = AbortSignal.timeout(timeoutMilliseconds);
  try { return await fetch(input, {
    ...init,
    signal: inherited ? AbortSignal.any([inherited, deadline]) : deadline,
  }); } catch (error) {
    // PostgREST retries TimeoutError with a fresh deadline, but not AbortError.
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new DOMException("Data read deadline exceeded", "AbortError");
    }
    throw error;
  }
}
