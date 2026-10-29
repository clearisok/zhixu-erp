import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildCutoverPreview, collectCutoverFacts, runCutoverCli, validateCutoverRequest, createReadOnlyRunner } from '../../ops/quote-trial/cutover-preview.mjs';

const sourceSha = 'a'.repeat(40), imageId = `sha256:${'b'.repeat(64)}`;
const request = () => ({ project: 'zhixu-quote-trial-main-1234567890', root: join(tmpdir(), 'synthetic-new-target'), opsRoot: join(tmpdir(), 'synthetic-frozen-ops'), sourceSha, imageId, buildId: 'synthetic-build', buildTime: '2026-10-28T00:00:00.000Z' });
const labels = () => ({ 'org.opencontainers.image.revision': sourceSha, 'io.zhixu.build-id': 'synthetic-build', 'org.opencontainers.image.created': '2026-10-28T00:00:00.000Z', 'io.zhixu.identity-mode': 'session', 'io.zhixu.quote-authority': 'server', 'io.zhixu.master-settings-authority': 'server', 'io.zhixu.quote-writer-mode': 'writable' });
const facts = () => ({ complete: true, newRoot: true, opsExact: true, image: { id: imageId, labels: labels() }, containers: [], volumes: [], networks: [], listeners: [], hostRoutes: ['0.0.0.0/0', '10.253.240.0/28'], opsFiles: [{ path: 'trial.mjs', sha256: 'c'.repeat(64) }] });
const date = new Date('2026-10-28T01:00:00.000Z');
const preview = (f = facts(), r = request(), main = sourceSha) => buildCutoverPreview(r, main, f, date);

