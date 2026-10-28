import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildCutoverPreview } from '../../ops/quote-trial/cutover-preview.mjs';
import { validateExecutionPreview, assertFreshPreview, executeCutover, createExecutionAdapter, runExecutionCli } from '../../ops/quote-trial/cutover-execute.mjs';
import { readTrialConfig, validateTrial, validateComposeTarget } from '../../ops/quote-trial/trial.mjs';

const main = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, date = new Date('2026-10-28T08:00:00Z');
const ops = resolve('ops/quote-trial');
function preview() {
  const request = { project: 'zhixu-quote-trial-main-1234567890', root: join(tmpdir(), 'synthetic-cutover-new'), opsRoot: ops, sourceSha: main, imageId: image, buildId: 'synthetic-main', buildTime: '2026-10-28T00:00:00Z' };
  const labels = { 'org.opencontainers.image.revision': main, 'io.zhixu.build-id': request.buildId, 'org.opencontainers.image.created': request.buildTime, 'io.zhixu.identity-mode': 'session', 'io.zhixu.quote-authority': 'server', 'io.zhixu.master-settings-authority': 'server', 'io.zhixu.quote-writer-mode': 'writable' };
  const facts = { complete: true, newRoot: true, opsExact: true, image: { id: image, labels }, containers: [], volumes: [], networks: [], listeners: [], hostRoutes: ['0.0.0.0/0'], opsFiles: [{ path: 'trial.mjs', sha256: createHash('sha256').update(readFileSync(join(ops, 'trial.mjs'))).digest('hex') }], dockerContext: 'desktop-linux', dockerEndpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine' };
  return buildCutoverPreview(request, main, facts, date);
}
function harness(p = preview(), failAt) {
  const calls = [], journal = [];
  const invoke = stage => { calls.push(stage); if (stage === failAt) throw Error('private-diagnostic-never-returned'); };
  const adapter = { verifyOps: () => invoke('verify-ops'), verifyInputs: () => invoke('verify-inputs'), prepare: () => invoke('prepare-inputs'), journal: (_p, name, value) => { journal.push({ name, value }); invoke(name); }, assertPortFree: () => invoke('port'), run: stage => invoke(stage) };
  const options = { now: () => date, opsRoot: ops, observe: () => { invoke('observe'); return p; }, adapter };
  return { calls, journal, options };
}
const ack = p => `--execute=${p.previewSha256}`;

test('missing acknowledgement performs fresh read only, while exact acknowledgement reuses ordered trial lifecycle', () => {
  const p = preview(), h = harness(p);
  assert.equal(executeCutover(p, main, undefined, h.options).status, 'READY_FOR_EXECUTION_REVIEW');
  assert.deepEqual(h.calls, ['observe']);
  const result = executeCutover(p, main, ack(p), h.options);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.completedStages, ['prepare-inputs', 'check', 'prepare-local', 'init', 'objects-init', 'start']);
  assert.equal(result.cleanupPerformed, false); assert.equal(result.mutationsAttempted, true);
  assert.equal(h.calls.filter(x => x === 'port').length, 2);
  assert.equal(h.journal.length, 12); assert.equal(new Set(h.journal.map(row => row.name)).size, 12);
});

test('tampered, blocked, stale, future, wrong main/ack/ops stop before observation or writes', () => {
  const p = preview();
  for (const change of [q => q.target.port = 3001, q => q.status = 'READY', q => q.request.root = 'other']) {
    const q = structuredClone(p); change(q); const h = harness(q);
    assert.throws(() => executeCutover(q, main, ack(q), h.options)); assert.equal(h.calls.length, 0);
  }
  for (const when of [new Date(date.getTime() - 1), new Date(date.getTime() + 600000)]) assert.throws(() => validateExecutionPreview(p, main, ack(p), when), /expired_or_future/);
  assert.throws(() => validateExecutionPreview(p, 'c'.repeat(40), ack(p), date), /model_mismatch/);
  assert.throws(() => validateExecutionPreview(p, main, '--execute=yes', date), /acknowledgement/);
  const h = harness(p); assert.throws(() => executeCutover(p, main, ack(p), { ...h.options, opsRoot: join(ops, 'other') }), /frozen_ops/); assert.equal(h.calls.length, 0);
  const blocked = buildCutoverPreview(p.request, main, { ...p.observations, newRoot: false }, date);
  assert.throws(() => validateExecutionPreview(blocked, main, ack(blocked), date), /preview_blocked/);
});

test('changed daemon, target inventory or fresh blockers stop before mutation', () => {
  const p = preview();
  for (const patch of [{ listeners: [{ address: '::', port: 50426 }] }, { volumes: [{ name: 'foreign', project: null }] }, { dockerContext: 'another' }]) {
    const fresh = buildCutoverPreview(p.request, main, { ...p.observations, ...patch }, date);
    assert.throws(() => assertFreshPreview(p, fresh));
    const h = harness(p); h.options.observe = () => fresh;
    assert.throws(() => executeCutover(p, main, ack(p), h.options)); assert.equal(h.calls.length, 0);
  }
});

