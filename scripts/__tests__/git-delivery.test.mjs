import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deliver, diagnose, trustedOrigin, runCommand, workingEvidence } from '../git-delivery.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zhixu-git-delivery-'));
  t.after(() => rm(root, { recursive: true, force: true })); // Only this test's mkdtemp directory.
  const git = async (args, cwd = root) => {
    const result = await runCommand('git', args, cwd);
    assert.equal(result.code, 0, 'isolated fixture Git command');
    return result.stdout.trim();
  };
  await git(['init', '--bare', path.join(root, 'remote.git')]);
  await git(['init', 'local']);
  const worktree = path.join(root, 'local');
  const local = args => git(args, worktree);
  await local(['config', 'user.email', 'synthetic@example.invalid']);
  await local(['config', 'user.name', 'Synthetic delivery test']);
  await local(['switch', '-c', 'chore/test-delivery']);
  await local(['remote', 'add', 'origin', path.join(root, 'remote.git')]);
  await writeFile(path.join(worktree, 'fixture.txt'), 'initial\n');
  await local(['add', 'fixture.txt']);
  await local(['commit', '-m', 'isolated baseline']);
  const expectedHead = await local(['rev-parse', 'HEAD']);
  const options = { worktree, branch: 'chore/test-delivery', expectedHead, execute: true };
  let pushes = 0;
  const run = async (command, args, cwd) => {
    if (command === 'gh') return { code: 1, stderr: 'test API unavailable', stdout: '' };
    if (command === 'git' && args[0] === 'push') pushes++;
    return runCommand(command, args, cwd);
  };
  const dependencies = { run, originCheck: url => url === path.join(root, 'remote.git') };
  return { root, worktree, local, options, dependencies, pushes: () => pushes };
}

test('dry run, normal push and repeated execution never duplicate delivery', async t => {
  const f = await fixture(t);
  assert.equal((await deliver({ ...f.options, execute: false }, f.dependencies)).state, 'READY_DRY_RUN');
  assert.equal(f.pushes(), 0);
  const result = await deliver(f.options, f.dependencies);
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.equal(result.remoteSha, f.options.expectedHead);
  assert.equal((await deliver(f.options, f.dependencies)).state, 'DELIVERED_VERIFIED');
  assert.equal(f.pushes(), 1);
});

for (const mode of ['delivered_response_lost', 'not_delivered', 'remote_unverifiable', 'authentication', 'zero_exit_unverifiable']) {
  test(`isolated push fault: ${mode}`, async t => {
    const f = await fixture(t);
    let pushed = false;
    const run = async (command, args, cwd) => {
      if (command === 'git' && args[0] === 'push') {
        pushed = true;
        if (mode === 'delivered_response_lost') await f.dependencies.run(command, args, cwd);
        return { code: mode === 'zero_exit_unverifiable' ? 0 : 1, stdout: '', stderr: mode === 'authentication' ? 'authentication failed SECRET' : 'schannel: missing close_notify SECRET', elapsedMs: 5 };
      }
      if (pushed && command === 'git' && args[0] === 'ls-remote' && ['remote_unverifiable', 'zero_exit_unverifiable'].includes(mode))
        return { code: 1, stderr: 'TLS EOF SECRET', stdout: '' };
      return f.dependencies.run(command, args, cwd);
    };
    const result = await deliver(f.options, { ...f.dependencies, run });
    assert.equal(result.pushes, 1);
    assert.equal(result.state, mode === 'delivered_response_lost' ? 'DELIVERED_VERIFIED' : mode === 'authentication' ? 'STOP_AUTH_OR_DIVERGENCE' : ['remote_unverifiable', 'zero_exit_unverifiable'].includes(mode) ? 'LOCAL_PASS_REMOTE_UNVERIFIED' : 'LOCAL_PASS_REMOTE_NOT_DELIVERED');
    assert.equal(result.retry, false);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
    if (mode !== 'delivered_response_lost') assert.ok(result.recovery.includes('-Execute'));
  });
}