test('preview fixes HTTPS/loopback target and reuses exact five-service/four-volume policy without authorizing execution', () => {
  const result = preview();
  assert.equal(result.status, 'READY_FOR_REVIEW'); assert.equal(result.mode, 'PREVIEW_ONLY');
  assert.equal(result.executionAuthorized, false); assert.equal(result.runtimeWrites, 0);
  assert.equal(result.target.origin, 'https://localhost:50426'); assert.equal(result.target.binding, '127.0.0.1');
  assert.equal(result.target.services.length, 5); assert.equal(result.target.volumes.length, 4);
  assert.equal(result.target.networks[0].subnet, '10.253.240.16/28');
  assert.equal(result.target.networks[1].subnet, '10.253.240.32/28');
  assert.equal(result.expiresAt, '2026-10-28T01:10:00.000Z');
  const { previewSha256, ...plan } = result;
  assert.equal(previewSha256, createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
  assert.match(result.mainProof, /caller_supplied/);
  assert.ok(result.requiredBeforeExecution.includes('separate_guarded_execution_implementation'));
});

test('request cannot select another port, project, tag, short SHA, remote path, secrets or execute option', () => {
  for (const patch of [{ port: 3001 }, { execute: true }, { password: 'never-echo-me' }, { project: 'preparesystem' }, { imageId: 'mutable:latest' }, { sourceSha: 'short' }, { root: 'relative' }, { root: '//host/share/new' }, { buildId: 'line\nbreak' }, { buildTime: 'not-a-date' }]) assert.throws(() => validateCutoverRequest({ ...request(), ...patch }, sourceSha));
  assert.throws(() => validateCutoverRequest({ ...request(), root: request().opsRoot }, sourceSha), /separate_new_root/);
  assert.throws(() => validateCutoverRequest({ ...request(), opsRoot: join(request().root, 'ops') }, sourceSha), /separate_new_root/);
  assert.throws(() => validateCutoverRequest(request(), 'main'), /full_commit/);
});

test('current candidate image cannot masquerade as a different main or confirmed compiled identity', () => {
  const result = preview(facts(), request(), 'd'.repeat(40));
  assert.equal(result.status, 'BLOCKED'); assert.deepEqual(result.blockers, ['image_source_is_not_verified_main']);
  for (const key of Object.keys(labels())) { const f = facts(); f.image.labels[key] = 'different'; assert.ok(preview(f).blockers.includes('image_identity_mismatch')); }
  const f = facts(); f.image.id = `sha256:${'e'.repeat(64)}`; assert.ok(preview(f).blockers.includes('image_identity_mismatch'));
});

test('live IPv4/IPv6 listeners and running Docker publication block; stopped old owner remains explicit and preserved', () => {
  for (const address of ['127.0.0.1', '0.0.0.0', '::']) { const f = facts(); f.listeners = [{ address, port: 50426 }]; assert.ok(preview(f).blockers.includes('target_port_occupied')); }
  const f = facts(); f.containers = [{ name: 'old-gateway', project: 'old', running: true, ports: [{ hostPort: '50426' }] }];
  assert.ok(preview(f).blockers.includes('target_port_occupied'));
  f.containers[0].running = false;
  assert.equal(preview(f).status, 'READY_FOR_REVIEW'); assert.deepEqual(preview(f).protection.stoppedPortOwners, ['old-gateway']);
  assert.equal(preview(f).protection.stopOrDelete, false);
});

test('existing project, unattached volume or network names and labels cannot be adopted', () => {
  const project = request().project;
  for (const row of [{ name: 'different', project, running: false, ports: [] }, { name: `${project}-app-1`, project: null, running: false, ports: [] }]) { const f = facts(); f.containers = [row]; assert.ok(preview(f).blockers.includes('target_project_exists')); }
  for (const key of ['volumes', 'networks']) for (const row of [{ name: 'different', project, subnets: [] }, { name: `${project}_foreign`, project: null, subnets: [] }]) { const f = facts(); f[key] = [row]; assert.ok(preview(f).blockers.includes(key === 'volumes' ? 'target_volume_exists' : 'target_network_exists')); }
});

test('new root and exact ops are prerequisites; incomplete observations cannot produce a ready preview', () => {
  const f = facts(); f.newRoot = false; f.opsExact = false;
  assert.deepEqual(preview(f).blockers, ['target_directory_exists_or_indirect', 'immutable_ops_mismatch']);
  for (const patch of [{ complete: false }, { networks: null }, { opsFiles: [] }, { containers: [{ name: 'bad', ports: [] }] }, { listeners: [{ port: 3001, address: '::' }] }]) assert.throws(() => preview({ ...facts(), ...patch }));
});

test('network overlaps avoid host routes and stopped Docker networks, unknown ranges fail closed', () => {
  const f = facts(); f.networks = [{ name: 'retained-network', project: 'old', subnets: ['10.253.240.0/20', 'fd00::/64'] }];
  assert.equal(preview(f).target.networks[0].subnet, '172.31.240.0/28');
  f.hostRoutes = ['unknown']; assert.ok(preview(f).blockers.includes('network_ranges_unverified_or_unavailable'));
});

test('preview fingerprint changes with target, evidence or observation time', () => {
  const original = preview(); const f = facts(); f.volumes = [{ name: 'retained', project: null }];
  assert.notEqual(preview(f).previewSha256, original.previewSha256);
  assert.notEqual(preview(facts(), { ...request(), buildId: 'other' }).previewSha256, original.previewSha256);
  assert.notEqual(buildCutoverPreview(request(), sourceSha, facts(), new Date(date.getTime() + 1)).previewSha256, original.previewSha256);
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'zhixu-cutover-preview-test-'));
  const opsRoot = join(dir, 'frozen', 'ops'); mkdirSync(opsRoot, { recursive: true });
  const content = '/* synthetic immutable ops */\n'; writeFileSync(join(opsRoot, 'trial.mjs'), content);
  const req = { ...request(), root: join(dir, 'new-root'), opsRoot };
  const calls = [], containerId = '1'.repeat(64);
  const run = (file, args) => {
    calls.push([file, ...args]);
    if (file === 'git') {
      if (args.includes('ls-tree')) return 'ops/quote-trial/trial.mjs\n';
      if (args.includes('show')) return content;
    }
    if (file === 'docker') {
      if (args[0] === 'context' && args[1] === 'show') return 'desktop-linux';
      if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify('npipe:////./pipe/dockerDesktopLinuxEngine');
      assert.deepEqual(args.slice(0, 2), ['--host', 'npipe:////./pipe/dockerDesktopLinuxEngine']); args = args.slice(2);
      if (args[0] === 'info') return JSON.stringify({ id: 'synthetic-local-daemon', osType: 'linux', operatingSystem: 'Docker Desktop', name: 'docker-desktop' });
      if (args[0] === 'ps') return containerId + '\n';
      if (args[0] === 'inspect') return JSON.stringify({ name: '/retained', running: false, project: 'retained', ports: null }) + '\n';
      if (args[1] === 'ls') return '';
      if (args[0] === 'image' && args[1] === 'inspect') return JSON.stringify({ id: imageId, labels: { ...labels(), unrelated: 'private-label-must-not-escape' } });
    }
    if (file === 'pwsh') return JSON.stringify({ listeners: [], routes: ['0.0.0.0/0'] });
    throw Error('unexpected command');
  };
  return { dir, req, calls, run, cleanup: () => rmSync(dir, { recursive: true, force: false }) };
}

