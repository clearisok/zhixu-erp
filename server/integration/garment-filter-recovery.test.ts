import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { parseCollectorConfig } from "../ainuoke-source/collector.js";
import { hash, SourceError } from "../ainuoke-source/contract.js";
import { FROZEN_D1933_CANDIDATE, type GarmentFilterSelection } from "../ainuoke-source/garment-contract-verification.js";
import { GARMENT_RECOVERY_LIMITS, parseGarmentRecoveryArguments, runGarmentFilterRecovery } from "../ainuoke-source/garment-filter-recovery.js";
import { collectGarmentCandidate } from "../ainuoke-source/garment-shipment-probe.js";

const config = parseCollectorConfig({ sourceKey: "synthetic-recovery", baseUrl: "http://61.164.81.194:9043",
  transportPolicy: "user-approved-http-d109", username: "synthetic-user", password: "SYNTHETIC-PRIVATE-PASSWORD",
  operatorUsername: "readonly-no-db-authorization" });
const now = Date.parse("2026-10-22T00:00:03Z"), toolingCommit = "d".repeat(40), privateOutput = resolve("outputs/synthetic-recovery");
const digest = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function checkOwnedSyntheticProcess(taskPid: number, marker: string, terminate = false) {
  assert.ok(Number.isSafeInteger(taskPid) && taskPid > 0);
  const command = `& { param([int]$taskPid,[string]$taskMarker) $taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$taskPid); `
    + `if($taskProcess -and $taskProcess.CommandLine.Contains($taskMarker)){${terminate ? "Stop-Process -Id $taskPid -Force" : "exit 1"}} } `
    + taskPid + " '" + marker.replaceAll("'", "''") + "'";
  return execFileSync("pwsh", ["-NoProfile", "-Command", command], { stdio: "ignore" });
}
const row = { id: "9007199254740993", billno: "SYNTHETIC-SHIPMENT", ExpContractNo: "SYNTHETIC-C1", insideorderno: "D1933",
  CnColor: "合成颜色", Num: "12345678901234567890.123456789", outdate: "2026-10-11" };
function raw(rows: unknown[] = [row], patch: Record<string, unknown> = {}) {
  return JSON.stringify({ reObj: { isOk: true }, dataList: JSON.stringify({ rows, total: rows.length }), dataCount: rows.length,
    pageIndex: 0, pageSize: 0, reportObj: JSON.stringify({ reportId: 6086979, cellList: [] }), ...patch });
}
function candidate(text = raw(), patch: Record<string, unknown> = {}) {
  return { schemaVersion: "ainuoke-garment-shipment-candidate-page.v1", reportId: "6086979", queryContext: { insideOrderNo: "D1933" },
    page: 1, pageSize: 100, reportedTotal: 1, returnedRows: 1, httpAttempts: 2, reportRequests: 1,
    fetchedAt: new Date(now - 2000).toISOString(), rawReportResponse: text, rawResponseSha256: digest(text), ...patch };
}
function filterEvidence(selection: GarmentFilterSelection, texts = [raw(), raw([]), raw()], patch: Record<string, unknown> = {}) {
  return { schemaVersion: "ainuoke-garment-filter-evidence.v1", result: "complete", code: null, workerStage: "validation",
    selectionHash: hash(selection), httpAttempts: 4, reportRequests: 3, pages: texts.map((text, index) => ({ sequence: index + 1,
      alias: index === 1 ? "C0" : "C1", capturedAt: new Date(now - 2000 + index * 1000).toISOString(),
      rawReportResponse: text, rawResponseSha256: digest(text) })), ...patch };
}
function harness() {
  let elapsed = 0;
  const calls: Array<{ phase: string; timeoutMs: number; selection?: GarmentFilterSelection }> = [];
  const files = new Map<string, string>();
  const dependencies = {
    monotonicNow: () => elapsed, wallNow: () => now,
    collectCandidate: async (_config: typeof config, timeoutMs: number): Promise<unknown> => { calls.push({ phase: "candidate", timeoutMs }); return candidate(); },
    collectFilter: async (received: typeof config, selection: GarmentFilterSelection, timeoutMs: number): Promise<unknown> => {
      assert.deepEqual(received, config); calls.push({ phase: "filter", timeoutMs, selection }); return filterEvidence(selection);
    },
    write: (directory: string, report: unknown) => {
      assert.equal(directory, privateOutput);
      const text = JSON.stringify(report, null, 2) + "\n", path = resolve(directory, `synthetic-${files.size}.json`);
      files.set(path, text); return { privateReportPath: path, privateReportSha256: digest(text) };
    },
    read: ({ privateReportPath }: { privateReportPath: string; privateReportSha256: string }) => files.get(privateReportPath)!,
  };
  return { calls, files, dependencies, elapse: (ms: number) => { elapsed += ms; }, run: () => runGarmentFilterRecovery(config, privateOutput, toolingCommit, { dependencies }) };
}

