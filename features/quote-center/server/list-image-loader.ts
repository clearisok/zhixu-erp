import { quoteAttachmentClient } from "./quote-attachment-client";
import type { QuoteServerListItem } from "./quote-server-client";
type Reference = { quoteId: string; revisionId: string; image: NonNullable<QuoteServerListItem["styleImage"]> };
type Entry = { reference: Reference; listeners: Set<(url: string | null) => void>; controller: AbortController; url?: string; settled: boolean; running: boolean };

/** Page-scoped cache. Never survives trusted identity changes; no automatic retry. */
export function createListImageLoader(options: {
  scope?: string;
  download?: typeof quoteAttachmentClient.download;
  createURL?: (blob: Blob) => string;
  revokeURL?: (url: string) => void;
} = {}) {
  const download = options.download ?? quoteAttachmentClient.download;
  const createURL = options.createURL ?? (blob => URL.createObjectURL(blob));
  const revokeURL = options.revokeURL ?? (url => URL.revokeObjectURL(url));
  const entries = new Map<string, Entry>();
  let running = 0, disposed = false;
  const pump = () => {
    for (const entry of entries.values()) {
      if (disposed || running >= 3) break;
      if (entry.running || entry.settled || !entry.listeners.size) continue;
      entry.running = true; running++;
      const timer = setTimeout(() => entry.controller.abort(), 30_000);
      const { quoteId, revisionId, image } = entry.reference;
      void (async () => {
        try {
          const blob = await download(quoteId, revisionId, image.attachmentId, entry.controller.signal);
          if (blob.size !== image.byteSize || blob.type !== image.mimeType) throw new Error("Invalid image object");
          const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
          if (hash !== image.sha256) throw new Error("Invalid image hash");
          if (!disposed && entry.listeners.size && !entry.controller.signal.aborted) entry.url = createURL(blob);
        } catch { /* Safe unavailable state. No provider errors/content/credentials. */ }
        finally {
          clearTimeout(timer); running--; entry.settled = true;
          if (!disposed) for (const listener of entry.listeners) listener(entry.url ?? null);
          pump();
        }
      })();
    }
  };
  return {
    acquire(reference: Reference, listener: (url: string | null) => void) {
      if (disposed || !["image/png", "image/jpeg", "image/webp"].includes(reference.image.mimeType)) { listener(null); return () => {}; }
      const key = JSON.stringify([options.scope, reference.quoteId, reference.revisionId, reference.image.attachmentId, reference.image.sha256]);
      let entry = entries.get(key);
      if (!entry) {
        if (entries.size >= 25) { listener(null); return () => {}; }
        entry = { reference, listeners: new Set(), controller: new AbortController(), settled: false, running: false };
        entries.set(key, entry);
      }
      entry.listeners.add(listener);
      if (entry.settled) listener(entry.url ?? null);
      pump();
      return () => {
        entry.listeners.delete(listener);
        if (!entry.listeners.size) {
          entry.controller.abort();
          if (entry.url) revokeURL(entry.url);
          entries.delete(key);
        }
      };
    },
    dispose() {
      disposed = true;
      for (const entry of entries.values()) { entry.listeners.clear(); entry.controller.abort(); if (entry.url) revokeURL(entry.url); }
      entries.clear();
    },
  };
}
export type ListImageLoader = ReturnType<typeof createListImageLoader>;
