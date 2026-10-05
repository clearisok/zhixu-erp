import { createHash } from "node:crypto";
import { Readable } from "node:stream";

export type ObjectIdentity = { provider: string; container: string; key: string };
export type ObjectStat = { byteSize: number; sha256: string };

/** Provider-neutral contract. Production must inject an explicitly configured object-store adapter. */
export interface AttachmentStorage {
  readonly provider: string;
  readonly container: string;
  put(key: string, bytes: Buffer, mimeType: string): Promise<ObjectStat>;
  head(key: string): Promise<ObjectStat | null>;
  get(key: string): Promise<Readable | null>;
  /** Reserved for a separately authorized retention/GC gate; Q4A never calls it. */
  remove(key: string): Promise<void>;
}

/** Deterministic disposable-test adapter, never selected by normal Server runtime. */
export class MemoryAttachmentStorage implements AttachmentStorage {
  readonly provider = "memory-test";
  readonly container = "disposable";
  readonly objects = new Map<string, Buffer>();
  failPut = false;
  failHead = false;

  async put(key: string, bytes: Buffer): Promise<ObjectStat> {
    if (this.failPut) throw new Error("storage_put_failed");
    this.objects.set(key, Buffer.from(bytes));
    return { byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  async head(key: string): Promise<ObjectStat | null> {
    if (this.failHead) throw new Error("storage_head_failed");
    const bytes = this.objects.get(key);
    return bytes ? { byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } : null;
  }
  async get(key: string): Promise<Readable | null> {
    const bytes = this.objects.get(key);
    return bytes ? Readable.from([Buffer.from(bytes)]) : null;
  }
  async remove(key: string): Promise<void> { this.objects.delete(key); }
}