test('every stage failure preserves attempt receipt and stops without retry or cleanup', () => {
  const p = preview();
  for (const failAt of ['verify-ops', 'port', 'prepare-inputs', 'check', 'prepare-local', 'init', 'objects-init', 'start', 'cutover-3-complete.json']) {
    const h = harness(p, failAt); const result = executeCutover(p, main, ack(p), h.options);
    assert.equal(result.status, 'STOPPED_REQUIRES_REVIEW');
    assert.equal(result.cleanupPerformed, false); assert.equal(h.calls.filter(x => x === failAt).length, 1);
    assert.ok(!JSON.stringify(result).includes('private-diagnostic')); assert.ok(!h.calls.includes('cleanup'));
    if (failAt === 'init') assert.deepEqual(result.completedStages, ['prepare-inputs', 'check', 'prepare-local']);
  }
});

test('elapsed writer deadline stops subsequent stages and journal failures do not retry writes', () => {
  const p = preview(), h = harness(p); let count = 0;
  h.options.now = () => ++count <= 3 ? date : new Date(date.getTime() + 900001);
  const result = executeCutover(p, main, ack(p), h.options);
  assert.equal(result.status, 'STOPPED_REQUIRES_REVIEW'); assert.ok(!h.calls.includes('check'));
});

test('expiry before init stops after prepared secret volumes without submitting init again', () => {
  const p = preview(), h = harness(p); let elapsed = false;
  h.options.now = () => elapsed ? new Date(date.getTime() + 600000) : date;
  h.options.adapter.run = stage => { h.calls.push(stage); if (stage === 'prepare-local') elapsed = true; };
  const result = executeCutover(p, main, ack(p), h.options);
  assert.equal(result.status, 'STOPPED_REQUIRES_REVIEW'); assert.equal(result.stage, 'init');
  assert.deepEqual(result.completedStages, ['prepare-inputs', 'check', 'prepare-local']);
  assert.ok(!h.calls.includes('init')); assert.ok(!h.calls.includes('start'));
});

test('a start port probe consuming the remaining budget prevents submitting start', () => {
  const p = preview(), h = harness(p); let expired = false, probes = 0;
  h.options.now = () => expired ? new Date(date.getTime() + 900001) : date;
  h.options.adapter.assertPortFree = () => { if (++probes === 2) expired = true; };
  const result = executeCutover(p, main, ack(p), h.options);
  assert.equal(result.status, 'STOPPED_REQUIRES_REVIEW'); assert.equal(result.stage, 'start');
  assert.ok(!h.calls.includes('start'));
});

test('a competing destination created during preparation receives no journal or overwrite', () => {
  const parent = mkdtempSync(join(tmpdir(), 'zhixu-cutover-race-test-')), root = join(parent, 'competing');
  const original = preview(), p = buildCutoverPreview({ ...original.request, root }, main, original.observations, date);
  const h = harness(p), actualJournal = createExecutionAdapter(ops).journal;
  try {
    h.options.adapter.prepare = () => { mkdirSync(root); writeFileSync(join(root, 'sentinel.txt'), 'another owner'); throw Error('private_directory_create_failed_or_exists'); };
    h.options.adapter.journal = actualJournal;
    const result = executeCutover(p, main, ack(p), h.options);
    assert.equal(result.status, 'STOPPED_REQUIRES_REVIEW'); assert.deepEqual(result.completedStages, []);
    assert.deepEqual(readdirSync(root), ['sentinel.txt']); assert.equal(readFileSync(join(root, 'sentinel.txt'), 'utf8'), 'another owner');
    assert.equal(existsSync(join(root, 'cutover-stopped.json')), false);
  } finally { assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + sep)); rmSync(parent, { recursive: true }); }
});

