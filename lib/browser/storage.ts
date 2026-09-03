export function safeGetStorageItem(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetStorageItem(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveStorageItem(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export type BrowserStorageKind = "localStorage" | "sessionStorage";

export function safeBrowserStorage(kind: BrowserStorageKind) {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

export function safeReadBrowserStorage(kind: BrowserStorageKind, key: string) {
  const storage = safeBrowserStorage(kind);
  return storage ? safeGetStorageItem(storage, key) : null;
}

export function safeWriteBrowserStorage(kind: BrowserStorageKind, key: string, value: string) {
  const storage = safeBrowserStorage(kind);
  return storage ? safeSetStorageItem(storage, key, value) : false;
}

export function safeDeleteBrowserStorage(kind: BrowserStorageKind, key: string) {
  const storage = safeBrowserStorage(kind);
  return storage ? safeRemoveStorageItem(storage, key) : false;
}
