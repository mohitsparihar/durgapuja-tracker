"use client";

/**
 * Tiny IndexedDB key-value store for pending photo blobs, so selected/compressed photos
 * survive a reload or the Google sign-in round trip. Every call fails soft: if
 * IndexedDB is unavailable (private mode, blocked storage) the app just keeps photos in memory.
 */
const DB = "pandal-hop";
const STORE = "pending-photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

export interface StoredPhoto {
  key: string;
  blob: Blob;
  status: "ready" | "failed" | "done";
  error: string | null;
}

export const photoStore = {
  get: (k: string) => run<StoredPhoto[] | undefined>("readonly", (s) => s.get(k)).then((v) => v ?? []),
  set: (k: string, v: StoredPhoto[]) => run("readwrite", (s) => s.put(v, k)),
  del: (k: string) => run("readwrite", (s) => s.delete(k)),
};
