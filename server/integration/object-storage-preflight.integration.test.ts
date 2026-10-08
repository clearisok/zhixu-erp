import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parseAttachmentStorageConfig } from "../attachments/storage-config.js";
import { loadServerConfig } from "../config.js";
import { preflightObjectStorage, PROBE_BYTES, sendProbeCommand, type ProbeTransport } from "../attachments/object-storage-preflight.js";
import { S3AttachmentStorage } from "../attachments/s3-storage.js";
import { startDisposableMinio } from "./minio-container.js";

const exec = promisify(execFile);
const fakeValues = { ZHIXU_ATTACHMENT_STORAGE: "s3", ZHIXU_ATTACHMENT_S3_ENDPOINT: "https://storage.example.invalid",
  ZHIXU_ATTACHMENT_S3_REGION: "ap-hongkong", ZHIXU_ATTACHMENT_S3_BUCKET: "synthetic-existing-bucket",
  ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: "synthetic-key-id", ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: "synthetic-key-secret",
  ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "false" };

test("pure storage parser is shared with runtime, DB-independent and sanitized", async () => {
  assert.deepEqual(parseAttachmentStorageConfig("test", fakeValues),
    loadServerConfig({ ...fakeValues, NODE_ENV: "test", DATABASE_URL: "postgresql://synthetic:test@127.0.0.1:5432/synthetic" }).attachmentStorage);
  assert.equal((parseAttachmentStorageConfig("production", fakeValues) as { forcePathStyle: boolean }).forcePathStyle, false);
  assert.equal((parseAttachmentStorageConfig("test", { ...fakeValues, ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "true" }) as { forcePathStyle: boolean }).forcePathStyle, true);
  assert.equal((parseAttachmentStorageConfig("test", { ...fakeValues, ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: undefined }) as { forcePathStyle: boolean }).forcePathStyle, false);
  const invalid: Record<string, string>[] = [
    { ZHIXU_ATTACHMENT_S3_ENDPOINT: "https://user:synthetic-key-secret@example.invalid" },
    { ZHIXU_ATTACHMENT_S3_ENDPOINT: "https://example.invalid?credential=synthetic-key-secret" },
    { ZHIXU_ATTACHMENT_S3_ENDPOINT: "https://example.invalid#synthetic-key-secret" },
    { ZHIXU_ATTACHMENT_S3_ENDPOINT: "http://example.invalid" },
    { ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "maybe" }, { ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "" },
    { ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: "" },
    { ZHIXU_ATTACHMENT_S3_REGION: "region\nsecret" }, { ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: "value\nsecret" },
  ];
  for (const change of invalid) {
    const report = await preflightObjectStorage({ ...fakeValues, ...change });
    assert.equal(report.errorCode, "CONFIG_INVALID");
    assert.equal(report.probeKey, undefined);
    assert.ok(!JSON.stringify(report).includes(fakeValues.ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY));
  }
});

test("each preflight operation has a bounded timeout and safe error", async () => {
  let destroyed = false, aborted = false;
  const report = await preflightObjectStorage(fakeValues, { timeoutMs: 10, transport: {
    send: (_command, { abortSignal }) => new Promise((_resolve, reject) => abortSignal.addEventListener("abort", () => {
      aborted = true; reject(new Error("synthetic-key-secret authorization header"));
    }, { once: true })), destroy: () => { destroyed = true; },
  } });
  assert.equal(report.errorCode, "BUCKET_HEAD_FAILED");
  assert.ok(aborted && destroyed);
  assert.ok(!JSON.stringify(report).includes("synthetic-key-secret"));
});

