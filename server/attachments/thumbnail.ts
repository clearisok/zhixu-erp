import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { HttpError } from "../http/errors.js";

export const THUMBNAIL_MAX_SOURCE_BYTES = 32 * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = 96 * 1024;
const failure = () => new HttpError(503, "attachment_thumbnail_unavailable", "Thumbnail unavailable");
// Global, including services constructed per HTTP request. No retained image cache.
let active = 0;
const waiting: Array<() => void> = [];
async function permit(signal: AbortSignal) {
  signal.throwIfAborted();
  if (active >= 2) {
    if (waiting.length >= 25) throw failure();
    await new Promise<void>((resolve, reject) => {
      const grant = () => { cleanup(); resolve(); };
      const abort = () => { const at = waiting.indexOf(grant); if (at >= 0) waiting.splice(at, 1); cleanup(); reject(failure()); };
      const timer = setTimeout(abort, 10_000);
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
      waiting.push(grant); signal.addEventListener("abort", abort, { once: true });
    });
  } else active++;
  if (signal.aborted) { release(); throw failure(); }
}
function release() { const next = waiting.shift(); if (next) next(); else active--; }

async function decode(bytes: Buffer, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Source tests use tsx; compiled Docker uses plain Node. Never inherit eval,
    // inspector, app CLI arguments or secret-bearing environment into the decoder.
    const source = import.meta.url.endsWith(".ts");
    const worker = fileURLToPath(new URL(source ? "./thumbnail-worker.ts" : "./thumbnail-worker.js", import.meta.url));
    const child = spawn(process.execPath, [...(source ? ["--import", "tsx"] : []), "--max-old-space-size=128", worker], {
      stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "production" },
    });
    const parts: Buffer[] = [];
    let length = 0;
    const cancel = () => { child.kill("SIGKILL"); };
    const timer = setTimeout(cancel, 10_000);
    // Parent-side Linux RSS guard remains responsive even during native decoder work.
    // Sampling is a safety budget, not a kernel-level instantaneous RSS guarantee.
    let checking = false;
    const rss = process.platform === "linux" ? setInterval(() => {
      if (checking || !child.pid) return;
      checking = true;
      void readFile(`/proc/${child.pid}/status`, "utf8").then(status => {
        const kb = Number(/^VmRSS:\s+(\d+)\s+kB$/mu.exec(status)?.[1]);
        if (kb > 256 * 1024) cancel();
      }).catch(() => {}).finally(() => { checking = false; });
    }, 25) : undefined;
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > THUMBNAIL_MAX_BYTES) cancel(); else parts.push(chunk);
    });
    child.once("error", () => { cancel(); });
    child.once("close", code => {
      clearTimeout(timer); signal.removeEventListener("abort", cancel);
      clearInterval(rss);
      if (code !== 0 || signal.aborted || !length || length > THUMBNAIL_MAX_BYTES) reject(failure());
      else resolve(Buffer.concat(parts));
    });
    child.stdin.end(bytes);
  });
}

/** Admission precedes storage read. Full original SHA verified before decoder sees it.
 * Read and processing cancellation really destroys streams/processes; no Promise.race leak.
 */
export async function generateThumbnail(
  source: { size: number; sha256: string },
  open: (signal: AbortSignal) => Promise<Readable>, external?: AbortSignal,
) {
  if (!Number.isSafeInteger(source.size) || source.size < 1 || source.size > THUMBNAIL_MAX_SOURCE_BYTES) throw failure();
  const controller = new AbortController();
  const abort = () => controller.abort();
  external?.addEventListener("abort", abort, { once: true });
  if (external?.aborted) abort();
  const signal = controller.signal;
  let stream: Readable | undefined, admitted = false;
  const destroy = () => stream?.destroy(failure());
  const timer = setTimeout(abort, 30_000);
  try {
    await permit(signal); admitted = true;
    signal.addEventListener("abort", destroy, { once: true });
    stream = await open(signal);
    if (signal.aborted) { stream.destroy(); throw failure(); }
    const chunks: Buffer[] = [];
    const hash = createHash("sha256");
    let length = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (signal.aborted || length > source.size || length > THUMBNAIL_MAX_SOURCE_BYTES) throw failure();
      hash.update(bytes); chunks.push(bytes);
    }
    if (length !== source.size || hash.digest("hex") !== source.sha256) throw failure();
    const bytes = Buffer.concat(chunks); chunks.length = 0;
    const thumbnail = await decode(bytes, signal);
    return { bytes: thumbnail, mimeType: "image/jpeg", sha256: createHash("sha256").update(thumbnail).digest("hex") };
  } catch { throw failure(); }
  finally {
    stream?.destroy(); clearTimeout(timer);
    external?.removeEventListener("abort", abort); signal.removeEventListener("abort", destroy);
    if (admitted) release();
  }
}