test('collector performs only selected reads, matches frozen files, sanitizes image labels and writes nothing', () => {
  const x = fixture(); try {
    const before = readdirSync(x.dir);
    const result = collectCutoverFacts(x.req, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] }));
    assert.equal(result.opsExact, true); assert.equal(result.newRoot, true); assert.equal(result.containers.length, 1);
    assert.ok(!JSON.stringify(result).includes('private-label'));
    assert.deepEqual(readdirSync(x.dir), before);
    for (const call of x.calls.filter(row => row[0] === 'docker')) assert.ok(call[1] === 'context' || call[1] === '--host' && ['info', 'ps', 'inspect', 'volume', 'network', 'image'].includes(call[3]));
    assert.ok(!x.calls.some(row => row.some(arg => ['run', 'create', 'start', 'stop', 'rm', 'prune', 'exec', '.Config.Env'].includes(arg))));
  } finally { x.cleanup(); }
});

test('collector detects stale ops, extra files and roots inside a checkout without changing them', () => {
  const x = fixture(); try {
    writeFileSync(join(x.req.opsRoot, 'trial.mjs'), 'changed');
    assert.equal(collectCutoverFacts(x.req, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })).opsExact, false);
    writeFileSync(join(x.req.opsRoot, 'extra.txt'), 'not reviewed');
    assert.equal(collectCutoverFacts(x.req, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })).opsExact, false);
    mkdirSync(x.req.root); assert.equal(collectCutoverFacts(x.req, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })).newRoot, false);
    writeFileSync(join(x.dir, '.git'), 'gitdir: synthetic');
    const result = collectCutoverFacts({ ...x.req, root: join(x.dir, 'another-new') }, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] }));
    assert.equal(result.newRoot, false); assert.equal(result.opsExact, false);
  } finally { x.cleanup(); }
});

test('collector rejects indirect ops or destination parent and partial command results', () => {
  const x = fixture(); try {
    const link = join(x.dir, 'linked'); symlinkSync(x.req.opsRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
    const result = collectCutoverFacts({ ...x.req, opsRoot: link }, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })); assert.equal(result.opsExact, false);
    const indirect = collectCutoverFacts({ ...x.req, root: join(link, 'new-root') }, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })); assert.equal(indirect.newRoot, false);
    assert.throws(() => collectCutoverFacts(x.req, x.dir, (file, args) => file === 'docker' && args[0] === '--host' && args[2] === 'inspect' ? '' : x.run(file, args), () => ({ listeners: [], routes: ['0.0.0.0/0'] })), /inventory_incomplete/);
    let time = 0; assert.throws(() => collectCutoverFacts(x.req, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] }), () => time += 120001), /deadline/);
  } finally { x.cleanup(); }
});

test('CLI is preview-only, validates before commands, and uses the fixed read-only host probe', () => {
  const x = fixture(); try {
    const file = join(x.dir, 'request.json'); writeFileSync(file, JSON.stringify(x.req));
    for (const args of [[file, sourceSha, x.dir, '--execute'], ['--execute', sourceSha, x.dir]]) assert.throws(() => runCutoverCli(args, { platform: 'win32', run: x.run }), /usage/);
    assert.equal(x.calls.length, 0);
    const result = runCutoverCli([file, sourceSha, x.dir], { platform: 'win32', run: x.run, now: () => date });
    assert.equal(result.status, 'READY_FOR_REVIEW'); assert.equal(result.runtimeWrites, 0);
    assert.equal(x.calls.filter(row => row[0] === 'pwsh').length, 1);
    assert.match(x.calls.find(row => row[0] === 'pwsh').at(-1), /Get-NetTCPConnection.*Get-NetRoute/s);
    assert.deepEqual(readdirSync(x.dir).sort(), ['frozen', 'request.json']);
  } finally { x.cleanup(); }
});

