import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const token = randomUUID().replaceAll("-", "").slice(0, 10);
const prefix = `q3c01-disposable-${token}`;
const network = `${prefix}-net`;
const database = `${prefix}-db`;
const writer = `${prefix}-writer`;
const staticName = `${prefix}-static`;
const frozenTag = `zhixu-q3-c01-frozen:${token}`;
const serverTag = `zhixu-q3-c01-server:${token}`;
const buildId = `${prefix}-build`;
const buildTime = "2026-09-29T06:00:00Z";
const password = `DisposableOnly-${randomUUID()}`;

function run(command, args, timeout = 120_000) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
function docker(args, timeout) {
  const result = run("docker", args, timeout);
  assert.equal(result.status, 0, `disposable Docker step ${args[0]} failed: ${result.stderr?.slice(-900)}`);
  return result.stdout.trim();
}
function inspect(type, value) { return JSON.parse(docker(["inspect", "--type", type, value]))[0]; }
function compiledAuthorityEvidence(tag, authority) {
  const script = `const fs=require('fs'),path=require('path');let found=false;function scan(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())scan(p);else if(p.endsWith('.js')){const s=fs.readFileSync(p,'utf8');if(s.includes('Q3 master/settings Browser writes are disabled')&&(s.includes('masterSettingsAuthority:'+String.fromCharCode(96)+'${authority}'+String.fromCharCode(96))||s.includes('masterSettingsAuthority:"${authority}"')))found=true;}}}scan('/app/dist/client/assets');if(!found)process.exit(1);console.log('compiled_authority=${authority}')`;
  return docker(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "node", tag, "-e", script]);
}
async function until(callback, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if (await callback()) return; } catch { /* not ready yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail(`${label} did not become ready`);
}
function safeCleanupContainer(name, expectedImageId) {
  const result = run("docker", ["inspect", "--type", "container", name]);
  if (result.status !== 0) return;
  const item = JSON.parse(result.stdout)[0];
  assert.equal(item.Name, `/${name}`);
  assert.ok(name.startsWith("q3c01-disposable-"));
  assert.ok(item.Mounts.every((mount) => !/preparesystem_zhixu_data|zhixu-prod_zhixu_data/u.test(mount.Name ?? "")));
  if (expectedImageId) assert.equal(item.Image, expectedImageId);
  else assert.equal(item.Config.Labels["io.zhixu.disposable-test"], "q3c01");
  docker(["rm", "-fv", name]);
}

test("same frozen image hands off from disposable writer to isolated static at the same origin", { timeout: 900_000 }, async () => {
  const revision = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  assert.match(revision, /^[0-9a-f]{40}$/u);
  let frozenId;
  let stage = "build-frozen";
  try {
    docker(["build", "--progress", "quiet", "-f", "Dockerfile.server", "-t", frozenTag,
      "--build-arg", `ZHIXU_BUILD_ID=${buildId}`, "--build-arg", `ZHIXU_GIT_COMMIT=${revision}`,
      "--build-arg", `ZHIXU_BUILD_TIME=${buildTime}`, "--build-arg", "NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY=frozen", "."], 480_000);
    frozenId = inspect("image", frozenTag).Id;
    const frozenImage = inspect("image", frozenTag);
    assert.equal(frozenImage.Config.Labels["io.zhixu.master-settings-authority"], "frozen");
    const frozenInfo = JSON.parse(docker(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "node", frozenTag,
      "-e", "console.log(require('fs').readFileSync('/app/dist/client/build-info.json','utf8'))"]));
    assert.deepEqual({ gitCommit: frozenInfo.gitCommit, buildId: frozenInfo.buildId, buildTime: frozenInfo.buildTime,
      authority: frozenInfo.masterSettingsAuthority }, { gitCommit: revision, buildId, buildTime, authority: "frozen" });
    assert.match(compiledAuthorityEvidence(frozenTag, "frozen"), /compiled_authority=frozen/u);
    const staticWithDbEnv = run("docker", ["run", "--rm", "--pull=never", "--network", "none", "-e", "DB_HOST=synthetic",
      "--entrypoint", "node", frozenTag, "dist/server/server/maintenance-static.js"]);
    assert.notEqual(staticWithDbEnv.status, 0);
    assert.match(staticWithDbEnv.stderr, /maintenance_database_environment_forbidden/u);

    stage = "disposable-database";
    docker(["network", "create", network]);
    docker(["run", "-d", "--pull=never", "--name", database, "--network", network,
      "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "--label", "io.zhixu.disposable-test=q3c01",
      "-e", "POSTGRES_USER=synthetic", "-e", "POSTGRES_DB=synthetic", `-e`, `POSTGRES_PASSWORD=${password}`, "postgres:16-alpine"]);
    const pg = inspect("container", database);
    assert.deepEqual(pg.HostConfig.PortBindings, {});
    assert.equal(pg.Mounts.length, 0);
    await until(() => run("docker", ["exec", database, "pg_isready", "-U", "synthetic", "-d", "synthetic"]).status === 0, "disposable postgres");
    const dbEnv = ["-e", `DB_HOST=${database}`, "-e", "DB_PORT=5432", "-e", "DB_NAME=synthetic", "-e", "DB_USER=synthetic",
      "-e", `DB_PASSWORD=${password}`, "-e", "ZHIXU_ALLOWED_ORIGINS=http://127.0.0.1:3000"];
    docker(["run", "--rm", "--pull=never", "--network", network, ...dbEnv, "--entrypoint", "node", frozenTag,
      "dist/server/server/db/migrate.js"], 120_000);
    docker(["run", "-d", "--pull=never", "--name", writer, "--network", network, "--publish", "127.0.0.1::3000",
      "--label", "io.zhixu.disposable-test=q3c01", "--label", `com.docker.compose.project=${prefix}`,
      ...dbEnv, "-e", "ZHIXU_SERVER_HOST=0.0.0.0", "-e", "ZHIXU_SERVER_PORT=3000", frozenTag]);
    const writerInfo = inspect("container", writer);
    const port = Number(writerInfo.NetworkSettings.Ports["3000/tcp"][0].HostPort);
    assert.ok(Number.isInteger(port) && port > 0);
    const origin = `http://127.0.0.1:${port}`;
    try { await until(async () => (await fetch(`${origin}/api/v1/health`)).ok, "disposable writer"); }
    catch {
      const logs = run("docker", ["logs", writer]);
      throw new Error(`disposable writer not ready: ${logs.stdout.slice(-900)} ${logs.stderr.slice(-900)}`);
    }
    assert.equal((await (await fetch(`${origin}/build-info.json`)).json()).masterSettingsAuthority, "frozen");
    const intent = ["-ExpectedWriterContainerName", writer, "-ExpectedWriterComposeProject", prefix,
      "-ExpectedImageId", frozenId, "-ExpectedImageRevision", revision, "-ExpectedBuildId", buildId,
      "-ExpectedBuildTime", buildTime, "-ExpectedBrowserOrigin", origin,
      "-ExpectedStaticContainerName", staticName, "-ExpectedHostPort", String(port)];
    const handoffScript = join(root, "scripts", "Invoke-Q3MaintenanceStaticHandoff.ps1");
    const wrongPort = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", handoffScript, ...intent.slice(0, -1), String(port + 1), "-VerifyOnly"]);
    assert.notEqual(wrongPort.status, 0);
    assert.match(wrongPort.stderr, /handoff_origin_port_mismatch/u);
    const wrongRevisionIntent = [...intent];
    wrongRevisionIntent[wrongRevisionIntent.indexOf("-ExpectedImageRevision") + 1] = "b".repeat(40);
    const wrongRevision = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", handoffScript, ...wrongRevisionIntent, "-VerifyOnly"]);
    assert.notEqual(wrongRevision.status, 0);
    assert.match(wrongRevision.stderr, /handoff_image_identity_mismatch/u);
    const noConfirmation = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", handoffScript, ...intent, "-Execute"]);
    assert.notEqual(noConfirmation.status, 0);
    assert.match(noConfirmation.stderr, /independent_handoff_confirmation_required/u);
    assert.equal(inspect("container", writer).State.Running, true);
    stage = "handoff-plan";
    const plan = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", handoffScript, ...intent, "-VerifyOnly"]);
    assert.equal(plan.status, 0, plan.stderr?.slice(-900));
    assert.match(plan.stdout, /writer_not_stopped=YES/u);
    stage = "handoff-execute";
    const handoff = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", handoffScript, ...intent,
      "-Execute", "-ConfirmHandoff", "I_UNDERSTAND_Q3_HANDOFF_STOPS_WRITER"], 120_000);
    assert.equal(handoff.status, 0, handoff.stderr?.slice(-900));
    assert.match(handoff.stdout, /same_image=YES same_origin=YES static_only=YES/u);
    assert.equal(inspect("container", writer).State.Running, false);
    const staticInfo = inspect("container", staticName);
    assert.equal(staticInfo.Image, frozenId);
    assert.equal(staticInfo.HostConfig.NetworkMode, "bridge");
    assert.deepEqual(staticInfo.Config.Healthcheck?.Test, ["NONE"]);
    assert.equal(staticInfo.Mounts.length, 0);
    assert.equal(staticInfo.Config.Labels["com.docker.compose.project"], undefined);
    assert.ok(staticInfo.Config.Env.every((entry) => !/^(?:DB_|DATABASE_URL=|POSTGRES_|PGPASSWORD=)/u.test(entry)));
    stage = "static-smoke";
    await until(async () => (await fetch(`${origin}/maintenance-health`)).ok, "maintenance static");
    assert.equal((await (await fetch(`${origin}/maintenance-health`)).json()).database, "not_connected");
    assert.equal((await fetch(`${origin}/api/v1/quote-masters/brands`, { method: "POST" })).status, 503);
    assert.deepEqual((await (await fetch(`${origin}/build-info.json`)).json()), frozenInfo);

    stage = "build-server";
    docker(["build", "--progress", "quiet", "-f", "Dockerfile.server", "-t", serverTag,
      "--build-arg", `ZHIXU_BUILD_ID=${buildId}-server`, "--build-arg", `ZHIXU_GIT_COMMIT=${revision}`,
      "--build-arg", `ZHIXU_BUILD_TIME=${buildTime}`, "--build-arg", "NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY=server", "."], 480_000);
    const serverInfo = JSON.parse(docker(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "node", serverTag,
      "-e", "console.log(require('fs').readFileSync('/app/dist/client/build-info.json','utf8'))"]));
    assert.equal(serverInfo.masterSettingsAuthority, "server");
    assert.equal(inspect("image", serverTag).Config.Labels["io.zhixu.master-settings-authority"], "server");
    assert.match(compiledAuthorityEvidence(serverTag, "server"), /compiled_authority=server/u);
    const invalid = run("docker", ["build", "--progress", "quiet", "-f", "Dockerfile.server",
      "--build-arg", "NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY=invalid", "."], 120_000);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /invalid_master_settings_authority_build_input/u);
  } catch (error) {
    const staticLogs = run("docker", ["logs", staticName]);
    throw new Error(`stage=${stage}; ${error instanceof Error ? error.message : String(error)}; static_logs=${staticLogs.stdout.slice(-600)} ${staticLogs.stderr.slice(-600)}`);
  } finally {
    safeCleanupContainer(staticName, frozenId);
    safeCleanupContainer(writer, frozenId);
    safeCleanupContainer(database);
    const networkState = run("docker", ["network", "inspect", network]);
    if (networkState.status === 0) {
      const item = JSON.parse(networkState.stdout)[0];
      assert.equal(item.Name, network);
      assert.ok(network.startsWith("q3c01-disposable-"));
      docker(["network", "rm", network]);
    }
    for (const tag of [frozenTag, serverTag]) {
      const imageState = run("docker", ["image", "inspect", tag]);
      if (imageState.status === 0) docker(["image", "rm", tag]);
    }
  }
});