test("fresh fixed recovery derives its new file identity then performs one C1/C0/C1 verification", async () => {
  const h = harness(), before = { ...FROZEN_D1933_CANDIDATE }, result = await h.run();
  assert.equal(result.result, "SCOPED_FILTER_OBSERVED"); assert.equal(result.stage, "complete");
  assert.equal(result.httpAttempts, 6); assert.equal(result.reportRequests, 4); assert.equal(result.requestCounts, "exact");
  assert.equal(result.knownHttpAttempts, 6); assert.equal(result.retainedFiles.length, 2);
  assert.deepEqual(h.calls.map(call => call.phase), ["candidate", "filter"]);
  assert.equal(h.calls[0].timeoutMs, 120000); assert.equal(h.calls[1].timeoutMs, GARMENT_RECOVERY_LIMITS.timeoutMs);
  const selection = h.calls[1].selection!;
  assert.equal(selection.candidateSha256, result.retainedFiles[0].privateReportSha256);
  assert.equal(selection.candidateSha256, digest(h.files.get(result.retainedFiles[0].privateReportPath)!));
  assert.notEqual(selection.candidateSha256, FROZEN_D1933_CANDIDATE.privateSha256);
  assert.equal(selection.toolingCommit, toolingCommit); assert.deepEqual(FROZEN_D1933_CANDIDATE, before);
  const saved = JSON.parse(h.files.get(result.retainedFiles[0].privateReportPath)!);
  assert.equal(saved.rawReportResponse, candidate().rawReportResponse);
  for (const text of [config.username, config.password, row.id, row.billno, row.ExpContractNo, row.CnColor, row.Num]) assert.ok(!JSON.stringify(result).includes(text));
  assert.equal(result.databaseAccess, "none"); assert.equal(result.sourceActivation, "not-activated");
  assert.equal(result.observation?.universalFilterSemanticsVerified, false);
});

test("empty, partial, ambiguous or unsafe candidate cannot start the contract phase", async () => {
  const cases = [candidate(raw([]), { reportedTotal: 0, returnedRows: 0 }),
    candidate(raw([row], { dataCount: 101, dataList: JSON.stringify({ rows: [row], total: 101 }) }), { reportedTotal: 101 }),
    candidate(raw([row, { ...row, id: "second", ExpContractNo: "SYNTHETIC-OTHER" }]), { reportedTotal: 2, returnedRows: 2 }),
    candidate(raw([row, row]), { reportedTotal: 2, returnedRows: 2 }),
    candidate(raw([{ ...row, remark: '{"token":"SYNTHETIC-SECRET"}' }]))];
  for (const value of cases) {
    const h = harness(); h.dependencies.collectCandidate = async () => value;
    const result = await h.run(); assert.equal(result.result, "FAIL"); assert.equal(h.calls.length, 0); assert.equal(h.files.size, 0);
    assert.equal(result.phases.filter.status, "not-started");
    assert.ok(!JSON.stringify(result).includes("SYNTHETIC-SECRET"));
  }
});

