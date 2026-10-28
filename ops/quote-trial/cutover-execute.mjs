// Explicit orchestration of the existing trial lifecycle, never an upgrade,
// restore, cleanup or automatic retry. Run only from the reviewed frozen ops.
import { readFileSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildCutoverPreview, observeCutoverRequest } from './cutover-preview.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (value, code) => { if (!value) throw Error(code); };
const stages = ['check', 'prepare-local', 'init', 'objects-init', 'start'];
const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
const localPath = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);

export function validateExecutionPreview(preview, verifiedMain, acknowledgement, now = new Date()) {
  check(preview && preview.contract === 'zhixu-50426-cutover-preview.v1', 'preview_contract_required');
  const { previewSha256, ...body } = preview;
  check(/^[a-f0-9]{64}$/u.test(previewSha256) && sha256(JSON.stringify(body)) === previewSha256, 'preview_integrity_mismatch');
  check(acknowledgement === undefined || acknowledgement === `--execute=${previewSha256}`, 'exact_preview_acknowledgement_required');
  const observed = Date.parse(preview.observedAt), expires = Date.parse(preview.expiresAt);
  check(Number.isFinite(observed) && expires === observed + 600000 && now.getTime() >= observed && now.getTime() < expires, 'preview_expired_or_future');
  const rebuilt = buildCutoverPreview(preview.request, verifiedMain, preview.observations, new Date(observed));
  check(same(preview, rebuilt), 'preview_model_mismatch');
  check(preview.status === 'READY_FOR_REVIEW' && preview.blockers.length === 0, 'preview_blocked');
  check(preview.observations.dockerEndpoint === endpoint && preview.observations.dockerContext === 'desktop-linux', 'local_docker_observation_required');
  return preview;
}

export function assertFreshPreview(approved, fresh) {
  check(fresh.status === 'READY_FOR_REVIEW' && fresh.blockers.length === 0, 'fresh_preview_blocked');
  check(same(approved.request, fresh.request) && same(approved.target, fresh.target) && approved.verifiedMain === fresh.verifiedMain && approved.observationSha256 === fresh.observationSha256, 'preview_observation_changed');
}

