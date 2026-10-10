import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import type { AttachmentStorageConfig } from "./storage-config.js";
import type { AttachmentStorage, ObjectStat } from "./storage.js";

export class AttachmentStorageFailure extends Error {
  readonly code = "attachment_storage_failure";
  constructor() { super("Attachment object storage operation failed"); this.name = "AttachmentStorageFailure"; }
}

function objectKey(key: string): string {
  if (!/^attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/original$/u.test(key)) {
    throw new AttachmentStorageFailure();
  }
  return key;
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: number } };
  return value.$metadata?.httpStatusCode === 404 && (value.name === "NotFound" || value.name === "NoSuchKey");
}

/** No SDK error/cause is exposed: SDK exceptions can include signed requests or endpoint details. */
export class S3AttachmentStorage implements AttachmentStorage {
  readonly provider = "s3";
  readonly container: string;
  private readonly client: S3Client;

  constructor(config: Extract<AttachmentStorageConfig, { kind: "s3" }>, private readonly deadlines = { requestMs: 30_000, streamMs: 90_000 }) {
    if (!Number.isSafeInteger(deadlines.requestMs) || deadlines.requestMs <= 0 || !Number.isSafeInteger(deadlines.streamMs) || deadlines.streamMs <= 0) throw new AttachmentStorageFailure();
    this.container = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5_000, socketTimeout: 30_000, requestTimeout: 30_000, throwOnRequestTimeout: true },
    });
  }

  private async bounded<T>(action: (signal: AbortSignal) => Promise<T>, external?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    external?.addEventListener("abort", abort, { once: true });
    if (external?.aborted) abort();
    const timer = setTimeout(() => controller.abort(), this.deadlines.requestMs);
    try { return await action(controller.signal); }
    finally { clearTimeout(timer); external?.removeEventListener("abort", abort); }
  }

  destroy(): void { this.client.destroy(); }

  private async missingObject(error: unknown, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;
    if (!isMissingObject(error)) return false;
    // HEAD 404 can mean either missing key or missing bucket. Verify the bucket before returning null.
    try { await this.bounded(signal => this.client.send(new HeadBucketCommand({ Bucket: this.container }), { abortSignal: signal }), signal); return true; }
    catch { return false; }
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<ObjectStat> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      await this.bounded(signal => this.client.send(new PutObjectCommand({ Bucket: this.container, Key: objectKey(key),
        Body: bytes, ContentLength: bytes.length, ContentType: mimeType, Metadata: { sha256 } }), { abortSignal: signal }));
      return { byteSize: bytes.length, sha256 };
    } catch { throw new AttachmentStorageFailure(); }
  }

  async head(key: string, signal?: AbortSignal): Promise<ObjectStat | null> {
    try {
      const result = await this.bounded(signal => this.client.send(new HeadObjectCommand({ Bucket: this.container, Key: objectKey(key) }), { abortSignal: signal }), signal);
      const sha256 = result.Metadata?.sha256;
      if (!Number.isSafeInteger(result.ContentLength) || (result.ContentLength ?? -1) < 0
          || !sha256 || !/^[0-9a-f]{64}$/u.test(sha256)) throw new AttachmentStorageFailure();
      return { byteSize: result.ContentLength!, sha256 };
    } catch (error) {
      if (await this.missingObject(error, signal)) return null;
      throw new AttachmentStorageFailure();
    }
  }

  async get(key: string, externalSignal?: AbortSignal): Promise<Readable | null> {
    const controller = new AbortController();
    let body: Readable | undefined;
    let output: Readable | undefined;
    let timer = setTimeout(() => controller.abort(), this.deadlines.requestMs);
    const cancel = () => { controller.abort(); body?.destroy(); output?.destroy(new AttachmentStorageFailure()); };
    const cleanup = () => { clearTimeout(timer); externalSignal?.removeEventListener("abort", cancel); controller.abort(); body?.destroy(); };
    externalSignal?.addEventListener("abort", cancel, { once: true });
    if (externalSignal?.aborted) controller.abort();
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.container, Key: objectKey(key) }), { abortSignal: controller.signal });
      if (!(result.Body instanceof Readable)) throw new AttachmentStorageFailure();
      body = result.Body;
      clearTimeout(timer);
      timer = setTimeout(() => { cancel(); }, this.deadlines.streamMs);
      const upstream = body;
      output = Readable.from((async function* () {
        try { for await (const chunk of upstream) yield chunk; }
        catch { throw new AttachmentStorageFailure(); }
        finally { cleanup(); }
      })(), { objectMode: false });
      output._destroy = (error, callback) => { cleanup(); callback(error ? new AttachmentStorageFailure() : null); };
      output.once("end", cleanup);
      return output;
    } catch (error) {
      cleanup();
      if (await this.missingObject(error, externalSignal)) return null;
      throw new AttachmentStorageFailure();
    }
  }

  /** Reserved for an isolated test or a future separately authorized retention/GC gate. */
  async remove(key: string): Promise<void> {
    try { await this.bounded(signal => this.client.send(new DeleteObjectCommand({ Bucket: this.container, Key: objectKey(key) }), { abortSignal: signal })); }
    catch { throw new AttachmentStorageFailure(); }
  }
}