test("new writer and readback hash mismatch stop after the first two HTTP attempts", async () => {
  for (const mode of ["writer", "readback"]) {
    const h = harness();
    if (mode === "writer") h.dependencies.write = () => ({ privateReportPath: resolve(privateOutput, "synthetic.json"), privateReportSha256: "0".repeat(64) });
    else h.dependencies.read = () => "PRIVATE-MUST-NOT-REFLECT";
    const result = await h.run(); assert.equal(result.code, "garment_recovery_private_hash_mismatch");
    assert.equal(result.httpAttempts, 2); assert.equal(result.reportRequests, 1); assert.equal(result.phases.filter.status, "not-started");
    assert.deepEqual(h.calls.map(call => call.phase), ["candidate"]); assert.ok(!JSON.stringify(result).includes("PRIVATE-MUST-NOT-REFLECT"));
  }
});

test("one monotonic budget includes candidate work, private writes and readback", async () => {
  const h = harness(), write = h.dependencies.write, read = h.dependencies.read;
  h.dependencies.collectCandidate = async (_config, timeoutMs) => { h.calls.push({ phase: "candidate", timeoutMs }); h.elapse(60000); return candidate(); };
  h.dependencies.write = (directory, report) => { h.elapse(5000); return write(directory, report); };
  h.dependencies.read = receipt => { h.elapse(5000); return read(receipt); };
  const result = await h.run(); assert.equal(result.result, "SCOPED_FILTER_OBSERVED");
  assert.equal(h.calls[1].timeoutMs, 110000);
  const expired = harness(), original = expired.dependencies.write;
  expired.dependencies.write = (directory, report) => { expired.elapse(180000); return original(directory, report); };
  const stopped = await expired.run(); assert.equal(stopped.code, "garment_recovery_deadline");
  assert.equal(stopped.httpAttempts, 2); assert.equal(stopped.retainedFiles.length, 1); assert.equal(expired.calls.length, 1);
  const preflight = harness(); preflight.elapse(180000);
  const early = await runGarmentFilterRecovery(config, privateOutput, toolingCommit, { startedAt: 0, dependencies: preflight.dependencies });
  assert.equal(early.httpAttempts, 0); assert.equal(preflight.calls.length, 0);
});

test("a failed or unknown second phase retains the first receipt and never reports zero requests", async () => {
  const h = harness();
  h.dependencies.collectFilter = async (_config, selection, timeoutMs) => {
    h.calls.push({ phase: "filter", timeoutMs, selection });
    return filterEvidence(selection, [raw()], { result: "failed", code: "network_unavailable", workerStage: "report", httpAttempts: 3, reportRequests: 2 });
  };
  const partial = await h.run(); assert.equal(partial.result, "FAIL"); assert.equal(partial.code, "network_unavailable");
  assert.equal(partial.httpAttempts, 5); assert.equal(partial.reportRequests, 3); assert.equal(partial.retainedFiles.length, 2);
  const unknown = harness(); unknown.dependencies.collectFilter = async () => { throw new SourceError("garment_filter_timeout"); };
  const stopped = await unknown.run(); assert.equal(stopped.httpAttempts, null); assert.equal(stopped.reportRequests, null);
  assert.equal(stopped.knownHttpAttempts, 2); assert.equal(stopped.knownReportRequests, 1); assert.equal(stopped.requestCounts, "unknown-worker-result");
  assert.equal(stopped.retainedFiles.length, 1); assert.equal(stopped.phases.candidate.status, "exact");
  assert.equal(stopped.phases.filter.status, "unknown-worker-result");
});

test("at most three immutable progress frames expose only completed safe facts", async () => {
  const h = harness(), progress: Record<string, unknown>[] = [];
  const result = await runGarmentFilterRecovery(config, privateOutput, toolingCommit, { dependencies: h.dependencies,
    onProgress: receipt => { progress.push(structuredClone(receipt));
      (receipt.phases as { candidate: { httpAttempts: number } }).candidate.httpAttempts = 999; } });
  assert.equal(result.result, "SCOPED_FILTER_OBSERVED"); assert.equal(result.httpAttempts, 6);
  assert.deepEqual(progress.map(frame => frame.stage), ["candidate-selection", "filter-collection", "filter-write"]);
  assert.equal(progress[0].knownHttpAttempts, 2); assert.equal(progress[1].knownHttpAttempts, 2); assert.equal(progress[2].knownHttpAttempts, 6);
  assert.deepEqual(progress.map(frame => (frame.retainedFiles as unknown[]).length), [0, 1, 1]);
  for (const text of [config.username, config.password, row.ExpContractNo, row.Num]) assert.ok(!JSON.stringify(progress).includes(text));
});

