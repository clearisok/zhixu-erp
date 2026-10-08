import { createHash, randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client,
  type HeadObjectCommandOutput, type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { AttachmentStorageEnvironment } from "./storage-config.js";
import { loadAttachmentStorageConfig } from "./storage-config-loader.js";

type ProbeCommand = HeadBucketCommand | PutObjectCommand | HeadObjectCommand | GetObjectCommand | DeleteObjectCommand;
export type ProbeTransport = {
  send(command: ProbeCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
  destroy(): void;
};
type Operation = "headBucket" | "put" | "headObject" | "get" | "delete" | "postDeleteHead";
export type PreflightCode = "CONFIG_INVALID" | "BUCKET_HEAD_FAILED" | "PUT_FAILED" | "HEAD_FAILED" | "GET_FAILED"
  | "DELETE_FAILED" | "POST_DELETE_HEAD_FAILED" | "FAIL_CLEANUP_REQUIRED";
export type ObjectStoragePreflightEvidence = {
  contract: "zhixu-object-storage-preflight.v1"; result: "PASS" | "FAIL" | "FAIL_CLEANUP_REQUIRED";
  provider: "s3"; errorCode?: PreflightCode; failedOperationCode?: PreflightCode;
  endpointIdentity?: string; region?: string; bucket?: string; forcePathStyle?: boolean;
  probePrefix: "zhixu-preflight/"; probeKey?: string; byteSize: number; sha256?: string;
  headBucketPass: boolean; putPass: boolean; headPass: boolean; getPass: boolean; deletePass: boolean;
  postDeleteAbsent: boolean; cleanupConfirmed: boolean; metadataSha256Match: boolean; downloadSha256Match: boolean;
  timingsMs: Record<Operation, number>; startedAt: string; finishedAt: string;
};
export const PROBE_BYTES = 64 * 1024;
function probeKey(key: string): string {
  if (!/^zhixu-preflight\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/probe$/u.test(key))
    throw new Error("invalid_probe_key");
  return key;
}
function is404(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);
}
export function sendProbeCommand(client: S3Client, command: ProbeCommand, options: { abortSignal: AbortSignal }): Promise<unknown> {
  if (command instanceof PutObjectCommand) return client.send(command, options);
  if (command instanceof HeadObjectCommand) return client.send(command, options);
  if (command instanceof GetObjectCommand) return client.send(command, options);
  if (command instanceof DeleteObjectCommand) return client.send(command, options);
  return client.send(command, options);
}

/** Uses only a generated probe. SDK errors, requests, headers and body never enter evidence. */
export async function preflightObjectStorage(values: Readonly<Record<string, string | undefined>>, options: {
  environment?: AttachmentStorageEnvironment; timeoutMs?: number; transport?: ProbeTransport;
} = {}): Promise<ObjectStoragePreflightEvidence> {
  const startedAt = new Date().toISOString();
  const evidence: ObjectStoragePreflightEvidence = {
    contract: "zhixu-object-storage-preflight.v1", result: "FAIL", provider: "s3", probePrefix: "zhixu-preflight/", byteSize: PROBE_BYTES,
    headBucketPass: false, putPass: false, headPass: false, getPass: false, deletePass: false, postDeleteAbsent: false,
    cleanupConfirmed: false, metadataSha256Match: false, downloadSha256Match: false,
    timingsMs: { headBucket: 0, put: 0, headObject: 0, get: 0, delete: 0, postDeleteHead: 0 }, startedAt, finishedAt: startedAt,
  };
  let transport: ProbeTransport | undefined;
  let putMayHaveSucceeded = false;
  let failureCode: PreflightCode = "CONFIG_INVALID";
  const timeoutMs = options.timeoutMs ?? 10_000;
  async function timed<T>(operation: Operation, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const start = performance.now(), controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([action(controller.signal), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("probe_timeout")); }, timeoutMs);
      })]);
    } finally {
      clearTimeout(timer);
      evidence.timingsMs[operation] += Math.max(0, Math.round(performance.now() - start));
    }
  }
  const input = () => ({ Bucket: evidence.bucket!, Key: probeKey(evidence.probeKey!) });
  async function cleanup(): Promise<void> {
    // Delete only this run's exact generated key. No prefix/list/bulk operations exist here.
    await timed("delete", (abortSignal) => transport!.send(new DeleteObjectCommand(input()), { abortSignal }));
    evidence.deletePass = true;
    await timed("postDeleteHead", async (abortSignal) => {
      try { await transport!.send(new HeadObjectCommand(input()), { abortSignal }); }
      catch (error) {
        if (!is404(error)) throw new Error("probe_absence_unconfirmed");
        await transport!.send(new HeadBucketCommand({ Bucket: evidence.bucket! }), { abortSignal });
        evidence.postDeleteAbsent = true;
        return;
      }
      throw new Error("probe_still_present");
    });
    evidence.cleanupConfirmed = true;
  }
  try {
    const config = loadAttachmentStorageConfig(options.environment ?? "production", values);
    if (config.kind !== "s3" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new Error("invalid_preflight_config");
    Object.assign(evidence, { endpointIdentity: new URL(config.endpoint).origin, region: config.region, bucket: config.bucket,
      forcePathStyle: config.forcePathStyle });
    evidence.probeKey = probeKey(`zhixu-preflight/${randomUUID()}/probe`);
    const bytes = randomBytes(PROBE_BYTES);
    evidence.sha256 = createHash("sha256").update(bytes).digest("hex");
    if (options.transport) transport = options.transport;
    else {
      const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 });
      transport = { send: (command, request) => sendProbeCommand(client, command, request), destroy: () => client.destroy() };
    }
    failureCode = "BUCKET_HEAD_FAILED";
    await timed("headBucket", (abortSignal) => transport!.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal }));
    evidence.headBucketPass = true;
    failureCode = "PUT_FAILED";
    putMayHaveSucceeded = true;
    await timed("put", (abortSignal) => transport!.send(new PutObjectCommand({ ...input(), Body: bytes,
      ContentLength: bytes.length, ContentType: "application/octet-stream", Metadata: { sha256: evidence.sha256! } }), { abortSignal }));
    evidence.putPass = true;
    failureCode = "HEAD_FAILED";
    const head = await timed("headObject", (abortSignal) => transport!.send(new HeadObjectCommand(input()), { abortSignal })) as HeadObjectCommandOutput;
    if (head.ContentLength !== bytes.length || head.Metadata?.sha256 !== evidence.sha256 || head.ContentType !== "application/octet-stream")
      throw new Error("probe_head_mismatch");
    evidence.headPass = true; evidence.metadataSha256Match = true;
    failureCode = "GET_FAILED";
    await timed("get", async (abortSignal) => {
      const response = await transport!.send(new GetObjectCommand(input()), { abortSignal }) as GetObjectCommandOutput;
      const body = response.Body;
      if (!(body instanceof Readable)) throw new Error("probe_body_invalid");
      const abort = () => body.destroy(new Error("probe_timeout"));
      abortSignal.addEventListener("abort", abort, { once: true });
      try {
        if (abortSignal.aborted) throw new Error("probe_timeout");
        let size = 0;
        const hash = createHash("sha256");
        for await (const chunk of body) {
          const data = Buffer.from(chunk);
          size += data.length;
          if (size > bytes.length) throw new Error("probe_download_oversize");
          hash.update(data);
        }
        if (size !== bytes.length || hash.digest("hex") !== evidence.sha256) throw new Error("probe_download_mismatch");
      } finally {
        abortSignal.removeEventListener("abort", abort);
        body.destroy();
      }
    });
    evidence.getPass = true; evidence.downloadSha256Match = true;
    failureCode = "DELETE_FAILED";
    // Separate stage labels retain the cause when absence verification fails after DELETE.
    await timed("delete", (abortSignal) => transport!.send(new DeleteObjectCommand(input()), { abortSignal }));
    evidence.deletePass = true;
    failureCode = "POST_DELETE_HEAD_FAILED";
    await timed("postDeleteHead", async (abortSignal) => {
      try { await transport!.send(new HeadObjectCommand(input()), { abortSignal }); }
      catch (error) {
        if (!is404(error)) throw new Error("probe_absence_unconfirmed");
        await transport!.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal });
        evidence.postDeleteAbsent = true; return;
      }
      throw new Error("probe_still_present");
    });
    evidence.cleanupConfirmed = true; evidence.result = "PASS";
  } catch {
    evidence.errorCode = failureCode;
    if (putMayHaveSucceeded && !evidence.cleanupConfirmed) {
      try { await cleanup(); }
      catch {
        evidence.result = "FAIL_CLEANUP_REQUIRED";
        evidence.errorCode = "FAIL_CLEANUP_REQUIRED";
        evidence.failedOperationCode = failureCode;
      }
    }
  } finally {
    try { transport?.destroy(); } catch { /* no raw SDK diagnostics */ }
    evidence.finishedAt = new Date().toISOString();
  }
  return evidence;
}
