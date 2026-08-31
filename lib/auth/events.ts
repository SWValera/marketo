export const AUTH_EVENT_CHANNEL = "marketo-auth-events-v1";
export const AUTH_EVENT_STORAGE_KEY = "marketo:auth:event";
export const PENDING_AUTH_EMAIL_KEY = "marketo:auth:pending-email";
export const PENDING_AUTH_FLOW_KEY = "marketo:auth:pending-flow";

export type AuthEventType = "signup-confirmed" | "recovery-ready" | "password-updated";

export type AuthEventMessage = {
  version: 1;
  id: string;
  type: AuthEventType;
  issuedAt: number;
};

export type AuthEventTransport = {
  publish(payload: string): void;
  subscribe(listener: (payload: string) => void): () => void;
};

const validTypes = new Set<AuthEventType>(["signup-confirmed", "recovery-ready", "password-updated"]);
const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

export function createAuthEvent(
  type: AuthEventType,
  options: { id?: string; issuedAt?: number } = {},
): AuthEventMessage {
  return {
    version: 1,
    id: options.id ?? crypto.randomUUID(),
    type,
    issuedAt: options.issuedAt ?? Date.now(),
  };
}

export function parseAuthEvent(payload: string, now = Date.now()): AuthEventMessage | null {
  try {
    const value = JSON.parse(payload) as Partial<AuthEventMessage>;
    if (value.version !== 1 || typeof value.id !== "string" || !value.id) return null;
    if (typeof value.type !== "string" || !validTypes.has(value.type as AuthEventType)) return null;
    if (typeof value.issuedAt !== "number" || value.issuedAt > now + 30_000) return null;
    if (now - value.issuedAt > MAX_EVENT_AGE_MS) return null;
    return value as AuthEventMessage;
  } catch {
    return null;
  }
}

export function createAuthEventBus(transports: readonly AuthEventTransport[], now = () => Date.now()) {
  const seen = new Set<string>();
  return {
    publish(event: AuthEventMessage) {
      const payload = JSON.stringify(event);
      for (const transport of transports) transport.publish(payload);
    },
    subscribe(listener: (event: AuthEventMessage) => void) {
      const receive = (payload: string) => {
        const event = parseAuthEvent(payload, now());
        if (!event || seen.has(event.id)) return;
        seen.add(event.id);
        listener(event);
      };
      const unsubscribers = transports.map((transport) => transport.subscribe(receive));
      return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
      };
    },
  };
}

export function publishBrowserAuthEvent(type: AuthEventType) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(createAuthEvent(type));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(AUTH_EVENT_CHANNEL);
    channel.postMessage(payload);
    window.setTimeout(() => channel.close(), 0);
  }
  try {
    window.localStorage.setItem(AUTH_EVENT_STORAGE_KEY, payload);
  } catch {
    // BroadcastChannel remains available when browser storage is blocked.
  }
}

export function subscribeToBrowserAuthEvents(listener: (event: AuthEventMessage) => void) {
  if (typeof window === "undefined") return () => undefined;
  const seen = new Set<string>();
  const receive = (payload: string) => {
    const event = parseAuthEvent(payload);
    if (!event || seen.has(event.id)) return;
    seen.add(event.id);
    listener(event);
  };
  const storageListener = (event: StorageEvent) => {
    if (event.key === AUTH_EVENT_STORAGE_KEY && event.newValue) receive(event.newValue);
  };
  window.addEventListener("storage", storageListener);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(AUTH_EVENT_CHANNEL);
  const channelListener = (event: MessageEvent<unknown>) => {
    if (typeof event.data === "string") receive(event.data);
  };
  channel?.addEventListener("message", channelListener);
  return () => {
    window.removeEventListener("storage", storageListener);
    channel?.removeEventListener("message", channelListener);
    channel?.close();
  };
}