test('adapter pins local daemon, keeps secrets off args/output, validates exact lifecycle receipt', () => {
  const p = preview(), calls = [], environment = { PATH: 'unchanged' };
  const execute = (file, args, options) => {
    calls.push({ file, args, options });
    if (args.includes('objects-init')) return '{"localObjectStorage":"READY","operation":"init"}\n';
    if (args.includes('start')) return JSON.stringify({ project: p.request.project, operation: 'start', result: 'READY', readiness: 'PASS' });
    if (args.includes('-Command') && options.input) return JSON.stringify({ contract: 'zhixu-persistent-local-target.v1', project: p.request.project, port: 50426, image, sourceSha: main, databaseContacted: false, systemTrustChanged: false });
    return file === 'docker' ? '' : '0';
  };
  const adapter = createExecutionAdapter(ops, environment, execute);
  adapter.verifyOps(p); adapter.assertPortFree(); adapter.run('objects-init', p); adapter.run('start', p, 5000);
  assert.equal(calls.at(-1).options.timeout, 5000);
  for (const call of calls) assert.equal(call.options.env.DOCKER_HOST, 'npipe:////./pipe/dockerDesktopLinuxEngine');
  assert.deepEqual(environment, { PATH: 'unchanged' });
  assert.ok(!calls.some(call => call.args.some(arg => /synthetic-cutover-new/.test(arg)) && call.file === 'pwsh'));
  for (const key of ['DOCKER_CONTEXT', 'DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) assert.throws(() => createExecutionAdapter(ops, { [key]: 'private' }), /override/);
  assert.throws(() => createExecutionAdapter(ops, {}, () => '{}').run('objects-init', p), /receipt_missing/);
  assert.throws(() => createExecutionAdapter(ops, {}, () => '{}').prepare(p), /receipt_mismatch/);
  assert.throws(() => createExecutionAdapter(ops, {}, () => JSON.stringify({ project: p.request.project, operation: 'start', result: 'READY' })).run('start', p), /receipt_mismatch/);
  assert.throws(() => adapter.run('restart', p), /unsupported/);
});

test('CLI denies extra args and non-Windows before any filesystem or Docker activity', () => {
  assert.throws(() => runExecutionCli([], { platform: 'linux' }), /windows/);
  assert.throws(() => runExecutionCli(['a','b','c','d','e'], { platform: 'win32' }), /usage/);
});

test('the generic target entry still rejects 50426 without creating its destination', { skip: process.platform !== 'win32' }, () => {
  const parent = mkdtempSync(join(tmpdir(), 'zhixu-cutover-deny-test-')), root = join(parent, 'never-created');
  try {
    assert.throws(() => execFileSync('pwsh', ['-NoProfile','-File',join(ops,'new-local-target.ps1'),'-Root',root,'-Project','zhixu-quote-trial-main-1234567890','-Port','50426','-Image',image,'-Commit',main,'-BuildId','synthetic','-BuildTime',date.toISOString(),'-Execute'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore','pipe','pipe'] }));
    assert.equal(existsSync(root), false);
  } finally { assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + sep)); rmSync(parent, { recursive: true }); }
});

test('shared private writer prepares synthetic 50426 inputs once, preserves ACL and exact composed model', { skip: process.platform !== 'win32' }, () => {
  const parent = mkdtempSync(join(tmpdir(), 'zhixu-cutover-writer-test-')), root = join(parent, 'private');
  const p = preview(); p.request.root = root;
  const adapter = createExecutionAdapter(ops);
  try {
    adapter.prepare(p); adapter.verifyInputs(p); adapter.journal(p, 'synthetic-receipt.json', { result: 'synthetic' });
    const path = join(root, 'trial.conf'), original = readFileSync(path, 'utf8'), values = readTrialConfig(path), safe = validateTrial(values);
    assert.equal(safe.port, 50426); assert.equal(safe.localObjects, true);
    const model = JSON.parse(execFileSync('docker', ['compose','--env-file',path,'-f',join(ops,'compose.yml'),'-f',join(ops,'local-objects.compose.yml'),'-f',values.TRIAL_COMPOSE_OVERRIDE,'-p',safe.project,'config','--format','json'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore','pipe','pipe'] }));
    validateComposeTarget(model, safe);
    assert.equal(model.networks.default.ipam.config[0].subnet, p.target.networks[0].subnet);
    assert.equal(model.networks.ingress.ipam.config[0].subnet, p.target.networks[1].subnet);
    writeFileSync(path, original.replace('TRIAL_PORT=50426', 'TRIAL_PORT=18444'));
    assert.throws(() => adapter.verifyInputs(p), /private_input_changed/);
    writeFileSync(path, original); adapter.verifyInputs(p);
    assert.throws(() => adapter.prepare(p)); assert.equal(readFileSync(path, 'utf8'), original);
    assert.throws(() => adapter.journal(p, 'synthetic-receipt.json', {}));
    assert.equal(existsSync(join(root, 'cutover-final.json')), false);
    // Reuse the real prepared adapter, simulate only the already-completed
    // prepare call, and replace its root before the next lifecycle stage.
    const operation = buildCutoverPreview(p.request, main, p.observations, date), h = harness(operation);
    h.options.adapter.prepare = () => {};
    h.options.adapter.journal = adapter.journal;
    h.options.adapter.verifyInputs = () => {
      renameSync(root, join(parent, 'original-owned')); mkdirSync(root);
      writeFileSync(join(root, 'sentinel.txt'), 'replacement owner');
      adapter.verifyInputs(operation);
    };
    const stopped = executeCutover(operation, main, ack(operation), h.options);
    assert.equal(stopped.status, 'STOPPED_REQUIRES_REVIEW'); assert.deepEqual(stopped.completedStages, ['prepare-inputs']);
    assert.ok(!h.calls.includes('check'));
    assert.throws(() => adapter.journal(p, 'cutover-stopped.json', {}), /owned_root_changed/);
    assert.deepEqual(readdirSync(root), ['sentinel.txt']);
    assert.equal(readFileSync(join(root, 'sentinel.txt'), 'utf8'), 'replacement owner');
  } finally {
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + sep)); rmSync(parent, { recursive: true });
  }
});
