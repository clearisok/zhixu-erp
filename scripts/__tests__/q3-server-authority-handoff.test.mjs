import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sourceCommit = "cbe4d7f52d461f93eb4fce22c1550dbc5ed2330a";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const token = randomUUID().replaceAll("-", "").slice(0, 10);
const prefix = `q3b0-disposable-${token}`;
const database = `${prefix}-db`;
const writer = `${prefix}-writer`;
const frozen = `${prefix}-frozen`;
const candidate = `${prefix}-candidate`;
const network = `${prefix}-net`;
const buildTime = "2026-09-30T03:00:00Z";
const frozenBuildId = "q3b0-disposable-frozen";
const serverBuildId = "q3b0-disposable-server";
const password = `DisposableOnly-${randomUUID()}`;
const adminPassword = `DisposableAdmin-${randomUUID()}`;
const temp = mkdtempSync(join(tmpdir(), `${prefix}-`));
const sourceTree = join(temp, "source");
const evidenceDir = join(root, "backups", prefix);
const evidenceFile = join(evidenceDir, "import-evidence.json");
const handoffScript = join(root, "scripts", "Invoke-Q3ServerAuthorityHandoff.ps1");

function run(command, args, { cwd = root, timeout = 120_000, env = process.env } = {}) {
  return spawnSync(command, args, { cwd, timeout, env, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
function docker(args, options) {
  const result = run("docker", args, options);
  const safeError = (result.stderr ?? "").replaceAll(password, "[REDACTED]").replaceAll(adminPassword, "[REDACTED]").slice(-900);
  assert.equal(result.status, 0, `disposable Docker ${args[0]} failed (${result.status}): ${safeError}`);
  return result.stdout.trim();
}
function inspect(type, name) { return JSON.parse(docker(["inspect", "--type", type, name]))[0]; }
const sha = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function until(fn, label) {
  for (let i = 0; i < 100; i += 1) {
    try { if (await fn()) return; } catch { /* still starting */ }
    await sleep(250);
  }
  assert.fail(`${label} not ready`);
}
async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  assert.notEqual(port, 3001);
  assert.notEqual(port, 3002);
  return port;
}
function safeRemove(name) {
  const result = run("docker", ["inspect", "--type", "container", name]);
  if (result.status !== 0) return;
  const item = JSON.parse(result.stdout)[0];
  assert.equal(item.Name, `/${name}`);
  assert.ok(name.startsWith("q3b0-disposable-"));
  assert.equal(item.Mounts.length, 0);
  docker(["rm", "-f", name]);
}
async function chromeSessionProof(origin) {
  assert.ok(existsSync(chromePath), "real Chromium is required");
  const profile = join(temp, "chrome-profile");
  const browser = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  let ws;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    await until(() => existsSync(portFile), "Chrome DevTools");
    const [port, browserPath] = readFileSync(portFile, "utf8").trim().split(/\r?\n/u);
    ws = new WebSocket(`ws://127.0.0.1:${port}${browserPath}`);
    await new Promise((done, reject) => { ws.addEventListener("open", done, { once: true }); ws.addEventListener("error", reject, { once: true }); });
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("message", ({ data }) => {
      const reply = JSON.parse(String(data));
      if (!reply.id) return;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.error) entry.reject(new Error(`Chrome CDP ${reply.error.code}`));
      else entry.resolve(reply.result);
    });
    const command = (method, params = {}, sessionId) => new Promise((resolveCommand, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolveCommand, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const target = await command("Target.createTarget", { url: origin });
    const { sessionId } = await command("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await until(async () => {
      const result = await command("Runtime.evaluate", { expression: "location.origin", returnByValue: true }, sessionId);
      return result.result.value === origin;
    }, "Chrome same origin");
    const expression = `(async()=>{const login=await fetch("/api/v1/auth/login",{method:"POST",credentials:"include",headers:{"content-type":"application/json","x-zhixu-request":"1"},body:JSON.stringify({username:"admin",password:${JSON.stringify(adminPassword)}})});const cookie=login.headers.get("set-cookie");const me=await fetch("/api/v1/auth/me",{credentials:"include"});const permissions=await fetch("/api/v1/auth/permissions",{credentials:"include"});const brands=await fetch("/api/v1/quote-masters/brands",{credentials:"include"});return {login:login.status,me:me.status,permissions:permissions.status,brands:brands.status,user:(await me.json()).user?.username,permissionList:(await permissions.json()).permissions,brandBody:await brands.json(),setCookieVisible:cookie!==null};})()`;
    const evaluated = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(evaluated.exceptionDetails, undefined, "Chrome login execution failed");
    const result = evaluated.result.value;
    assert.equal(result.login, 200);
    assert.equal(result.me, 200);
    assert.equal(result.permissions, 200);
    assert.equal(result.brands, 200);
    assert.equal(result.user, "admin");
    assert.ok(result.permissionList.includes("settings.brand.edit"));
    assert.match(JSON.stringify(result.brandBody), /Synthetic Brand/u);
    const cookies = await command("Network.getCookies", { urls: [origin] }, sessionId);
    assert.ok(cookies.cookies.some((cookie) => cookie.secure && cookie.httpOnly), "Secure HttpOnly cookie accepted by Chromium");
    return "login/me/permissions/Q3 read PASS; Secure cookie accepted";
  } finally {
    ws?.close();
    browser.kill();
  }
}

test("Q3 B0 exact handoff and real-Chromium secure session use only isolated resources", { timeout: 1_200_000 }, async () => {
  const previousDbPassword = process.env.DB_PASSWORD;
  const previousPgPassword = process.env.POSTGRES_PASSWORD;
  const previousAdminPassword = process.env.ZHIXU_ADMIN_PASSWORD;
  const operationalCommit = docker ? run("git", ["rev-parse", "HEAD"]).stdout.trim() : "";
  assert.match(operationalCommit, /^[0-9a-f]{40}$/u);
  assert.equal(run("git", ["status", "--porcelain"]).stdout.trim(), "", "handoff source must be committed and clean");
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const frozenTag = `${prefix}-frozen:local`;
  const serverTag = `${prefix}-server:local`;
  let sourceWorktreeAdded = false;
  let networkCreated = false;
  let frozenImageId;
  let serverImageId;
  let phase = "setup";
  try {
    process.env.DB_PASSWORD = password;
    process.env.POSTGRES_PASSWORD = password;
    process.env.ZHIXU_ADMIN_PASSWORD = adminPassword;
    assert.equal(run("git", ["worktree", "add", "--detach", sourceTree, sourceCommit]).status, 0);
    sourceWorktreeAdded = true;
    for (const [authority, tag, buildId] of [["frozen", frozenTag, frozenBuildId], ["server", serverTag, serverBuildId]]) {
      phase = `build-${authority}`;
      docker(["build", "--progress", "quiet", "-f", "Dockerfile.server", "-t", tag,
        "--build-arg", `ZHIXU_BUILD_ID=${buildId}`, "--build-arg", `ZHIXU_GIT_COMMIT=${sourceCommit}`,
        "--build-arg", `ZHIXU_BUILD_TIME=${buildTime}`, "--build-arg", `NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY=${authority}`, "."],
      { cwd: sourceTree, timeout: 600_000 });
    }
    frozenImageId = inspect("image", frozenTag).Id;
    serverImageId = inspect("image", serverTag).Id;
    phase = "database";
    docker(["network", "create", "--label", `com.docker.compose.project=${prefix}`, network]);
    networkCreated = true;
    docker(["run", "-d", "--pull=never", "--name", database, "--network", network,
      "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "--label", `com.docker.compose.project=${prefix}`,
      "--label", "com.docker.compose.service=database", "-e", "POSTGRES_USER=synthetic",
      "-e", "POSTGRES_DB=synthetic", "-e", "POSTGRES_PASSWORD", "postgres:16-alpine"]);
    assert.equal(inspect("container", database).HostConfig.PortBindings?.["5432/tcp"], undefined);
    await until(() => run("docker", ["exec", database, "pg_isready", "-U", "synthetic", "-d", "synthetic"]).status === 0, "PG16");
    const dbEnv = ["-e", `DB_HOST=${database}`, "-e", "DB_PORT=5432", "-e", "DB_NAME=synthetic",
      "-e", "DB_USER=synthetic", "-e", "DB_PASSWORD"];
    docker(["run", "--rm", "--pull=never", "--network", network, ...dbEnv,
      "-e", `ZHIXU_ALLOWED_ORIGINS=${origin}`, "--entrypoint", "node",
      serverImageId, "dist/server/server/db/migrate.js"], { timeout: 180_000 });
    const seedSql = "INSERT INTO quote_master_brands(id,name,normalized_name) VALUES ('synthetic-brand','Synthetic Brand','synthetic brand'); INSERT INTO quote_global_settings(singleton_id,default_labor_currency,default_labor_description) VALUES (1,'CNY','Synthetic labor');";
    docker(["exec", database, "psql", "-X", "-w", "-v", "ON_ERROR_STOP=1", "-U", "synthetic", "-d", "synthetic", "-c", seedSql]);
    const hashProbe = 'import pg from "pg";import {migrationContentHash,readQuoteMasterSettingsMigrationContent} from "./dist/server/server/integration/quote-master-settings-migration-import.js";const p=new pg.Pool({host:process.env.DB_HOST,port:5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});try{const c=await p.connect();try{await c.query("BEGIN READ ONLY");process.stdout.write(migrationContentHash(await readQuoteMasterSettingsMigrationContent(c)));await c.query("COMMIT")}finally{c.release()}}finally{await p.end()}';
    const contentHash = docker(["run", "--rm", "--pull=never", "--network", network, "--read-only", ...dbEnv,
      "--entrypoint", "node", serverImageId, "--input-type=module", "-e", hashProbe]);
    assert.match(contentHash, /^[0-9a-f]{64}$/u);
    phase = "old-writer-bootstrap";
    docker(["run", "-d", "--pull=never", "--name", writer, "--network", network,
      "--label", `com.docker.compose.project=${prefix}`, "--label", "com.docker.compose.service=server",
      ...dbEnv, "-e", "ZHIXU_ADMIN_PASSWORD", "-e", `ZHIXU_ALLOWED_ORIGINS=${origin}`,
      "-e", "ZHIXU_SERVER_HOST=0.0.0.0", "-e", "ZHIXU_SERVER_PORT=3000", serverImageId]);
    await until(() => run("docker", ["exec", writer, "wget", "-qO-", "http://127.0.0.1:3000/api/v1/health"]).status === 0, "old writer/admin");
    docker(["stop", writer]);
    docker(["run", "-d", "--pull=never", "--name", frozen, "--network", "bridge",
      "--publish", `127.0.0.1:${port}:3000`, "--read-only", "--tmpfs", "/tmp:rw,size=16m",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--no-healthcheck",
      "--label", "io.zhixu.maintenance-static=true", "--entrypoint", "node", frozenImageId,
      "dist/server/server/maintenance-static.js"]);
    await until(async () => (await fetch(`${origin}/maintenance-health`)).ok, "frozen static");
    const frozenInfo = inspect("container", frozen);
    const writerInfo = inspect("container", writer);
    const fingerprint = sha([prefix, database, "tmpfs", "synthetic", "local_socket", "5432"].join("|"));
    const counts = { brands: 1, customerSalespeople: 0, fabrics: 0, trims: 0, manufacturingPresets: 0,
      brandDefaultTrims: 0, salespersonDefaultTrims: 0, globalSettings: 1, total: 2 };
    const importEvidence = { evidenceVersion: 1, executionType: "quote_master_settings_import", outcome: "COMMITTED",
      executionId: `${prefix}-import`, repoCommit: sourceCommit, reviewedCommit: sourceCommit,
      targetFingerprint: fingerprint, projectionContentHash: contentHash, readbackContentHash: contentHash,
      plannedCounts: counts, committedCounts: counts, readbackCounts: counts, failure: null };
    const { mkdirSync } = await import("node:fs");
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(evidenceFile, JSON.stringify(importEvidence), { flag: "wx" });
    const intent = ["-ExpectedOperationalCommit", operationalCommit, "-ExpectedProductSourceCommit", sourceCommit,
      "-ExpectedServerImageId", serverImageId, "-ExpectedServerBuildId", serverBuildId, "-ExpectedServerBuildTime", buildTime,
      "-ExpectedFrozenContainerName", frozen, "-ExpectedFrozenContainerId", frozenInfo.Id,
      "-ExpectedFrozenImageId", frozenImageId, "-ExpectedFrozenStartedAt", frozenInfo.State.StartedAt,
      "-ExpectedFrozenRestartCount", String(frozenInfo.RestartCount), "-ExpectedFrozenBuildId", frozenBuildId,
      "-ExpectedFrozenBuildTime", buildTime, "-ExpectedBrowserOrigin", origin, "-ExpectedHostPort", String(port),
      "-ExpectedContainerName", database, "-ExpectedComposeProject", prefix, "-ExpectedVolumeName", "tmpfs",
      "-ExpectedDatabaseName", "synthetic", "-ExpectedDatabaseNetworkName", network,
      "-ExpectedTargetFingerprint", fingerprint, "-ExpectedOldWriterName", writer,
      "-ExpectedOldWriterId", writerInfo.Id, "-ExpectedOldWriterImageId", writerInfo.Image,
      "-ImportEvidenceFile", evidenceFile, "-ExpectedImportEvidenceSha256", sha(readFileSync(evidenceFile)),
      "-ExpectedImportExecutionId", importEvidence.executionId, "-ExpectedProjectionContentHash", contentHash,
      "-ExpectedImportedRows", "2", "-ServerContainerName", candidate,
      "-HandoffEvidenceDirectory", join(evidenceDir, "handoff")];
    const invoke = (args, timeout = 90_000) => run("pwsh", ["-NoProfile", "-NonInteractive", "-File", handoffScript, ...args], { timeout });
    function rejectIntent(key, bad, pattern, expectedWriterRunning = false) {
      const copy = [...intent]; copy[copy.indexOf(key) + 1] = bad;
      const result = invoke([...copy, "-VerifyOnly"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, pattern);
      assert.equal(inspect("container", frozen).State.Running, true);
      assert.equal(inspect("container", writer).State.Running, expectedWriterRunning);
      assert.equal(run("docker", ["inspect", "--type", "container", candidate]).status, 1);
    }
    phase = "negative-preflight";
    rejectIntent("-ExpectedFrozenContainerId", "a".repeat(64), /split_frozen_container_identity_mismatch/u);
    rejectIntent("-ExpectedServerImageId", frozenImageId, /handoff_server_image_identity_mismatch/u);
    rejectIntent("-ExpectedServerBuildId", "wrong-build", /handoff_server_image_identity_mismatch/u);
    rejectIntent("-ExpectedTargetFingerprint", "b".repeat(64), /target_fingerprint_mismatch/u);
    docker(["start", writer]);
    rejectIntent("-ExpectedOldWriterId", writerInfo.Id, /application_writer_not_frozen/u, true);
    docker(["stop", writer]);
    const verify = invoke([...intent, "-VerifyOnly"]);
    assert.equal(verify.status, 0, verify.stderr.slice(-900));
    assert.match(verify.stdout, /verify_only_ready/u);
    assert.equal(existsSync(join(evidenceDir, "handoff", "handoff-evidence.json")), false);
    phase = "failure-recovery";
    const confirm = ["-Execute", "-ConfirmHandoff", "I_UNDERSTAND_Q3_SERVER_AUTHORITY_REPLACES_FROZEN_FRONTEND",
      "-OperatorLabel", "synthetic", "-AuthorizationRef", "synthetic-disposable-only"];
    const tooShort = invoke([...intent, ...confirm, "-HealthTimeoutSeconds", "1"], 90_000);
    assert.notEqual(tooShort.status, 0, "1-second startup must fail for rollback exercise");
    assert.equal(inspect("container", frozen).State.Running, true);
    assert.equal(inspect("container", writer).State.Running, false);
    assert.equal(run("docker", ["inspect", "--type", "container", candidate]).status, 1);
    await until(async () => (await fetch(`${origin}/maintenance-health`)).ok, "recovered frozen static");
    const restarted = inspect("container", frozen);
    intent[intent.indexOf("-ExpectedFrozenStartedAt") + 1] = restarted.State.StartedAt;
    intent[intent.indexOf("-ExpectedFrozenRestartCount") + 1] = String(restarted.RestartCount);
    phase = "success-handoff";
    const execute = invoke([...intent, ...confirm, "-HealthTimeoutSeconds", "60"], 120_000);
    assert.equal(execute.status, 0, execute.stderr.slice(-900));
    assert.match(execute.stdout, /authority=server old_writer_stopped=YES/u);
    assert.equal(inspect("container", frozen).State.Running, false);
    assert.equal(inspect("container", writer).State.Running, false);
    assert.equal(inspect("container", candidate).Image, serverImageId);
    assert.equal((await (await fetch(`${origin}/api/v1/health`)).json()).status, "ok");
    assert.equal((await (await fetch(`${origin}/build-info.json`)).json()).masterSettingsAuthority, "server");
    assert.equal((await fetch(`${origin}/basic-settings/brands`)).status, 200);
    phase = "chromium-session";
    assert.match(await chromeSessionProof(origin), /Secure cookie accepted/u);
    const handoffEvidence = JSON.parse(readFileSync(join(evidenceDir, "handoff", "handoff-evidence.json"), "utf8"));
    assert.equal(handoffEvidence.productSourceCommit, sourceCommit);
    assert.equal(handoffEvidence.importExecutionId, importEvidence.executionId);
    assert.equal(handoffEvidence.projectionContentHash, contentHash);
    assert.equal(handoffEvidence.oldWriterStopped, true);
  } catch (error) {
    throw new Error(`B0 disposable phase ${phase}: ${error.message}`, { cause: error });
  } finally {
    for (const name of [candidate, frozen, writer, database]) safeRemove(name);
    if (networkCreated) docker(["network", "rm", network]);
    if (sourceWorktreeAdded) assert.equal(run("git", ["worktree", "remove", "--force", sourceTree]).status, 0);
    if (existsSync(temp)) rmSync(temp, { recursive: true, force: true });
    if (existsSync(evidenceDir)) rmSync(evidenceDir, { recursive: true, force: true });
    if (previousDbPassword === undefined) delete process.env.DB_PASSWORD; else process.env.DB_PASSWORD = previousDbPassword;
    if (previousPgPassword === undefined) delete process.env.POSTGRES_PASSWORD; else process.env.POSTGRES_PASSWORD = previousPgPassword;
    if (previousAdminPassword === undefined) delete process.env.ZHIXU_ADMIN_PASSWORD; else process.env.ZHIXU_ADMIN_PASSWORD = previousAdminPassword;
  }
});