test("only a validated first worker failure contributes exact failure counts", async () => {
  const frame = { schemaVersion: "ainuoke-garment-shipment-candidate-failure.v1", code: "auth_expired", workerStage: "report", httpAttempts: 2, reportRequests: 1 };
  const fakeWorker = ((_command: string, _args: readonly string[], options: Record<string, unknown>) => spawn(process.execPath, ["-e",
    `process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(${JSON.stringify(JSON.stringify(frame))});process.exitCode=1;});`],
  { ...options, cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] })) as typeof spawn;
  const known = harness(); known.dependencies.collectCandidate = (received, timeoutMs) => collectGarmentCandidate(received, { timeoutMs, spawnWorker: fakeWorker });
  const result = await known.run(); assert.equal(result.code, "auth_expired"); assert.equal(result.httpAttempts, 2); assert.equal(result.reportRequests, 1);
  const unknown = harness(); unknown.dependencies.collectCandidate = async () => { throw Object.assign(new SourceError("shipment_probe_timeout"), { detail: frame }); };
  const stopped = await unknown.run(); assert.equal(stopped.httpAttempts, null); assert.equal(stopped.knownHttpAttempts, 0);
  assert.equal(stopped.phases.filter.status, "not-started");
});

test("source changes, control rows and fabricated totals cannot produce a successful observation", async () => {
  for (const texts of [[raw(), raw(), raw()], [raw(), raw([]), raw([{ ...row, Num: "changed" }])]]) {
    const h = harness(); h.dependencies.collectFilter = async (_config, selection) => filterEvidence(selection, texts);
    const result = await h.run(); assert.equal(result.result, "FAIL"); assert.equal(result.httpAttempts, 6);
    assert.equal(result.retainedFiles.length, 2); assert.equal(h.files.size, 2);
  }
});

test("scope and dynamic exceptions are closed without changing the fixed query", async () => {
  const h = harness();
  const invalid = await runGarmentFilterRecovery({ ...config, baseUrl: "https://other.invalid" }, privateOutput, toolingCommit, { dependencies: h.dependencies });
  assert.equal(invalid.result, "FAIL"); assert.equal(invalid.httpAttempts, 0); assert.equal(h.calls.length, 0);
  h.dependencies.collectCandidate = async () => { throw new Error("PRIVATE-MUST-NOT-REFLECT"); };
  const stopped = await h.run(); assert.equal(stopped.code, "garment_recovery_failed"); assert.ok(!JSON.stringify(stopped).includes("PRIVATE-MUST-NOT-REFLECT"));
});

test("CLI only accepts the new explicit action and two absolute private paths", () => {
  const args = ["--recover-d1933-contract-filter", "--credential-file=" + resolve("outputs/synthetic-key.txt"), "--private-output=" + privateOutput];
  assert.equal(parseGarmentRecoveryArguments(args).privateOutput, privateOutput);
  for (const changed of [[], [...args, "--candidate-file=PRIVATE"], [...args, "--contract=PRIVATE"], [...args, "--hash=" + "0".repeat(64)],
    args.map(arg => arg.startsWith("--credential-file=") ? "--credential-file=relative" : arg),
    args.map(arg => arg === "--recover-d1933-contract-filter" ? "--verify-d1933-contract-filter" : arg)]) assert.throws(() => parseGarmentRecoveryArguments(changed));
  const result = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/garment-filter-recovery.ts", "--password=PRIVATE"], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 1); const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.stage, "arguments"); assert.equal(receipt.code, "garment_recovery_scope_required"); assert.equal(receipt.httpAttempts, 0);
  assert.ok(!result.stdout.includes("PRIVATE"));
});

