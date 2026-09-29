import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const token = randomUUID().replaceAll("-", "").slice(0, 10);
const prefix = `q3c01-disposable-${token}`;
const network = `${prefix}-net`;
const database = `${prefix}-db`;
const writer = `${prefix}-writer`;
const staticName = `${prefix}-static`;
const splitWriter = `${prefix}-split-writer`;
const splitStatic = `${prefix}-split-static`;
const serverRuntime = `${prefix}-server-runtime`;
const frozenTag = `zhixu-q3-c01-frozen:${token}`;
const serverTag = `zhixu-q3-c01-server:${token}`;
const buildId = `${prefix}-build`;
const buildTime = "2026-09-29T06:00:00Z";
const freezeEvidenceDirectory = join(root, "backups", prefix);
const freezeEvidencePath = join(freezeEvidenceDirectory, "freeze.json");
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
  let oldFrontend;
  let guardTemp;
  let rollbackPath;
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
      "--label", `com.docker.compose.project=${prefix}`, "--label", "com.docker.compose.service=database",
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

    stage = "split-front-end";
    oldFrontend = createServer((_request, response) => { response.writeHead(200); response.end("synthetic old frontend"); });
    await new Promise((resolve) => oldFrontend.listen(0, "127.0.0.1", resolve));
    const splitPort = oldFrontend.address().port;
    const splitOrigin = `http://127.0.0.1:${splitPort}`;
    const frontendIntent = ["-ExpectedImageId", frozenId, "-ExpectedImageRevision", revision,
      "-ExpectedBuildId", buildId, "-ExpectedBuildTime", buildTime,
      "-ExpectedBrowserOrigin", splitOrigin, "-ExpectedStaticContainerName", splitStatic,
      "-ExpectedHostPort", String(splitPort)];
    const frontendScript = join(root, "scripts", "Invoke-Q3IndependentFrozenFrontend.ps1");
    const occupied = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", frontendScript, ...frontendIntent, "-VerifyOnly"]);
    assert.notEqual(occupied.status, 0);
    assert.match(occupied.stderr, /frontend_port_not_released/u);
    await new Promise((resolve) => oldFrontend.close(resolve));
    const frontendPlan = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", frontendScript, ...frontendIntent, "-VerifyOnly"]);
    assert.equal(frontendPlan.status, 0, frontendPlan.stderr?.slice(-900));
    const noFrontendConfirmation = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", frontendScript, ...frontendIntent, "-Execute"]);
    assert.notEqual(noFrontendConfirmation.status, 0);
    assert.match(noFrontendConfirmation.stderr, /independent_frontend_confirmation_required/u);
    const frontendStart = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", frontendScript, ...frontendIntent,
      "-Execute", "-ConfirmFrontendReplacement", "I_UNDERSTAND_Q3_FROZEN_FRONTEND_REPLACES_CURRENT_3001"], 120_000);
    assert.equal(frontendStart.status, 0, frontendStart.stderr?.slice(-900));
    const splitStaticBefore = inspect("container", splitStatic);
    assert.equal(splitStaticBefore.Image, frozenId);
    assert.equal((await (await fetch(`${splitOrigin}/build-info.json`)).json()).masterSettingsAuthority, "frozen");
    assert.equal((await fetch(`${splitOrigin}/system-settings/data-management`)).status, 200);
    assert.equal((await fetch(`${splitOrigin}/api/v1/health`)).status, 503);
    const freezeEvidence = run("node", ["--import", "tsx", join(root, "scripts", "verify-q3-frozen-build.ts"),
      "--origin", splitOrigin, "--namespace", "synthetic", "--schema-version", "13", "--commit", revision,
      "--build-id", buildId, "--build-time", buildTime, "--freeze-started-at", new Date().toISOString(),
      "--operator", "synthetic-operator", "--browser-profile", "synthetic-profile", "--evidence", freezeEvidencePath,
      "--split-static-container-name", splitStatic, "--split-static-container-id", splitStaticBefore.Id,
      "--split-static-image-id", frozenId, "--confirm-old-tabs-closed"]);
    assert.equal(freezeEvidence.status, 0, freezeEvidence.stderr?.slice(-900));
    assert.equal(JSON.parse(readFileSync(freezeEvidencePath, "utf8")).frozenFrontend.containerId, splitStaticBefore.Id);

    stage = "split-writer";
    docker(["run", "-d", "--pull=never", "--name", splitWriter, "--network", network,
      "--label", "io.zhixu.disposable-test=q3c01", "--label", `com.docker.compose.project=${prefix}`,
      "--label", "com.docker.compose.service=server", ...dbEnv,
      "-e", "ZHIXU_SERVER_HOST=0.0.0.0", "-e", "ZHIXU_SERVER_PORT=3000", frozenTag]);
    const splitWriterInfo = inspect("container", splitWriter);
    const fingerprint = createHash("sha256").update([prefix, database, "tmpfs", "synthetic", "local_socket", "5432"].join("|")).digest("hex");
    const freezeIntent = ["-ExpectedContainerName", database, "-ExpectedComposeProject", prefix,
      "-ExpectedVolumeName", "tmpfs", "-ExpectedDatabaseName", "synthetic", "-ExpectedTargetFingerprint", fingerprint,
      "-ExpectedWriterContainerName", splitWriter, "-ExpectedWriterContainerId", splitWriterInfo.Id,
      "-ExpectedWriterImageId", frozenId, "-ExpectedBrowserOrigin", splitOrigin,
      "-ExpectedHostPort", String(splitPort), "-ExpectedStaticContainerName", splitStatic,
      "-ExpectedStaticContainerId", splitStaticBefore.Id, "-ExpectedFrozenImageId", frozenId,
      "-ExpectedFrozenRevision", revision, "-ExpectedFrozenBuildId", buildId,
      "-ExpectedFrozenBuildTime", buildTime, "-FrozenEvidenceFile", freezeEvidencePath,
      "-ExpectedFrozenEvidenceSha256", createHash("sha256").update(readFileSync(freezeEvidencePath)).digest("hex")];
    const freezeScript = join(root, "scripts", "Invoke-Q3IndependentWriterFreeze.ps1");
    const wrongStatic = [...freezeIntent];
    wrongStatic[wrongStatic.indexOf("-ExpectedStaticContainerId") + 1] = "a".repeat(64);
    const wrongStaticResult = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", freezeScript, ...wrongStatic, "-VerifyOnly"]);
    assert.notEqual(wrongStaticResult.status, 0);
    assert.match(wrongStaticResult.stderr, /split_frozen_container_identity_mismatch/u);
    assert.equal(inspect("container", splitWriter).State.Running, true);
    const freezePlan = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", freezeScript, ...freezeIntent, "-VerifyOnly"]);
    assert.equal(freezePlan.status, 0, freezePlan.stderr?.slice(-900));
    const noFreezeConfirmation = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", freezeScript, ...freezeIntent, "-Execute"]);
    assert.notEqual(noFreezeConfirmation.status, 0);
    assert.match(noFreezeConfirmation.stderr, /independent_writer_confirmation_required/u);
    const writerStopped = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", freezeScript, ...freezeIntent,
      "-Execute", "-ConfirmWriterFreeze", "I_UNDERSTAND_Q3_INDEPENDENT_WRITER_STOP_KEEPS_FRONTEND_FROZEN"], 120_000);
    assert.equal(writerStopped.status, 0, writerStopped.stderr?.slice(-900));
    assert.equal(inspect("container", splitWriter).State.Running, false);
    assert.equal(inspect("container", splitStatic).Id, splitStaticBefore.Id);
    assert.equal(inspect("container", splitStatic).State.StartedAt, splitStaticBefore.State.StartedAt);
    assert.equal(inspect("container", splitStatic).RestartCount, splitStaticBefore.RestartCount);
    await until(async () => (await fetch(`${splitOrigin}/maintenance-health`)).ok, "split static after writer stop");
    assert.equal((await (await fetch(`${splitOrigin}/maintenance-health`)).json()).database, "not_connected");
    assert.equal((await fetch(`${splitOrigin}/api/v1/health`)).status, 503);

    stage = "guarded-preexecute-disposable";
    guardTemp = mkdtempSync(join(tmpdir(), `${prefix}-proof-`));
    assert.ok(resolve(guardTemp).startsWith(resolve(tmpdir()) + sep));
    const sourceFixturePath = join(guardTemp, "synthetic-browser-backup.json");
    const envelope = (data) => JSON.stringify({ schemaVersion: 13, initializedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), data });
    const sourceBackup = { product: "zhixu-erp", backupVersion: 1, schemaVersion: 13, createdAt: new Date().toISOString(),
      environment: "development", origin: splitOrigin, namespace: "synthetic", attachments: [], templates: [],
      localRecords: {
        "synthetic.basic-settings": envelope({ brands: [], customerSalespeople: [], fabricLibrary: [], trimLibrary: [],
          systemDefaults: { usdCnyRate: null, markupRate: null, laborCurrency: "CNY", defaultOtherCost: null } }),
        "synthetic.quote-global-settings": envelope({ defaultUsdCnyRate: null, defaultMarkupRate: null,
          defaultLaborCurrency: "CNY", defaultLaborDescription: "Synthetic labor", defaultOtherCost: null,
          defaultManufacturingPresetId: null, manufacturingPresets: [] }),
      } };
    writeFileSync(sourceFixturePath, JSON.stringify(sourceBackup), { flag: "wx" });
    const sourcePath = realpathSync.native(sourceFixturePath);
    const sourceInspection = run(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      "import { inspectQ3SourceFile } from './server/quote-masters/import-readiness.ts'; const result=await inspectQ3SourceFile(process.argv[1]); console.log(JSON.stringify(result.identity));", sourcePath]);
    assert.equal(sourceInspection.status, 0, sourceInspection.stderr?.slice(-900));
    const sourceIdentity = JSON.parse(sourceInspection.stdout.trim());
    assert.equal(sourceIdentity.blockers, 0);
    const ledger = readdirSync(join(root, "database", "migrations")).filter((name) => /^000[1-7]_.*\.sql$/u.test(name)).sort()
      .map((filename) => ({ version: String(Number(filename.slice(0, 4))), filename,
        checksum: createHash("sha256").update(readFileSync(join(root, "database", "migrations", filename))).digest("hex") }));
    assert.equal(ledger.length, 7);
    const proofPath = join(guardTemp, "synthetic-proof.json");
    const proof = { proofVersion: 1, result: "PASS", sourceFileSha256: sourceIdentity.fileSha256,
      sourceHash: sourceIdentity.sourceHash, projectionContentHash: sourceIdentity.projectionContentHash,
      projectedCounts: sourceIdentity.projectedCounts, reviewedCommit: revision, migrationLedger: ledger,
      postgresMajor: 16, rehearsedAt: new Date().toISOString(), importCounts: sourceIdentity.projectedCounts,
      readbackCounts: sourceIdentity.projectedCounts, readbackContentHash: sourceIdentity.projectionContentHash,
      rollbackValidated: true, postCommitUnverifiedValidated: true, secondImportRejected: true, disposableContainerRemoved: true };
    writeFileSync(proofPath, JSON.stringify(proof), { flag: "wx" });
    const backup = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, "Backup-Zhixu.ps1"),
      "-ExpectedContainerName", database, "-ExpectedComposeProject", prefix, "-ExpectedVolumeName", "tmpfs",
      "-ExpectedDatabaseName", "synthetic", "-ExpectedTargetFingerprint", fingerprint], 120_000);
    assert.equal(backup.status, 0, backup.stderr?.slice(-900));
    const backupName = /backup_verified filename=([^\s]+)/u.exec(backup.stdout)?.[1];
    assert.match(backupName ?? "", /^zhixu-.*\.dump$/u);
    rollbackPath = join(root, "backups", backupName);
    const manifestPath = `${rollbackPath}.manifest.json`;
    const originalManifest = readFileSync(manifestPath);
    const fileSha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
    const guardArgs = ["-ExpectedContainerName", database, "-ExpectedComposeProject", prefix,
      "-ExpectedVolumeName", "tmpfs", "-ExpectedDatabaseName", "synthetic", "-ExpectedTargetFingerprint", fingerprint,
      "-ExpectedImportSourceCommit", revision, "-ExpectedBrowserOrigin", splitOrigin,
      "-ExpectedBrowserNamespace", "synthetic", "-ExpectedBrowserEnvironment", "development",
      "-ExpectedBrowserSchemaVersion", "13", "-ExpectedFrozenBuildId", buildId, "-ExpectedFrontendTopology", "split",
      "-FreshBackupFile", sourcePath, "-ExpectedBackupFileSha256", sourceIdentity.fileSha256,
      "-ExpectedSourceHash", sourceIdentity.sourceHash, "-ExpectedProjectionContentHash", sourceIdentity.projectionContentHash,
      "-RehearsalProofFile", proofPath, "-ExpectedRehearsalProofSha256", fileSha(proofPath),
      "-FrozenEvidenceFile", freezeEvidencePath, "-ExpectedFrozenEvidenceSha256", fileSha(freezeEvidencePath),
      "-RollbackBackupFile", rollbackPath, "-ExpectedRollbackBackupSha256", fileSha(rollbackPath),
      "-RollbackBackupManifestFile", manifestPath, "-ExpectedRollbackBackupManifestSha256", fileSha(manifestPath)];
    const guardScript = join(root, "scripts", "Invoke-Q3GuardedMasterImport.ps1");
    const guard = (mode, args = guardArgs) => run("pwsh", ["-NoProfile", "-NonInteractive", "-File", guardScript, ...args,
      mode, ...(mode === "-Execute" ? ["-ConfirmImport", "I_UNDERSTAND_Q3_IMPORT_IS_IRREVERSIBLE",
        "-OperatorLabel", "synthetic-operator", "-AuthorizationRef", "synthetic-test"] : [])], 240_000);
    docker(["start", splitWriter]);
    const activeVerify = guard("-VerifyOnly");
    assert.notEqual(activeVerify.status, 0);
    assert.match(activeVerify.stderr, /application_writer_not_frozen/u);
    const activeExecute = guard("-Execute");
    assert.notEqual(activeExecute.status, 0);
    assert.match(activeExecute.stderr, /application_writer_not_frozen/u);
    docker(["stop", splitWriter]);
    const manifestDate = (date) => {
      const value = JSON.parse(originalManifest.toString("utf8"));
      value.createdAt = date.toISOString();
      writeFileSync(manifestPath, JSON.stringify(value));
      const args = [...guardArgs];
      args[args.indexOf("-ExpectedRollbackBackupManifestSha256") + 1] = fileSha(manifestPath);
      return args;
    };
    const freezeStartedAt = new Date(JSON.parse(readFileSync(freezeEvidencePath, "utf8")).freezeStartedAt);
    const preFreeze = guard("-VerifyOnly", manifestDate(new Date(freezeStartedAt.getTime() - 60_000)));
    assert.notEqual(preFreeze.status, 0);
    assert.match(preFreeze.stderr, /rollback_backup_predates_freeze/u);
    const future = guard("-VerifyOnly", manifestDate(new Date(Date.now() + 3_600_000)));
    assert.notEqual(future.status, 0);
    assert.match(future.stderr, /rollback_backup_predates_freeze/u);
    writeFileSync(manifestPath, originalManifest);
    const restoredCreatedAt = JSON.parse(readFileSync(manifestPath, "utf8")).createdAt;
    const backupTimes = statSync(rollbackPath);
    utimesSync(rollbackPath, new Date(freezeStartedAt.getTime() - 60_000), new Date(freezeStartedAt.getTime() - 60_000));
    const staleDump = guard("-VerifyOnly");
    assert.notEqual(staleDump.status, 0);
    assert.match(staleDump.stderr, /rollback_backup_predates_freeze/u);
    utimesSync(rollbackPath, backupTimes.atime, backupTimes.mtime);
    const postFreeze = guard("-VerifyOnly");
    assert.equal(postFreeze.status, 0, `freeze=${freezeStartedAt.toISOString()} manifest=${restoredCreatedAt} dump=${statSync(rollbackPath).mtime.toISOString()} ${postFreeze.stdout?.slice(-500)} ${postFreeze.stderr?.slice(-1200)}`);
    assert.match(postFreeze.stdout, /q3_import_verify_only_ready/u);

    stage = "build-server";
    docker(["build", "--progress", "quiet", "-f", "Dockerfile.server", "-t", serverTag,
      "--build-arg", `ZHIXU_BUILD_ID=${buildId}-server`, "--build-arg", `ZHIXU_GIT_COMMIT=${revision}`,
      "--build-arg", `ZHIXU_BUILD_TIME=${buildTime}`, "--build-arg", "NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY=server", "."], 480_000);
    const serverInfo = JSON.parse(docker(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "node", serverTag,
      "-e", "console.log(require('fs').readFileSync('/app/dist/client/build-info.json','utf8'))"]));
    assert.equal(serverInfo.masterSettingsAuthority, "server");
    assert.equal(inspect("image", serverTag).Config.Labels["io.zhixu.master-settings-authority"], "server");
    assert.match(compiledAuthorityEvidence(serverTag, "server"), /compiled_authority=server/u);
    stage = "split-server-authority-smoke";
    assert.equal(inspect("container", splitWriter).State.Running, false);
    docker(["stop", splitStatic]);
    docker(["run", "-d", "--pull=never", "--name", serverRuntime, "--network", network,
      "--publish", `127.0.0.1:${splitPort}:3000`, "--label", "io.zhixu.disposable-test=q3c01",
      ...dbEnv, "-e", "ZHIXU_SERVER_HOST=0.0.0.0", "-e", "ZHIXU_SERVER_PORT=3000", serverTag]);
    await until(async () => (await fetch(`${splitOrigin}/api/v1/health`)).ok, "split server authority");
    assert.equal((await (await fetch(`${splitOrigin}/build-info.json`)).json()).masterSettingsAuthority, "server");
    assert.equal(inspect("container", splitWriter).State.Running, false);
    const invalid = run("docker", ["build", "--progress", "quiet", "-f", "Dockerfile.server",
      "--build-arg", "NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY=invalid", "."], 120_000);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /invalid_master_settings_authority_build_input/u);
  } catch (error) {
    const staticLogs = run("docker", ["logs", staticName]);
    const splitLogs = run("docker", ["logs", splitStatic]);
    throw new Error(`stage=${stage}; ${error instanceof Error ? error.message : String(error)}; static_logs=${staticLogs.stdout.slice(-600)} ${staticLogs.stderr.slice(-600)}; split_logs=${splitLogs.stdout.slice(-600)} ${splitLogs.stderr.slice(-600)}`);
  } finally {
    if (existsSync(freezeEvidencePath)) unlinkSync(freezeEvidencePath);
    if (existsSync(freezeEvidenceDirectory)) rmdirSync(freezeEvidenceDirectory);
    if (rollbackPath && resolve(rollbackPath).startsWith(resolve(root, "backups") + sep)) {
      if (existsSync(rollbackPath)) unlinkSync(rollbackPath);
      if (existsSync(`${rollbackPath}.manifest.json`)) unlinkSync(`${rollbackPath}.manifest.json`);
    }
    if (guardTemp && resolve(guardTemp).startsWith(resolve(tmpdir()) + sep)) rmSync(guardTemp, { recursive: true, force: true });
    if (oldFrontend?.listening) await new Promise((resolve) => oldFrontend.close(resolve));
    safeCleanupContainer(serverRuntime);
    safeCleanupContainer(splitStatic, frozenId);
    safeCleanupContainer(splitWriter, frozenId);
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