test("official preflight operations use only isolated MinIO probes and clean up", { timeout: 180_000 }, async (t) => {
  const minio = await startDisposableMinio();
  const temp = await mkdtemp(join(tmpdir(), "q4cb-preflight-"));
  t.after(async () => { try { await minio.stop(); } finally { await rm(temp, { recursive: true, force: true }); } });
  const values = { ZHIXU_ATTACHMENT_STORAGE: "s3", ZHIXU_ATTACHMENT_S3_ENDPOINT: minio.endpoint,
    ZHIXU_ATTACHMENT_S3_REGION: minio.region, ZHIXU_ATTACHMENT_S3_BUCKET: minio.bucket,
    ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: minio.accessKeyId, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
    ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "true" };
  const config = parseAttachmentStorageConfig("test", values); assert.equal(config.kind, "s3");
  if (config.kind !== "s3") return;
  const sdk = () => new S3Client({ endpoint: minio.endpoint, region: minio.region, forcePathStyle: true,
    credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey }, maxAttempts: 2 });
  type Command = Parameters<ProbeTransport["send"]>[0];
  const run = async (intercept?: (command: Command, next: () => Promise<unknown>) => Promise<unknown>) => {
    const client = sdk();
    const calls: Command[] = [];
    const transport: ProbeTransport = { send: (command, options) => {
      calls.push(command);
      const next = () => sendProbeCommand(client, command, options);
      return intercept ? intercept(command, next) : next();
    }, destroy: () => client.destroy() };
    const report = await preflightObjectStorage(values, { environment: "test", transport, timeoutMs: 5000 });
    const keys = calls.flatMap((command) => "Key" in command.input ? [command.input.Key] : []);
    assert.ok(keys.every((key) => key === report.probeKey && /^zhixu-preflight\/[0-9a-f-]{36}\/probe$/u.test(key!)));
    assert.ok(calls.every((command) => ["HeadBucketCommand", "PutObjectCommand", "HeadObjectCommand", "GetObjectCommand", "DeleteObjectCommand"].includes(command.constructor.name)));
    const json = JSON.stringify(report);
    assert.ok(!json.includes(minio.accessKeyId) && !json.includes(minio.secretAccessKey));
    assert.equal(Object.hasOwn(report, "runtimeConfigReviewed"), false);
    assert.equal(Object.hasOwn(report, "privateBucket"), false);
    return { report, calls };
  };
  await t.test("PUT/HEAD/GET hash, MIME, delete and absence sequence passes without LIST", async () => {
    const { report, calls } = await run();
    assert.equal(report.result, "PASS"); assert.equal(report.cleanupConfirmed, true);
    assert.equal(report.byteSize, PROBE_BYTES); assert.match(report.sha256!, /^[a-f0-9]{64}$/u);
    assert.ok(report.metadataSha256Match && report.downloadSha256Match && report.postDeleteAbsent);
    assert.deepEqual(calls.map((command) => command.constructor.name), ["HeadBucketCommand", "PutObjectCommand", "HeadObjectCommand",
      "GetObjectCommand", "DeleteObjectCommand", "HeadObjectCommand", "HeadBucketCommand"]);
    const put = calls.find((command) => command instanceof PutObjectCommand)!;
    assert.equal(put.input.ContentLength, PROBE_BYTES); assert.equal(put.input.ContentType, "application/octet-stream");
    assert.equal(put.input.Metadata?.sha256, report.sha256);
  });
  await t.test("wrong credentials/bucket/network fail before PUT", async () => {
    for (const change of [{ ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: "wrong-synthetic-secret" },
      { ZHIXU_ATTACHMENT_S3_BUCKET: "absent-synthetic-bucket" }, { ZHIXU_ATTACHMENT_S3_ENDPOINT: "http://127.0.0.1:1" }]) {
      const report = await preflightObjectStorage({ ...values, ...change }, { environment: "test", timeoutMs: 3000 });
      assert.equal(report.errorCode, "BUCKET_HEAD_FAILED"); assert.equal(report.putPass, false);
      assert.ok(!JSON.stringify(report).includes("wrong-synthetic-secret"));
    }
  });
  for (const [commandClass, code] of [[HeadObjectCommand, "HEAD_FAILED"], [GetObjectCommand, "GET_FAILED"]] as const) {
    await t.test(`PUT succeeds, ${code} triggers exact-key cleanup`, async () => {
      let failed = false;
      const { report } = await run(async (command, next) => {
        if (command instanceof commandClass && !failed) { failed = true; throw new Error("synthetic-key-secret raw SDK cause"); }
        return next();
      });
      assert.equal(report.result, "FAIL"); assert.equal(report.errorCode, code); assert.ok(report.putPass && report.cleanupConfirmed);
    });
  }
  await t.test("uncertain PUT response still cleans the possibly written exact key", async () => {
    const { report } = await run(async (command, next) => {
      const response = await next();
      if (command instanceof PutObjectCommand) throw new Error("response lost");
      return response;
    });
    assert.equal(report.errorCode, "PUT_FAILED"); assert.equal(report.cleanupConfirmed, true);
  });
  await t.test("HEAD metadata/MIME/size mismatch and GET corruption fail and clean", async () => {
    for (const patch of [{ Metadata: { sha256: "a".repeat(64) } }, { ContentLength: 1 }, { ContentType: "text/plain" }]) {
      const { report } = await run(async (command, next) => {
        const response = await next(); return command instanceof HeadObjectCommand ? { ...(response as object), ...patch } : response;
      });
      assert.equal(report.errorCode, "HEAD_FAILED"); assert.equal(report.cleanupConfirmed, true);
    }
    const { report } = await run(async (command, next) => {
      if (command instanceof GetObjectCommand) return { Body: Readable.from([Buffer.alloc(PROBE_BYTES)]) };
      return next();
    });
    assert.equal(report.errorCode, "GET_FAILED"); assert.equal(report.cleanupConfirmed, true);
  });
  await t.test("GET stream timeout is bounded and cleanup confirms absence", async () => {
    const { report } = await run(async (command, next) => {
      if (command instanceof GetObjectCommand) return { Body: new Readable({ read() {} }) };
      return next();
    });
    assert.equal(report.errorCode, "GET_FAILED"); assert.equal(report.cleanupConfirmed, true);
  });
  await t.test("DELETE denied reports FAIL_CLEANUP_REQUIRED with safe identity", async () => {
    const { report } = await run(async (command, next) => {
      if (command instanceof DeleteObjectCommand) throw new Error("synthetic-key-secret Delete denied");
      return next();
    });
    assert.equal(report.result, "FAIL_CLEANUP_REQUIRED"); assert.equal(report.cleanupConfirmed, false);
    assert.equal(report.bucket, minio.bucket); assert.ok(report.probeKey);
    // Isolated test fixture teardown can remove only this run's probe.
    const client = sdk();
    try { await client.send(new DeleteObjectCommand({ Bucket: minio.bucket, Key: report.probeKey })); } finally { client.destroy(); }
  });
  await t.test("post-delete HEAD failure cannot claim absence", async () => {
    let deleted = false;
    const { report } = await run(async (command, next) => {
      if (command instanceof DeleteObjectCommand) deleted = true;
      if (command instanceof HeadObjectCommand && deleted) throw { $metadata: { httpStatusCode: 403 } };
      return next();
    });
    assert.equal(report.result, "FAIL_CLEANUP_REQUIRED"); assert.equal(report.postDeleteAbsent, false);
  });
  await t.test("a missing-bucket 404 is not proof of object cleanup", async () => {
    let buckets = 0;
    const { report } = await run(async (command, next) => {
      if (command instanceof HeadBucketCommand && ++buckets > 1) throw { $metadata: { httpStatusCode: 404 } };
      return next();
    });
    assert.equal(report.result, "FAIL_CLEANUP_REQUIRED"); assert.equal(report.cleanupConfirmed, false);
  });
  await t.test("formal attachment key validator remains exclusive", async () => {
    const storage = new S3AttachmentStorage(config);
    await assert.rejects(storage.put("zhixu-preflight/00000000-0000-4000-8000-000000000000/probe", Buffer.alloc(1), "application/octet-stream"));
  });
  await t.test("CLI evidence is exclusive, sanitized, independent of DB and rejects caller keys", async () => {
    const evidencePath = join(temp, "new-directory", "evidence.json");
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, NODE_ENV: "test", ...values };
    const cli = async (args: string[]) => {
      try { return { code: 0, ...await exec(process.execPath, ["--import", "tsx", "scripts/preflight-object-storage.ts", ...args], { env, timeout: 30_000, windowsHide: true, encoding: "utf8" }) }; }
      catch (error) { const failure = error as { code?: number; stdout?: string; stderr?: string }; return { code: failure.code, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" }; }
    };
    const first = await cli(["--evidence", evidencePath]); assert.equal(first.code, 0, first.stderr);
    const raw = await readFile(evidencePath, "utf8");
    assert.equal(JSON.parse(raw).result, "PASS"); assert.equal(first.stdout, raw);
    assert.ok(!raw.includes(minio.secretAccessKey) && !raw.includes(minio.accessKeyId));
    const second = await cli(["--evidence", evidencePath]); assert.notEqual(second.code, 0);
    assert.equal(await readFile(evidencePath, "utf8"), raw);
    assert.match(second.stderr, /EVIDENCE_CREATE_FAILED/u);
    for (const args of [["--key", "attachments/existing/original"], ["--evidence", "relative.json"]]) {
      const invalid = await cli(args); assert.notEqual(invalid.code, 0); assert.match(invalid.stderr, /ARGUMENTS_INVALID/u);
    }
    assert.ok(![first.stdout, first.stderr, second.stdout, second.stderr].join("").includes(minio.secretAccessKey));
  });
  await t.test("preflight CLI shares file credential loader without changing evidence format", async () => {
    const idPath = join(temp, "secret-id"), keyPath = join(temp, "secret-key");
    await writeFile(idPath, minio.accessKeyId + "\n", { mode: 0o600 });
    await writeFile(keyPath, minio.secretAccessKey + "\r\n", { mode: 0o600 });
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test", ...values,
      ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: undefined, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: undefined,
      ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE: idPath, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE: keyPath };
    const result = await exec(process.execPath, ["--import", "tsx", "scripts/preflight-object-storage.ts"], { env, encoding: "utf8", windowsHide: true });
    const report = JSON.parse(result.stdout);
    assert.equal(report.contract, "zhixu-object-storage-preflight.v1"); assert.equal(report.result, "PASS");
    assert.equal(report.cleanupConfirmed, true); assert.ok(!result.stdout.includes(minio.secretAccessKey));
    assert.equal(Object.hasOwn(report, "credentialSources"), false);
  });
});