test("owned synthetic reports use the existing private writer and protected hash readback", async () => {
  const directory = resolve("outputs", "isolated-private-" + randomUUID());
  try {
    if (process.platform === "win32") execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", "scripts/isolated-private-directory.ps1", "-Directory", directory, "-Create"], { stdio: "ignore" });
    else mkdirSync(directory, { recursive: true, mode: 0o700 });
    const result = await runGarmentFilterRecovery(config, directory, toolingCommit, { dependencies: {
      wallNow: () => now, collectCandidate: async () => candidate(), collectFilter: async (_config, selection) => filterEvidence(selection),
    } });
    assert.equal(result.result, "SCOPED_FILTER_OBSERVED"); assert.equal(result.retainedFiles.length, 2);
    for (const file of result.retainedFiles) {
      assert.equal(dirname(file.privateReportPath), directory);
      assert.equal(digest(readFileSync(file.privateReportPath, "utf8")), file.privateReportSha256);
      assert.match(file.privateReportPath, /ainuoke-garment-shipment-private-[0-9a-f-]{36}\.json$/u);
    }
  } finally {
    assert.equal(dirname(directory), resolve("outputs")); assert.match(directory, /isolated-private-[0-9a-f-]{36}$/u);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Windows launcher delegates private credentials only after clean runtime/output checks", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-garment-recovery-synthetic-"));
  try {
    const scripts = join(root, "scripts"), entry = join(root, "server/ainuoke-source");
    mkdirSync(scripts); mkdirSync(entry, { recursive: true });
    for (const file of ["ainuoke-garment-filter-recovery.ps1", "ainuoke-live-preflight.ps1", "payment-private-file-check.ps1", "isolated-private-directory.ps1"])
      copyFileSync(resolve("scripts", file), join(scripts, file));
    writeFileSync(join(entry, "garment-filter-recovery.ts"), "import {main} from " + JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/garment-filter-recovery.ts")).href) + "; await main();\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n'); writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", ".gitignore", "package.json", "scripts", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic baseline"], { stdio: "ignore" });
    const output = join(root, "outputs"); mkdirSync(output);
    const credential = join(output, "synthetic-key.txt"); writeFileSync(credential, "账号：合成测试\n密码： \n", "utf8");
    const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
    execFileSync("icacls", [credential, "/inheritance:r", "/grant:r", "*" + sid + ":F", "*S-1-5-18:F"], { stdio: "ignore" });
    const run = () => spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scripts, "ainuoke-garment-filter-recovery.ps1"),
      "-RecoverFilter", "-CredentialFile", credential], { cwd: tmpdir(), env: { ...process.env, DATABASE_URL: "postgresql://never-connect.invalid:1/no-business" }, encoding: "utf8", timeout: 60000 });
    const first = run(); assert.equal(first.status, 1);
    const firstReceipt = JSON.parse(first.stdout);
    assert.equal(firstReceipt.stage, "configuration"); assert.equal(firstReceipt.code, "invalid_collector_configuration");
    assert.equal(firstReceipt.httpAttempts, 0); assert.ok(!first.stdout.includes("合成测试"));
    execFileSync("icacls", [credential, "/grant", "*S-1-1-0:R"], { stdio: "ignore" });
    const broad = run(); assert.equal(broad.status, 1); assert.equal(JSON.parse(broad.stdout).code, "garment_recovery_credential_invalid");
    writeFileSync(join(root, "untracked.txt"), "synthetic dirty");
    const dirty = run(); assert.equal(dirty.status, 1); assert.equal(JSON.parse(dirty.stdout).code, "garment_recovery_clean_commit_required");
    assert.equal(JSON.parse(dirty.stdout).stage, "worktree");
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-garment-recovery-synthetic-[^\\/]+$/u);
    rmSync(root, { recursive: true, force: true });
  }
});

