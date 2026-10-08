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

  constructor(config: Extract<AttachmentStorageConfig, { kind: "s3" }>) {
    this.container = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 2,
    });
  }

  private async missingObject(error: unknown): Promise<boolean> {
    if (!isMissingObject(error)) return false;
    // HEAD 404 can mean either missing key or missing bucket. Verify the bucket before returning null.
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.container })); return true; }
    catch { return false; }
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<ObjectStat> {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.container, Key: objectKey(key),
        Body: bytes, ContentLength: bytes.length, ContentType: mimeType, Metadata: { sha256 } }));
      return { byteSize: bytes.length, sha256 };
    } catch { throw new AttachmentStorageFailure(); }
  }

  async head(key: string): Promise<ObjectStat | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.container, Key: objectKey(key) }));
      const sha256 = result.Metadata?.sha256;
      if (!Number.isSafeInteger(result.ContentLength) || (result.ContentLength ?? -1) < 0
          || !sha256 || !/^[0-9a-f]{64}$/u.test(sha256)) throw new AttachmentStorageFailure();
      return { byteSize: result.ContentLength!, sha256 };
    } catch (error) {
      if (await this.missingObject(error)) return null;
      throw new AttachmentStorageFailure();
    }
  }

  async get(key: string): Promise<Readable | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.container, Key: objectKey(key) }));
      if (!(result.Body instanceof Readable)) throw new AttachmentStorageFailure();
      const body = result.Body;
      return Readable.from((async function* () {
        try { for await (const chunk of body) yield chunk; }
        catch { throw new AttachmentStorageFailure(); }
      })(), { objectMode: false });
    } catch (error) {
      if (await this.missingObject(error)) return null;
      throw new AttachmentStorageFailure();
    }
  }

  /** Reserved for an isolated test or a future separately authorized retention/GC gate. */
  async remove(key: string): Promise<void> {
    try { await this.client.send(new DeleteObjectCommand({ Bucket: this.container, Key: objectKey(key) })); }
    catch { throw new AttachmentStorageFailure(); }
  }
}