// All external output remains private. Only parsed safe receipts are returned.
export function createExecutionAdapter(opsRoot, environment = process.env, execute = execFileSync) {
  check(!['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'].some(key => environment[key]), 'docker_environment_override_not_supported');
  const env = { ...environment, DOCKER_HOST: endpoint, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
  const command = (file, args, options = {}) => execute(file, args, { encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024, timeout: 300000, ...options, env });
  const privateInputs = "$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()|ConvertFrom-Json; . (Join-Path $p.request.opsRoot 'local-target-inputs.ps1'); New-LocalTargetInputs -Root $p.request.root -Project $p.request.project -Port 50426 -Image $p.request.imageId -Commit $p.request.sourceSha -BuildId $p.request.buildId -BuildTime $p.request.buildTime -OpsRoot $p.request.opsRoot -Subnets $p.subnets | ConvertTo-Json -Compress";
  let preparedFiles, ownedDirectory;
  const directoryIdentity = preview => {
    const root = preview.request.root, stat = lstatSync(root, { bigint: true });
    check(localPath(root, realpathSync(root)) && stat.isDirectory() && !stat.isSymbolicLink() && stat.ino > 0n, 'owned_root_changed');
    return [String(stat.dev), String(stat.ino), String(stat.birthtimeNs)];
  };
  const verifyDirectory = preview => check(ownedDirectory && same(ownedDirectory, directoryIdentity(preview)), 'owned_root_changed');
  const inputIdentity = preview => ['trial.conf', 'networks.compose.yml', 'prepared.json'].map(name => {
    const path = join(preview.request.root, name);
    check(localPath(path, realpathSync(path)) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'private_input_changed');
    return sha256(readFileSync(path)); // Memory only; never return credential-bearing config hashes.
  });
  return {
    verifyOps(preview) {
      check(localPath(opsRoot, realpathSync(opsRoot)) && !lstatSync(opsRoot).isSymbolicLink(), 'frozen_ops_changed');
      for (const file of preview.opsFiles) {
        check(/^[a-zA-Z0-9_./-]+$/u.test(file.path) && !file.path.includes('..'), 'invalid_ops_path');
        const path = join(opsRoot, file.path);
        check(localPath(path, realpathSync(path)) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() && sha256(readFileSync(path)) === file.sha256, 'frozen_ops_changed');
      }
    },
    prepare(preview) {
      const result = JSON.parse(command('pwsh', ['-NoProfile', '-NonInteractive', '-Command', privateInputs], { input: JSON.stringify({ request: preview.request, subnets: preview.target.networks.map(row => row.subnet) }), timeout: 30000 }));
      check(result.contract === 'zhixu-persistent-local-target.v1' && result.project === preview.request.project && result.port === 50426 && result.image === preview.request.imageId && result.sourceSha === preview.request.sourceSha && result.databaseContacted === false && result.systemTrustChanged === false, 'input_preparation_receipt_mismatch');
      ownedDirectory = directoryIdentity(preview);
      preparedFiles = inputIdentity(preview);
    },
    verifyInputs(preview) { verifyDirectory(preview); check(preparedFiles && same(preparedFiles, inputIdentity(preview)), 'private_input_changed'); },
    journal(preview, name, value) {
      const root = preview.request.root;
      verifyDirectory(preview);
      writeFileSync(join(root, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    },
    assertPortFree() {
      const script = "$ErrorActionPreference='Stop'; @(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 50426).Count";
      check(command('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 }).trim() === '0', 'target_port_became_occupied');
      check(command('docker', ['--host', endpoint, 'ps', '--filter', 'publish=50426', '-q'], { timeout: 10000 }).trim() === '', 'target_port_became_published');
    },
    run(stage, preview, timeout = 300000) {
      check(stages.includes(stage), 'unsupported_cutover_stage');
      const args = [join(opsRoot, 'trial.mjs'), stage, join(preview.request.root, 'trial.conf'), ...(stage === 'check' ? [] : [`--execute=${preview.request.project}`])];
      const output = command(process.execPath, args, { timeout });
      // init/objects-init emit other diagnostic lines: do not forward them.
      const rows = output.split(/\r?\n/u).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      const expected = { check: 'CHECK_ONLY', 'prepare-local': 'LOCAL_SECRETS_PREPARED', init: 'PASS', 'objects-init': 'PASS', start: 'READY' }[stage];
      if (stage === 'objects-init') {
        // local-object-control's own zero-exit validation is authoritative.
        check(rows.some(row => row.localObjectStorage === 'READY' && row.operation === 'init'), 'object_initialization_receipt_missing');
      } else check(rows.some(row => row.project === preview.request.project && (stage === 'check' ? row.operation === expected : row.operation === stage && row.result === expected && (stage !== 'start' || row.readiness === 'PASS'))), 'trial_stage_receipt_mismatch');
    },
  };
}

export function executeCutover(preview, verifiedMain, acknowledgement, { observe, adapter, opsRoot, now = () => new Date() }) {
  validateExecutionPreview(preview, verifiedMain, acknowledgement, now());
  check(localPath(opsRoot, preview.request.opsRoot), 'run_from_frozen_ops_required');
  const fresh = observe(preview.request, verifiedMain);
  assertFreshPreview(preview, fresh);
  validateExecutionPreview(preview, verifiedMain, acknowledgement, now());
  if (acknowledgement === undefined) return { status: 'READY_FOR_EXECUTION_REVIEW', previewSha256: preview.previewSha256, runtimeWrites: 0, executionAuthorized: false };
  const completed = []; let stage = 'prepare-inputs', attempted = false, ownedRootConfirmed = false;
  const receipt = status => ({ contract: 'zhixu-50426-cutover-execution.v1', status, previewSha256: preview.previewSha256, project: preview.request.project, root: preview.request.root, sourceSha: preview.request.sourceSha, completedStages: [...completed], stage, mutationsAttempted: attempted, cleanupPerformed: false });
  try {
    const started = now().getTime();
    adapter.verifyOps(preview);
    adapter.assertPortFree();
    validateExecutionPreview(preview, verifiedMain, acknowledgement, now());
    attempted = true; adapter.prepare(preview); ownedRootConfirmed = true; completed.push(stage);
    adapter.journal(preview, 'cutover-00-prepared.json', receipt('PREPARED'));
    for (const [index, next] of stages.entries()) {
      stage = next;
      check(now().getTime() - started < 900000, 'cutover_deadline');
      adapter.verifyOps(preview);
      adapter.verifyInputs(preview);
      // Refuse to begin initialization after approval evidence has expired.
      // Once init is submitted, continue only this bounded sequence or stop;
      // never retry initialization just because the original preview expires.
      if (['check', 'prepare-local', 'init'].includes(stage)) validateExecutionPreview(preview, verifiedMain, acknowledgement, now());
      adapter.journal(preview, `cutover-${index + 1}-attempt.json`, receipt('ATTEMPTING'));
      if (stage === 'start') adapter.assertPortFree();
      const remaining = 900000 - (now().getTime() - started);
      check(remaining > 0, 'cutover_deadline');
      adapter.run(stage, preview, Math.min(300000, remaining)); completed.push(stage);
      adapter.journal(preview, `cutover-${index + 1}-complete.json`, receipt('COMPLETED'));
    }
    stage = 'finished'; const result = receipt('READY');
    adapter.journal(preview, 'cutover-final.json', result); return result;
  } catch {
    // A child timeout can follow a committed mutation. Preserve all files and
    // Docker resources; do not infer failure/no-write or automatically retry.
    const result = receipt('STOPPED_REQUIRES_REVIEW');
    if (ownedRootConfirmed) try { adapter.journal(preview, 'cutover-stopped.json', result); } catch { /* Preserve any partial journal without retry. */ }
    return result;
  }
}

export function runExecutionCli(args, { platform = process.platform, opsRoot = dirname(fileURLToPath(import.meta.url)) } = {}) {
  check(platform === 'win32', 'windows_local_target_required');
  check(args.length === 3 || args.length === 4, 'usage_preview_verified_main_repository_optional_ack');
  const [file, verifiedMain, repository, acknowledgement] = args;
  check(isAbsolute(file) && isAbsolute(repository) && lstatSync(file).isFile() && lstatSync(file).size <= 4 * 1024 * 1024, 'bounded_absolute_preview_required');
  const preview = JSON.parse(readFileSync(file, 'utf8'));
  return executeCutover(preview, verifiedMain, acknowledgement, { opsRoot, observe: (request, main) => observeCutoverRequest(request, main, repository), adapter: createExecutionAdapter(opsRoot) });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runExecutionCli(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'STOPPED_REQUIRES_REVIEW' ? 2 : 0;
  } catch {
    console.log(JSON.stringify({ status: 'PREFLIGHT_REJECTED', mutationsAttempted: false, cleanupPerformed: false })); process.exitCode = 1;
  }
}
