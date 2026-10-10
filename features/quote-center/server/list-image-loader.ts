import { quoteAttachmentClient } from "./quote-attachment-client";
import { inspectListImage, LIST_IMAGE_MAX_BYTES, LIST_IMAGE_MAX_PIXELS, LIST_IMAGE_TOTAL_BYTES, LIST_IMAGE_TOTAL_PIXELS, ListImagePolicyError, type ListImageFailure } from "./list-image-policy";
import type { QuoteServerListItem } from "./quote-server-client";
type Reference = { quoteId: string; revisionId: string; image: NonNullable<QuoteServerListItem["styleImage"]> };
type Listener = (url: string | null, reason?: ListImageFailure) => void;
type Entry = { reference: Reference; listeners: Set<Listener>; controller: AbortController; url?: string; reason?: ListImageFailure; settled: boolean; running: boolean; reserved: boolean; pixels: number };

/** Visible-consumer cache. Byte/pixel reservations include cancelled in-flight work.
 * No offscreen LRU; last visible consumer leaving releases its URL immediately.
 */
export function createListImageLoader(options: {
  scope?: string; download?: typeof quoteAttachmentClient.thumbnail;
  createURL?: (blob: Blob) => string; revokeURL?: (url: string) => void;
} = {}) {
  const download = options.download ?? quoteAttachmentClient.thumbnail;
  const createURL = options.createURL ?? (blob => URL.createObjectURL(blob));
  const revokeURL = options.revokeURL ?? (url => URL.revokeObjectURL(url));
  const entries = new Map<string, Entry>();
  let running = 0, reservedBytes = 0, reservedPixels = 0, disposed = false;
  const free = (entry: Entry) => { if (entry.reserved) { entry.reserved = false; reservedBytes -= LIST_IMAGE_MAX_BYTES; reservedPixels -= entry.pixels; } };
  const pump = () => {
    for (const entry of entries.values()) {
      if (disposed) break;
      if (entry.running || entry.settled || !entry.listeners.size) continue;
      if (running >= 3 || reservedBytes + LIST_IMAGE_MAX_BYTES > LIST_IMAGE_TOTAL_BYTES || reservedPixels + LIST_IMAGE_MAX_PIXELS > LIST_IMAGE_TOTAL_PIXELS) {
        if (entry.reason !== "budget") { entry.reason = "budget"; for (const listener of entry.listeners) listener(null, "budget"); }
        continue;
      }
      entry.running = true; entry.reserved = true; running++; reservedBytes += LIST_IMAGE_MAX_BYTES; reservedPixels += entry.pixels;
      const timer = setTimeout(() => entry.controller.abort(), 35_000);
      const { quoteId, revisionId, image } = entry.reference;
      void (async () => {
        try {
          const { blob, sha256 } = await download(quoteId, revisionId, image.attachmentId, entry.controller.signal);
          if (!blob.size || blob.size > LIST_IMAGE_MAX_BYTES || blob.type !== "image/jpeg") throw new Error("Invalid thumbnail object");
          if (disposed || !entry.listeners.size || entry.controller.signal.aborted) return;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const dimensions = inspectListImage(bytes, blob.type);
          const actualPixels = dimensions.width * dimensions.height;
          reservedPixels -= entry.pixels - actualPixels; entry.pixels = actualPixels;
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
          if (hash !== sha256) throw new Error("Invalid thumbnail hash");
          if (!disposed && entry.listeners.size && !entry.controller.signal.aborted) entry.url = createURL(blob);
        } catch (error) { entry.reason = error instanceof ListImagePolicyError ? error.reason : "unavailable"; }
        finally {
          clearTimeout(timer); running--; entry.running = false; entry.settled = true;
          if (!entry.url) free(entry);
          if (!disposed) for (const listener of entry.listeners) listener(entry.url ?? null, entry.url ? undefined : entry.reason ?? "unavailable");
          pump();
        }
      })();
    }
  };
  return {
    acquire(reference: Reference, listener: Listener) {
      const { image } = reference;
      if (disposed || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) || !Number.isSafeInteger(image.byteSize) || image.byteSize < 1) { listener(null, "unavailable"); return () => {}; }
      const key = JSON.stringify([options.scope, reference.quoteId, reference.revisionId, image.attachmentId, image.sha256]);
      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= 25) { listener(null, "budget"); return () => {}; }
        entry = { reference, listeners: new Set(), controller: new AbortController(), settled: false, running: false, reserved: false, pixels: LIST_IMAGE_MAX_PIXELS };
        entries.set(key, entry);
      }
      entry.listeners.add(listener);
      if (entry.settled) listener(entry.url ?? null, entry.reason);
      pump();
      return () => {
        entry.listeners.delete(listener);
        if (!entry.listeners.size) {
          entry.controller.abort();
          if (entry.url) { revokeURL(entry.url); entry.url = undefined; }
          if (!entry.running) free(entry); // Do not release ignored-abort buffers' reservation early.
          if (entries.get(key) === entry) entries.delete(key);
          pump();
        }
      };
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) {
        entry.listeners.clear(); entry.controller.abort();
        if (entry.url) { revokeURL(entry.url); entry.url = undefined; }
        if (!entry.running) free(entry);
      }
      entries.clear();
    },
  };
}
export type ListImageLoader = ReturnType<typeof createListImageLoader>;