test('remote divergence stops before push and preserves both commits', async t => {
  const f = await fixture(t);
  await f.local(['push', 'origin', 'HEAD']);
  await writeFile(path.join(f.worktree, 'fixture.txt'), 'remote advance\n');
  await f.local(['commit', '-am', 'remote advance']);
  await f.local(['push', 'origin', 'HEAD']);
  const remoteHead = await f.local(['rev-parse', 'HEAD']);
  const tree = await f.local(['rev-parse', `${f.options.expectedHead}^{tree}`]);
  const sibling = await f.local(['commit-tree', tree, '-p', f.options.expectedHead, '-m', 'isolated sibling']);
  await f.local(['update-ref', 'refs/heads/chore/test-delivery', sibling]); // Only isolated fixture ref.
  const dirty = await workingEvidence(f.worktree);
  const result = await deliver({ ...f.options, expectedHead: sibling, expectedDirtyFingerprint: dirty.dirtyFingerprint }, f.dependencies);
  assert.equal(result.state, 'STOP_AUTH_OR_DIVERGENCE');
  assert.equal(f.pushes(), 0);
  assert.ok((await f.local(['ls-remote', 'origin', 'refs/heads/chore/test-delivery'])).startsWith(remoteHead));
});

test('approved dirty protects staged, unstaged and untracked bytes; mismatch stops', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.worktree, 'fixture.txt'), 'staged content\n');
  await f.local(['add', 'fixture.txt']);
  await writeFile(path.join(f.worktree, 'fixture.txt'), 'unstaged content\n');
  await writeFile(path.join(f.worktree, 'untracked.txt'), 'synthetic secret bytes\n');
  const evidence = await workingEvidence(f.worktree);
  assert.equal((await deliver(f.options, f.dependencies)).state, 'STOP_UNKNOWN_WORKTREE');
  const result = await deliver({ ...f.options, expectedDirtyFingerprint: evidence.dirtyFingerprint }, f.dependencies);
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.deepEqual(await workingEvidence(f.worktree), evidence);
  assert.equal(await readFile(path.join(f.worktree, 'untracked.txt'), 'utf8'), 'synthetic secret bytes\n');
  assert.ok(!JSON.stringify(result).includes('synthetic secret'));
  await writeFile(path.join(f.worktree, 'untracked.txt'), 'changed');
  assert.equal((await deliver({ ...f.options, expectedDirtyFingerprint: evidence.dirtyFingerprint }, f.dependencies)).state, 'STOP_UNKNOWN_WORKTREE');
});

test('wrong branch/main/SHA/root/repository/push URL prevent all pushes', async t => {
  const f = await fixture(t);
  for (const change of [{ branch: 'main' }, { branch: 'fix/other' }, { branch: '--all' }, { expectedHead: 'short' }, { expectedHead: 'a'.repeat(40) }, { worktree: path.join(f.worktree, 'subfolder') }])
    assert.ok((await deliver({ ...f.options, ...change }, f.dependencies)).state.startsWith('STOP_'));
  assert.equal((await deliver(f.options, { run: f.dependencies.run })).state, 'STOP_REPOSITORY_IDENTITY');
  await f.local(['config', 'remote.origin.pushurl', path.join(f.root, 'other.git')]);
  assert.equal((await deliver(f.options, f.dependencies)).state, 'STOP_PUSH_REMOTE_IDENTITY');
  assert.equal(f.pushes(), 0);
});

