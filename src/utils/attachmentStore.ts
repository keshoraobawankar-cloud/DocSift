const DB_NAME = "distill_attachments_db";
const STORE_NAME = "attachment_blobs";
const DB_VERSION = 1;

export interface StoredAttachmentPayload {
  id: string;
  base64?: string;
  textContent?: string;
  mimeType: string;
  fileName: string;
}

function openAttachmentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function saveAttachmentPayload(
  payload: StoredAttachmentPayload
): Promise<void> {
  try {
    const db = await openAttachmentDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Gracefully ignore storage errors in restricted environments
  }
}

export async function loadAttachmentPayload(
  id: string
): Promise<StoredAttachmentPayload | null> {
  try {
    const db = await openAttachmentDb();
    const result = await new Promise<StoredAttachmentPayload | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () =>
          resolve((req.result as StoredAttachmentPayload | undefined) ?? null);
        req.onerror = () => reject(req.error);
      }
    );
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function deleteAttachmentPayloads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openAttachmentDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export async function clearAllAttachmentPayloads(): Promise<void> {
  try {
    const db = await openAttachmentDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const clean = base64.replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}
