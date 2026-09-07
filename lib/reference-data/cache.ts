type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export function createSingleFlightTtlCache<Key, Value>({
  maxEntries,
  maxInFlight = maxEntries,
  shareInFlight = true,
  ttlMilliseconds,
  now = Date.now,
}: {
  maxEntries: number;
  maxInFlight?: number;
  shareInFlight?: boolean;
  ttlMilliseconds: (value: Value) => number;
  now?: () => number;
}) {
  const entries = new Map<Key, CacheEntry<Value>>();
  const inFlight = new Map<Key, Promise<Value>>();

  function read(key: Key) {
    const cached = entries.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    entries.delete(key);
    entries.set(key, cached);
    return cached.value;
  }

  function write(key: Key, value: Value) {
    const currentTime = now();
    for (const [cachedKey, cached] of entries) {
      if (cached.expiresAt <= currentTime) entries.delete(cachedKey);
    }
    entries.delete(key);
    entries.set(key, {
      expiresAt: currentTime + Math.max(0, ttlMilliseconds(value)),
      value,
    });
    while (entries.size > Math.max(1, maxEntries)) {
      const oldestKey = entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  return {
    getOrLoad(key: Key, load: () => Promise<Value>) {
      const cached = read(key);
      if (cached !== undefined) return Promise.resolve(cached);

      // Workers I/O belongs to the request that started it. Never retain its
      // pending Promise across requests: an abandoned response can strand it.
      // Server callers share only completed public values; React cache handles
      // deduplication within a render. Browser callers may still single-flight.
      if (!shareInFlight) {
        return Promise.resolve().then(load).then((value) => {
          if (ttlMilliseconds(value) > 0) write(key, value);
          return value;
        });
      }

      const pending = inFlight.get(key);
      if (pending) return pending;

      if (inFlight.size >= Math.max(1, maxInFlight)) {
        return Promise.reject(new Error("Reference data request capacity exceeded."));
      }

      const request = Promise.resolve()
        .then(load)
        .then((value) => {
          write(key, value);
          return value;
        })
        .finally(() => {
          if (inFlight.get(key) === request) inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request;
    },
  };
}

export function createSingleFlightTtlLoader<T>(
  load: () => Promise<T>,
  ttlMilliseconds: number,
  now: () => number = Date.now,
) {
  const cache = createSingleFlightTtlCache<string, T>({
    maxEntries: 1,
    ttlMilliseconds: () => ttlMilliseconds,
    now,
  });
  return () => cache.getOrLoad("value", load);
}