test('preflight network failure prevents push with one safe recovery command', async t => {
  const f = await fixture(t);
  const run = (command, args, cwd) => command === 'git' && args[0] === 'ls-remote'
    ? Promise.resolve({ code: 1, stderr: 'TLS EOF token=SECRET', stdout: '' }) : f.dependencies.run(command, args, cwd);
  const result = await deliver(f.options, { ...f.dependencies, run });
  assert.equal(result.state, 'LOCAL_PASS_REMOTE_UNVERIFIED');
  assert.equal(result.pushes, 0);
  assert.equal(result.networkMode, 'NETWORK_DEGRADED');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('GitHub API is independent post-push verification after Git EOF', async t => {
  const f = await fixture(t);
  const run = async (command, args, cwd) => {
    if (command === 'gh') return { code: 0, stdout: f.options.expectedHead + '\n', stderr: '' };
    if (command === 'git' && args[0] === 'push') {
      await f.dependencies.run(command, args, cwd);
      return { code: 1, stderr: 'TLS EOF', stdout: '' };
    }
    return f.dependencies.run(command, args, cwd);
  };
  const result = await deliver(f.options, { ...f.dependencies, run });
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.equal(result.channel, 'github_api');
});

test('bounded subprocess timeout; diagnostic proxy and transport output is redacted', async t => {
  const f = await fixture(t);
  const timeout = await runCommand(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], f.worktree, 50);
  assert.equal(timeout.timedOut, true);
  const run = async (command, args, cwd) => {
    if (args.includes('ls-remote')) return { code: 1, stderr: 'TLS EOF secret=PRIVATE', stdout: '', elapsedMs: 3 };
    if (args.includes('--get-regexp')) return { code: 0, stderr: '', stdout: 'http.proxy https://user:PRIVATE@proxy' };
    return f.dependencies.run(command, args, cwd);
  };
  const result = await diagnose(f.worktree, run);
  assert.equal(result.tests.length, 3);
  assert.equal(result.gitProxyConfigured, true);
  assert.equal(result.pushSubmitted, false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('origin only accepts exact repository without credentials', () => {
  assert.ok(trustedOrigin('https://github.com/clearisok/zhixu-erp.git'));
  assert.ok(trustedOrigin('git@github.com:clearisok/zhixu-erp.git'));
  for (const url of ['https://token@github.com/clearisok/zhixu-erp.git', 'https://github.com/other/repo.git', 'https://github.com/clearisok/zhixu-erp.git?token=private']) assert.equal(trustedOrigin(url), false);
});

test('dirty bytes changing during push trigger STOP without overwriting them', async t => {
  const f = await fixture(t);
  const run = async (command, args, cwd) => {
    const result = await f.dependencies.run(command, args, cwd);
    if (command === 'git' && args[0] === 'push') await writeFile(path.join(f.worktree, 'untracked.txt'), 'concurrent edit');
    return result;
  };
  assert.equal((await deliver(f.options, { ...f.dependencies, run })).state, 'STOP_LOCAL_CHANGED');
  assert.equal(await readFile(path.join(f.worktree, 'untracked.txt'), 'utf8'), 'concurrent edit');
});

test('remote ancestry object unavailable stops instead of guessing or fetching', async t => {
  const f = await fixture(t);
  const run = (command, args, cwd) => command === 'git' && args[0] === 'ls-remote'
    ? Promise.resolve({ code: 0, stdout: 'a'.repeat(40) + '\trefs/heads/chore/test-delivery\n', stderr: '' }) : f.dependencies.run(command, args, cwd);
  assert.equal((await deliver(f.options, { ...f.dependencies, run })).state, 'STOP_REMOTE_RELATION_UNVERIFIABLE');
  assert.equal(f.pushes(), 0);
});

test('PowerShell real entry defaults dry, rejects main and conflicting actions', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t);
  const script = path.resolve('scripts/git-delivery.ps1');
  const entry = async (branch, flags) => runCommand('C:\\Program Files\\PowerShell\\7\\pwsh.exe', ['-NoProfile', '-File', script, '-Worktree', f.worktree, '-Branch', branch, '-ExpectedHead', f.options.expectedHead, ...flags], f.worktree);
  const dry = await entry(f.options.branch, []);
  assert.equal(dry.code, 1);
  assert.equal(JSON.parse(dry.stdout).state, 'STOP_REPOSITORY_IDENTITY'); // no local-remote bypass in production CLI
  const main = await entry('main', ['-DryRun']);
  assert.equal(JSON.parse(main.stdout).state, 'STOP_INVALID_TARGET');
  const conflicting = await entry(f.options.branch, ['-Execute', '-DryRun']);
  assert.equal(JSON.parse(conflicting.stdout).state, 'STOP_CONFLICTING_ACTIONS');
  assert.equal(f.pushes(), 0);
});
