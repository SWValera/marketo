export function readLruEntry<Key, Value>(cache: Map<Key, Value>, key: Key) {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

export function writeLruEntry<Key, Value>(cache: Map<Key, Value>, key: Key, value: Value, maxEntries: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > Math.max(1, maxEntries)) {
    const oldestKey = cache.keys().next().value as Key | undefined;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}
