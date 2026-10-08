import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { loadAttachmentStorageConfig, loadAttachmentStorageConfiguration } from "../attachments/storage-config-loader.js";
import { loadServerConfig } from "../config.js";

const exec = promisify(execFile);
const base = { ZHIXU_ATTACHMENT_STORAGE: "s3", ZHIXU_ATTACHMENT_S3_ENDPOINT: "https://cos.example.invalid",
  ZHIXU_ATTACHMENT_S3_REGION: "ap-hongkong", ZHIXU_ATTACHMENT_S3_BUCKET: "synthetic-bucket",
  ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: "false" };
const id = "synthetic-secret-id", secret = "synthetic-secret-key";
const cleanEnv: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR };
function safe(error: unknown) { assert.ok(!String(error).includes(secret) && !String(error).includes(id)); return true; }
async function command(file: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv) {
  try { return { code: 0, ...await exec(file, args, { env, encoding: "utf8", timeout: 60_000, windowsHide: true }) }; }
  catch (error) { const e = error as { code: number; stdout: string; stderr: string }; return { code: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" }; }
}

test("shared runtime loader preserves env-only and reads LF/CRLF files without env mutation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cos-files-"));
  try {
    const idFile = join(dir, "id"), keyFile = join(dir, "key");
    const env = { ...base, ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: id, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: secret };
    const expected = loadAttachmentStorageConfig("production", env);
    for (const newline of ["", "\n", "\r\n"]) {
      await writeFile(idFile, id + newline); await writeFile(keyFile, secret + newline);
      const values = { ...base, ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE: idFile, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE: keyFile };
      assert.deepEqual(loadAttachmentStorageConfig("production", values), expected);
      assert.deepEqual(loadServerConfig({ ...values, NODE_ENV: "test", DATABASE_URL: "postgresql://synthetic:test@127.0.0.1:1/test" }).attachmentStorage, expected);
      assert.deepEqual(loadAttachmentStorageConfiguration("production", values).sources,
        { ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: "file", ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: "file" });
      assert.equal(Object.hasOwn(values, "ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY"), false);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("conflicts (including empty env), missing/nonregular/relative/empty/oversized/invalid secrets reject safely", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cos-reject-"));
  try {
    const file = join(dir, "key"); await writeFile(file, secret);
    const values = { ...base, ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: id, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE: file };
    for (const raw of ["", secret]) assert.throws(() => loadAttachmentStorageConfig("production", { ...values, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: raw }), safe);
    for (const path of [join(dir, "missing"), dir, "relative-key", ""]) assert.throws(() => loadAttachmentStorageConfig("production", { ...values, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE: path }), safe);
    for (const content of ["", "\n", "secret\n\n", "secret\r", " secret", "secret ", "secret\0", "sëcret", "x".repeat(4097)]) {
      await writeFile(file, content); assert.throws(() => loadAttachmentStorageConfig("production", values), safe);
    }
    assert.throws(() => loadAttachmentStorageConfig("production", base), safe);
    assert.deepEqual(loadAttachmentStorageConfig("production", { ...values, ZHIXU_ATTACHMENT_STORAGE: "disabled",
      ZHIXU_ATTACHMENT_CONFIG_FILE: join(dir, "missing"), ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: secret }), { kind: "disabled" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("offline compiled CLI uses config file as data, safe output and no DB/network dependencies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cos-offline-"));
  try {
    const key = join(dir, "key"), idPath = join(dir, "id"), config = join(dir, "cos.env");
    await writeFile(key, secret); await writeFile(idPath, id);
    const text = Object.entries({ ...base, ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE: idPath, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE: key })
      .map(([field, value]) => `${field}=${value}`).join("\n");
    await writeFile(config, text);
    const run = (args: string[], env = cleanEnv) => command(process.execPath, ["dist/server/server/attachments/check-config-cli.js", ...args], env);
    const result = await run(["--config", config]); assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.result, "PASS");
    assert.equal(report.networkContacted, false); assert.equal(report.databaseContacted, false); assert.equal(report.runtimeDeployed, false);
    assert.equal(report.credentialsValidityVerified, false); assert.equal(report.permissionsVerified, false);
    assert.ok(!result.stdout.includes(secret) && !result.stdout.includes(id));
    const invalid = await run(["--secret-key", secret]); assert.notEqual(invalid.code, 0); assert.ok(!invalid.stderr.includes(secret));
    for (const bad of [text + "\nZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY=" + secret, text + "\n$(touch unexpected)", text + "\n" + text]) {
      await writeFile(config, bad); const failure = await run(["--config", config]); assert.notEqual(failure.code, 0);
      assert.ok(!failure.stderr.includes(secret));
    }
    const start = await command(process.execPath, ["dist/server/server/index.js"], { ...cleanEnv, NODE_ENV: "test",
      DATABASE_URL: "postgresql://synthetic:test@127.0.0.1:1/test", ...base,
      ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: id, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE: join(dir, "missing") });
    assert.notEqual(start.code, 0); assert.match(start.stderr, /server_config_failed/u);
    assert.ok(!start.stderr.includes("stack") && !start.stderr.includes(id));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Linux setup and readonly secret mounts: exact owner succeeds, wrong identity fails, cleanup", { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "cos-linux-"));
  const volume = `zhixu-cos-secret-it-${randomUUID()}`;
  const image = "docker.m.daocloud.io/library/node:22-alpine";
  let created = false;
  const docker = async (args: string[]) => { const r = await command("docker", args, process.env); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
  try {
    await mkdir(join(dir, "scripts")); await mkdir(join(dir, "dist", "server", "server", "attachments"), { recursive: true });
    await cp("scripts/setup-object-storage-credentials.mjs", join(dir, "scripts", "setup-object-storage-credentials.mjs"));
    for (const file of ["storage-config.js", "storage-config-loader.js", "check-config-cli.js"])
      await cp(join("dist", "server", "server", "attachments", file), join(dir, "dist", "server", "server", "attachments", file));
    await writeFile(join(dir, "package.json"), '{"type":"module"}');
    await docker(["volume", "create", "--label", "io.zhixu.test=cos-credentials", volume]); created = true;
    const mounts = ["--mount", `type=bind,source=${dir},target=/tool,readonly`, "--mount", `type=volume,source=${volume},target=/fixture`];
    const initializer = `
      import assert from 'node:assert/strict'; import fs from 'node:fs';
      import { installCredentials } from '/tool/scripts/setup-object-storage-credentials.mjs';
      const options = {directory:'/fixture',uid:1001,gid:1001,endpoint:'https://cos.example.invalid',region:'ap-hongkong',bucket:'synthetic-bucket',forcePathStyle:'false'};
      fs.chownSync('/fixture',1001,1001); fs.chmodSync('/fixture',0o700);
      await assert.rejects(installCredentials(options,async ()=>'')); assert.equal(fs.existsSync('/fixture/cos.env'),false);
      let raceCount=0; await assert.rejects(installCredentials({...options,directory:'/fixture/race'},async ()=>{
        if(++raceCount===2)fs.writeFileSync('/fixture/race/secrets/cos/secret-key','preserve-racing-target'); return 'synthetic-key';
      }));
      assert.equal(fs.existsSync('/fixture/race/cos.env'),false);assert.equal(fs.existsSync('/fixture/race/secrets/cos/secret-id'),false);
      assert.equal(fs.readFileSync('/fixture/race/secrets/cos/secret-key','utf8'),'preserve-racing-target');
      fs.symlinkSync('/tmp','/fixture/secrets'); await assert.rejects(installCredentials(options,async ()=>'synthetic-key')); fs.unlinkSync('/fixture/secrets');
      let count=0; const result = await installCredentials(options,async ()=>++count===1?'synthetic-id':'synthetic-key'); assert.equal(result.result,'PASS');
      for(const name of ['/fixture/cos.env','/fixture/secrets/cos/secret-id','/fixture/secrets/cos/secret-key']) {const s=fs.statSync(name);assert.equal(s.uid,1001);assert.equal(s.gid,1001);assert.equal(s.mode&0o777,0o600);}
      let prompted=false; await assert.rejects(installCredentials(options,async ()=>{prompted=true;return 'no';}));assert.equal(prompted,false);
      assert.equal(fs.readFileSync('/fixture/secrets/cos/secret-key','utf8'),'synthetic-key\\n');
      assert.equal(fs.readdirSync('/fixture').some(n=>n.startsWith('.cos-setup-')),false);
      fs.symlinkSync('/fixture/secrets/cos/secret-key','/fixture/linked-key');
      const {loadAttachmentStorageConfig}=await import('/tool/dist/server/server/attachments/storage-config-loader.js');
      assert.throws(()=>loadAttachmentStorageConfig('production',{ZHIXU_ATTACHMENT_STORAGE:'s3',ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE:'/fixture/linked-key'}));
      fs.unlinkSync('/fixture/linked-key');
      console.log('SETUP_PASS');`;
    assert.equal(await docker(["run", "--rm", "--network", "none", ...mounts, image, "node", "--input-type=module", "-e", initializer]), "SETUP_PASS");
    const ro = ["run", "--rm", "--network", "none", "--read-only", "--user", "1001:1001", "--mount", `type=bind,source=${dir},target=/tool,readonly`,
      "--mount", `type=volume,source=${volume},target=/fixture,readonly`, image];
    const pass = await docker([...ro, "node", "/tool/dist/server/server/attachments/check-config-cli.js", "--config", "/fixture/cos.env"]);
    assert.equal(JSON.parse(pass).result, "PASS"); assert.equal(JSON.parse(pass).networkContacted, false);
    await docker([...ro, "node", "-e", "const a=require('node:assert/strict');a.throws(()=>require('node:fs').writeFileSync('/fixture/secrets/cos/secret-key','no'));console.log('READONLY_PASS')"]);
    const denied = await command("docker", [...ro.map((arg) => arg === "1001:1001" ? "1002:1002" : arg), "node", "/tool/dist/server/server/attachments/check-config-cli.js", "--config", "/fixture/cos.env"], process.env);
    assert.notEqual(denied.code, 0); assert.match(denied.stderr, /CONFIG_FILE_UNREADABLE/u); assert.ok(!denied.stderr.includes("synthetic-key"));
    // Normal-file and permissions checks also execute on Linux, not Windows ACL assumptions.
    const rejected = `const a=require('node:assert/strict'),f=require('node:fs');f.chmodSync('/fixture/secrets/cos/secret-key',0);`;
    await docker(["run", "--rm", "--network", "none", ...mounts, image, "node", "-e", rejected]);
    const unreadable = await command("docker", [...ro, "node", "/tool/dist/server/server/attachments/check-config-cli.js", "--config", "/fixture/cos.env"], process.env);
    assert.notEqual(unreadable.code, 0); assert.match(unreadable.stderr, /CONFIG_FILE_UNREADABLE/u);
    assert.equal(await docker(["volume", "inspect", volume, "--format", '{{ index .Labels "io.zhixu.test" }}']), "cos-credentials");
  } finally {
    if (created) await docker(["volume", "rm", volume]);
    await rm(dir, { recursive: true, force: true });
  }
});
