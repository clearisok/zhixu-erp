import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolvePrValidationBase } from '../resolve-pr-validation-base.mjs';

const sha = character => character.repeat(40);
const merge = sha('a'), base = sha('b'), head = sha('c'), stale = sha('d');
const context = { eventName: 'pull_request', prNumber: '120',
  mergeRef: 'refs/pull/120/merge', mergeSha: merge, headSha: head, eventBaseSha: stale };
function fixture(overrides = {}) {
  const calls = [];
  const readGit = args => {
    calls.push(args);
    if (args[0] === 'rev-parse') return merge;
    if (args[0] === 'rev-list') return `${merge} ${base} ${head}`;
    return 'commit';
  };
  return { calls, run: changes => resolvePrValidationBase({ ...context, readGit, ...overrides, ...changes }) };
}

test('uses the actual merge first parent even when the payload has an older base', () => {
  assert.deepEqual(fixture().run(), { baseSha: base, mergeSha: merge, headSha: head,
    prNumber: '120', eventBaseSha: stale, eventBaseDiffers: true });
  assert.equal(fixture().run({ eventBaseSha: base }).eventBaseDiffers, false);
});

for (const [name, changes, code] of [
  ['wrong event', { eventName: 'workflow_dispatch' }, 'PR_BASE_EVENT_CONTEXT'],
  ['missing PR number', { prNumber: undefined }, 'PR_BASE_EVENT_CONTEXT'],
  ['unsafe PR number', { prNumber: '9007199254740992' }, 'PR_BASE_EVENT_CONTEXT'],
  ['wrong PR ref', { mergeRef: 'refs/pull/121/merge' }, 'PR_BASE_EVENT_CONTEXT'],
  ['head branch ref', { mergeRef: 'refs/heads/main' }, 'PR_BASE_EVENT_CONTEXT'],
  ['missing checkout SHA', { mergeSha: undefined }, 'PR_BASE_SHA_FORMAT'],
  ['short head SHA', { headSha: 'c'.repeat(7) }, 'PR_BASE_SHA_FORMAT'],
  ['unsafe event base', { eventBaseSha: 'HEAD;echo secret' }, 'PR_BASE_SHA_FORMAT'],
]) test(`rejects ${name} before reading Git`, () => {
  const f = fixture();
  assert.throws(() => f.run(changes), { code });
  assert.equal(f.calls.length, 0);
});

test('rejects a checkout moved away from the workflow SHA', () => {
  assert.throws(() => fixture({ readGit: () => sha('e') }).run(), { code: 'PR_BASE_CHECKOUT_CHANGED' });
});

for (const [name, value] of [
  ['single parent', `${merge} ${head}`],
  ['three parents', `${merge} ${base} ${stale} ${head}`],
  ['wrong second parent', `${merge} ${base} ${stale}`],
  ['duplicate parents', `${merge} ${head} ${head}`],
  ['malformed parent', `${merge} missing ${head}`],
  ['wrong commit header', `${stale} ${base} ${head}`],
]) test(`rejects ${name} without falling back`, () => {
  const readGit = args => args[0] === 'rev-parse' ? merge : value;
  assert.throws(() => fixture({ readGit }).run(), { code: 'PR_BASE_MERGE_PARENTS' });
});

test('rejects a missing or non-commit parent object', () => {
  const readGit = args => args[0] === 'rev-parse' ? merge
    : args[0] === 'rev-list' ? `${merge} ${base} ${head}` : 'tree';
  assert.throws(() => fixture({ readGit }).run(), { code: 'PR_BASE_PARENT_OBJECT' });
});

test('a failed parent lookup stops without using the payload base', () => {
  const readGit = args => {
    if (args[0] === 'rev-parse') return merge;
    if (args[0] === 'rev-list') return `${merge} ${base} ${head}`;
    throw Object.assign(new Error('missing local parent object'), { code: 'PR_BASE_GIT_READ_FAILED' });
  };
  assert.throws(() => fixture({ readGit }).run(), { code: 'PR_BASE_GIT_READ_FAILED' });
});

test('real Git merge and CLI retain the actual base when payload base is stale', t => {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(path.join(parent, 'zhixu-pr-base-test-'));
  t.after(() => {
    const resolved = realpathSync(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('zhixu-pr-base-test-'));
    rmSync(resolved, { recursive: true, force: true });
  });
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', ...args],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15_000 });
    assert.equal(result.status, 0, `local Git ${args[0]} failed`);
    return result.stdout.trim();
  };
  const commit = (name, value) => { writeFileSync(path.join(root, name), value); git('add', name); git('commit', '-m', name); return git('rev-parse', 'HEAD'); };
  git('init', '-b', 'main');
  const old = commit('initial.txt', 'initial');
  git('branch', 'topic');
  const current = commit('base.txt', 'base advanced');
  git('switch', 'topic');
  const topic = commit('topic.txt', 'topic');
  git('switch', '-c', 'pr-merge', 'main');
  git('merge', '--no-ff', 'topic', '-m', 'synthetic pull request merge');
  const checkout = git('rev-parse', 'HEAD');
  const env = { ...process.env, WORKFLOW_EVENT_NAME: 'pull_request', PR_NUMBER: '120',
    CHECKOUT_REF: 'refs/pull/120/merge', CHECKOUT_SHA: checkout,
    PR_HEAD_SHA: topic, PR_EVENT_BASE_SHA: old };
  const script = fileURLToPath(new URL('../resolve-pr-validation-base.mjs', import.meta.url));
  const run = overrides => spawnSync(process.execPath, [script], {
    cwd: root, env: { ...env, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  const valid = run({});
  assert.equal(valid.status, 0);
  assert.equal(valid.stdout.trim(), current);
  assert.equal(JSON.parse(valid.stderr).eventBaseDiffers, true);
  const invalid = run({ PR_HEAD_SHA: old });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.equal(JSON.parse(invalid.stderr).code, 'PR_BASE_MERGE_PARENTS');
  const missing = run({ CHECKOUT_SHA: '' });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).code, 'PR_BASE_SHA_FORMAT');
  const before = git('rev-parse', 'HEAD');
  git('checkout', '--detach', topic);
  assert.notEqual(git('rev-parse', 'HEAD'), before);
  assert.equal(run({}).status, 1);
});