test('read failures stop without retries or propagating external diagnostics', () => {
  const x = fixture(); try {
    let calls = 0;
    assert.throws(() => collectCutoverFacts(x.req, x.dir, () => { calls += 1; throw Error('private-stderr-sentinel'); }, () => { throw Error('must not reach host'); }), error => error.message === 'docker_context_read_failed');
    assert.equal(calls, 1);
    const child = spawnSync(process.execPath, ['ops/quote-trial/cutover-preview.mjs', '--execute=private-sentinel'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    assert.equal(child.status, 1); assert.equal(child.stderr, '');
    assert.equal(JSON.parse(child.stdout).failureCode, 'usage_request_file_verified_main_repository');
    assert.ok(!child.stdout.includes('private-sentinel'));
  } finally { x.cleanup(); }
});

test('remote Docker contexts stop before any resource inventory', () => {
  const x = fixture(); try {
    const calls = [];
    assert.throws(() => collectCutoverFacts(x.req, x.dir, (file, args) => {
      calls.push([file, ...args]);
      if (args[0] === 'context' && args[1] === 'show') return 'desktop-linux';
      if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify('tcp://remote.invalid:2376');
      throw Error('must not inventory remote');
    }, () => { throw Error('must not read host'); }), /local_docker_pipe_required/);
    assert.equal(calls.length, 2);
  } finally { x.cleanup(); }
});

test('runner refuses Docker overrides and prevents Git lazy fetch without changing shared environment', () => {
  const environment = { PATH: 'retained', GIT_NO_LAZY_FETCH: '0', GIT_DIR: 'different-repo', GIT_WORK_TREE: 'other', GIT_TERMINAL_PROMPT: '1' };
  const before = { ...environment }, calls = [];
  const run = createReadOnlyRunner(environment, (file, argv, options) => { calls.push({ file, argv, options }); return 'synthetic'; });
  run('git', ['show', `${sourceSha}:ops/quote-trial/trial.mjs`]);
  assert.equal(calls[0].options.env.GIT_NO_LAZY_FETCH, '1'); assert.equal(calls[0].options.env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(calls[0].options.env.GIT_DIR, undefined); assert.equal(calls[0].options.env.GIT_WORK_TREE, undefined);
  assert.deepEqual(environment, before); assert.equal(calls[0].options.timeout, 10000);
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) {
    let executed = false;
    const denied = createReadOnlyRunner({ [key]: 'private-override' }, () => { executed = true; });
    assert.throws(() => denied('docker', ['context', 'show']), /docker_environment_override_not_supported/);
    assert.equal(executed, false);
  }
});

test('ops enumeration bounds empty directories and depth, not only file count', () => {
  const x = fixture(); try {
    for (let i = 0; i < 257; i++) mkdirSync(join(x.req.opsRoot, `empty-${i}`));
    assert.throws(() => collectCutoverFacts(x.req, x.dir, x.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })), /ops_entry_budget_exceeded/);
  } finally { x.cleanup(); }
  const y = fixture(); try {
    mkdirSync(join(y.req.opsRoot, ...Array.from({ length: 9 }, (_, i) => `depth-${i}`)), { recursive: true });
    assert.throws(() => collectCutoverFacts(y.req, y.dir, y.run, () => ({ listeners: [], routes: ['0.0.0.0/0'] })), /ops_depth_budget_exceeded/);
  } finally { y.cleanup(); }
});

test('another local pipe, context or daemon identity fails before resource inventory', () => {
  const x = fixture(); try {
    for (const change of ['context', 'pipe', 'daemon']) {
      let inventory = false;
      assert.throws(() => collectCutoverFacts(x.req, x.dir, (file, args) => {
        if (args[0] === 'context' && args[1] === 'show') return change === 'context' ? 'another-local' : 'desktop-linux';
        if (args[0] === 'context' && args[1] === 'inspect') return JSON.stringify(change === 'pipe' ? 'npipe:////./pipe/otherLinuxEngine' : 'npipe:////./pipe/dockerDesktopLinuxEngine');
        if (args[0] === '--host' && args[2] === 'info') return JSON.stringify({ id: 'synthetic-other', osType: 'linux', operatingSystem: 'Other Engine', name: 'other' });
        inventory = true; throw Error('must stop before ps');
      }, () => { throw Error('must not reach host'); }), /desktop_linux_context_required|local_docker_pipe_required|local_linux_daemon_required/);
      assert.equal(inventory, false);
    }
  } finally { x.cleanup(); }
});

test('Docker automatic bindings keep configuration separate and inspect actual assigned ports', () => {
  const x = fixture(); try {
    const read = (running, publishedPorts, ports = { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] }) => collectCutoverFacts(x.req, x.dir, (file, args) => {
      if (file === 'docker' && args[0] === '--host' && args[2] === 'inspect') return JSON.stringify({ name: '/retained-auto', running, project: 'retained', ports, publishedPorts });
      return x.run(file, args);
    }, () => ({ listeners: [], routes: ['0.0.0.0/0'] }));
    const stopped = read(false, null);
    assert.equal(buildCutoverPreview(x.req, sourceSha, stopped, date).status, 'READY_FOR_REVIEW');
    assert.equal(stopped.containers[0].automaticPortBindings.length, 1); assert.deepEqual(stopped.containers[0].ports, []);
    const active = read(true, { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '50426' }] });
    assert.ok(buildCutoverPreview(x.req, sourceSha, active, date).blockers.includes('target_port_occupied'));
    assert.throws(() => read(true, null), /running_port_assignment_unavailable/);
    assert.throws(() => read(true, { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '55555' }] }), /running_port_assignment_unavailable/);
    assert.throws(() => read(true, { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55555' }] }, { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }], '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }] }), /running_port_assignment_unavailable/);
    assert.throws(() => read(true, { '5432/tcp': [{ HostIp: '::1', HostPort: '55555' }] }), /running_port_assignment_unavailable/);
  } finally { x.cleanup(); }
});