test("actual 180-second Windows outer timeout preserves the candidate and kills its synthetic worker tree", { skip: process.platform !== "win32", timeout: 225000 }, () => {
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-garment-timeout-synthetic-"));
  let marker: string | undefined, ownedPid: number | undefined;
  try {
    const scripts = join(root, "scripts"), entry = join(root, "server/ainuoke-source");
    mkdirSync(scripts); mkdirSync(entry, { recursive: true });
    for (const file of ["ainuoke-garment-filter-recovery.ps1", "ainuoke-live-preflight.ps1", "payment-private-file-check.ps1", "isolated-private-directory.ps1"])
      copyFileSync(resolve("scripts", file), join(scripts, file));
    const program = `import {spawn,execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';import {join} from 'node:path';
      import {runGarmentFilterRecovery,parseGarmentRecoveryArguments} from ${JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/garment-filter-recovery.ts")).href)};
      const {privateOutput}=parseGarmentRecoveryArguments(process.argv.slice(2));
      const result=await runGarmentFilterRecovery(${JSON.stringify(config)},privateOutput,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),{
        dependencies:{wallNow:()=>${now},collectCandidate:async()=>(${JSON.stringify(candidate())}),collectFilter:async()=>{
          const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)',privateOutput],{windowsHide:true,stdio:'ignore'});
          writeFileSync(join(privateOutput,'synthetic-child.json'),JSON.stringify({pid:child.pid,marker:privateOutput}));
          return await new Promise(()=>{});}},onProgress:receipt=>process.stdout.write(JSON.stringify(receipt)+'\\n')});
      process.stdout.write(JSON.stringify(result)+'\\n');`;
    writeFileSync(join(entry, "garment-filter-recovery.ts"), program);
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n'); writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", ".gitignore", "package.json", "scripts", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic timeout baseline"], { stdio: "ignore" });
    const invalid = spawnSync(process.execPath, ["--import", "tsx", join(entry, "garment-filter-recovery.ts"), "--invalid-synthetic-only"],
      { cwd: root, encoding: "utf8", timeout: 15000 });
    assert.equal(invalid.status, 1); assert.ok(invalid.stderr.includes("garment_recovery_scope_required"), "synthetic_launcher_fixture_invalid");
    const started = performance.now();
    const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scripts, "ainuoke-garment-filter-recovery.ps1"),
      "-RecoverFilter", "-CredentialFile", join(root, "never-read-synthetic-key.txt")], { cwd: tmpdir(), encoding: "utf8", timeout: 215000 });
    const elapsed = performance.now() - started;
    assert.equal(result.status, 1); const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.result, "FAIL"); assert.equal(receipt.code, "garment_recovery_deadline"); assert.equal(receipt.stage, "launcher-timeout");
    assert.equal(receipt.requestCounts, "unknown-worker-result"); assert.equal(receipt.httpAttempts, null); assert.equal(receipt.reportRequests, null);
    assert.equal(receipt.knownHttpAttempts, 2); assert.equal(receipt.knownReportRequests, 1);
    assert.equal(receipt.phases.candidate.status, "exact"); assert.equal(receipt.phases.filter.status, "unknown-worker-result");
    assert.equal(receipt.retainedFiles.length, 1); assert.equal(receipt.retainedFiles[0].role, "candidate");
    const file = receipt.retainedFiles[0]; assert.equal(digest(readFileSync(file.privateReportPath, "utf8")), file.privateReportSha256);
    const owned = JSON.parse(readFileSync(join(dirname(file.privateReportPath), "synthetic-child.json"), "utf8"));
    ownedPid = owned.pid; marker = owned.marker;
    checkOwnedSyntheticProcess(ownedPid!, marker!); assert.ok(elapsed >= 175000 && elapsed < 210000);
    for (const text of [config.username, config.password, row.ExpContractNo]) assert.ok(!result.stdout.includes(text));
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-garment-timeout-synthetic-[^\\/]+$/u);
    const outputRoot = join(root, "outputs");
    if (existsSync(outputRoot)) for (const child of readdirSync(outputRoot, { withFileTypes: true })) {
      if (!child.isDirectory() || !/^isolated-private-[0-9a-f-]{36}$/u.test(child.name)) continue;
      const directory = join(outputRoot, child.name), pidFile = join(directory, "synthetic-child.json");
      if (!existsSync(pidFile)) continue;
      const owned = JSON.parse(readFileSync(pidFile, "utf8"));
      if (owned.marker === directory) checkOwnedSyntheticProcess(owned.pid, directory, true);
    }
    rmSync(root, { recursive: true, force: true });
  }
});
