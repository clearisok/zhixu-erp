import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deliver, diagnose, trustedOrigin, runCommand, workingEvidence, errorCategory } from '../git-delivery.mjs';

async function fixture(t, branch = 'chore/test-delivery') {
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
  await local(['switch', '-c', branch]);
  await local(['remote', 'add', 'origin', path.join(root, 'remote.git')]);
  await writeFile(path.join(worktree, 'fixture.txt'), 'initial\n');
  await local(['add', 'fixture.txt']);
  await local(['commit', '-m', 'isolated baseline']);
  const expectedHead = await local(['rev-parse', 'HEAD']);
  const options = { worktree, branch, expectedHead, execute: true };
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

test('successful push ref names do not impersonate rejected commands', async t => {
  for (const branch of ['chore/conflict-report', 'chore/divergence-proof', 'chore/rejected-marker', 'chore/non-fast-forward-notes']) {
    await t.test(branch, async child => {
      const f = await fixture(child, branch);
      const result = await deliver(f.options, f.dependencies);
      assert.equal(result.state, 'DELIVERED_VERIFIED');
      assert.equal(result.remoteStatus, 'EXACT_HEAD_VERIFIED');
      assert.equal(result.remoteSha, f.options.expectedHead);
      assert.equal(result.pushCategory, 'command_pass');
      assert.equal(result.pushDiagnostic.exitCode, 0);
      assert.equal(result.pushDiagnostic.category, 'command_pass');
      assert.equal(result.pushDiagnostic.timedOut, false);
      assert.deepEqual(Object.keys(result.pushDiagnostic).sort(), ['category', 'elapsedMs', 'exitCode', 'timedOut']);
      assert.equal(f.pushes(), 1);
      assert.equal((await deliver(f.options, f.dependencies)).pushes, 0);
      assert.equal(f.pushes(), 1);
    });
  }
});

test('successful push output still requires independent exact remote proof', async t => {
  const f = await fixture(t, 'chore/conflict-unverified');
  let pushed = false;
  const run = async (command, args, cwd) => {
    if (pushed && command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr: 'TLS EOF SECRET' };
    const result = await f.dependencies.run(command, args, cwd);
    if (command === 'git' && args[0] === 'push') pushed = true;
    return result;
  };
  const result = await deliver(f.options, { ...f.dependencies, run });
  assert.equal(result.state, 'LOCAL_PASS_REMOTE_UNVERIFIED');
  assert.equal(result.remoteStatus, 'REMOTE_UNVERIFIED');
  assert.equal(result.pushDiagnostic.exitCode, 0);
  assert.equal(result.retry, false);
  assert.equal(f.pushes(), 1);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
  assert.ok((await f.local(['ls-remote', 'origin', `refs/heads/${f.options.branch}`])).startsWith(f.options.expectedHead));
});

test('nonzero authentication and zero-exit TLS identity signals remain STOP even with exact remote', async t => {
  for (const [code, stderr, state] of [[1, 'authentication failed SECRET', 'STOP_AUTH_OR_DIVERGENCE'], [0, 'SSL certificate verify failed SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION']]) {
    await t.test(state, async child => {
      const f = await fixture(child);
      const run = async (command, args, cwd) => {
        const result = await f.dependencies.run(command, args, cwd);
        return command === 'git' && args[0] === 'push' ? { ...result, code, stderr } : result;
      };
      const result = await deliver(f.options, { ...f.dependencies, run });
      assert.equal(result.remoteSha, f.options.expectedHead);
      assert.equal(result.remoteStatus, 'EXACT_HEAD_VERIFIED');
      assert.equal(result.state, state);
      assert.equal(result.pushDiagnostic.exitCode, code);
      assert.equal(f.pushes(), 1);
      assert.equal(result.retry, false);
      assert.ok(!JSON.stringify(result).includes('SECRET'));
    });
  }
});

test('zero exits cannot hide timeout, spawn failure, output limits or identity errors in diagnostics', () => {
  for (const [field, category] of [['timedOut', 'timeout'], ['spawnError', 'executable_unavailable'], ['overflow', 'output_limit_exceeded']])
    assert.equal(errorCategory({ code: 0, stderr: '', [field]: true }), category);
  assert.equal(errorCategory({ code: 0, stderr: 'SSL certificate verify failed PRIVATE' }), 'tls_identity_or_configuration');
  assert.equal(errorCategory({ code: 1, stderr: 'HTTP 403 PRIVATE', timedOut: true }), 'authentication_or_divergence');
  assert.equal(errorCategory({ code: 0, stderr: 'TLS unexpected EOF PRIVATE' }), 'uncertain_transport');
});

test('healthy zero exit transport warnings retain degraded mode after exact delivery', async t => {
  const f = await fixture(t);
  const run = async (command, args, cwd) => {
    const result = await f.dependencies.run(command, args, cwd);
    return command === 'git' && args[0] === 'push' ? { ...result, stderr: `${result.stderr}\nTLS unexpected EOF PRIVATE` } : result;
  };
  const result = await deliver(f.options, { ...f.dependencies, run });
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.equal(result.remoteStatus, 'EXACT_HEAD_VERIFIED');
  assert.equal(result.pushDiagnostic.exitCode, 0);
  assert.equal(result.pushDiagnostic.category, 'uncertain_transport');
  assert.equal(result.networkMode, 'NETWORK_DEGRADED');
  assert.equal(f.pushes(), 1);
  assert.equal(result.retry, false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
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
  assert.equal(result.preflight.git.category, 'uncertain_transport');
  assert.equal(result.preflight.api.exitCode, 1);
});

function refPayload(branch, targetSha) {
  return [{ ref: `refs/heads/${branch}`, object: { type: 'commit', sha: targetSha } }];
}

test('transport-only Git preflight can use one independent API read and one actual push', async t => {
  const f = await fixture(t);
  await f.local(['push', 'origin', 'HEAD']);
  const previous = f.options.expectedHead;
  await writeFile(path.join(f.worktree, 'fixture.txt'), 'next checkpoint\n');
  await f.local(['commit', '-am', 'next checkpoint']);
  const expectedHead = await f.local(['rev-parse', 'HEAD']);
  const calls = [];
  const run = async (command, args, cwd) => {
    if (command === 'git' && args[0] === 'ls-remote') {
      calls.push('git-read');
      return { code: 128, stderr: 'schannel: SSL/TLS handshake failed SECRET', stdout: '', elapsedMs: 3 };
    }
    if (command === 'gh') {
      assert.deepEqual(args.slice(0, 3), ['api', '--hostname', 'github.com']);
      if (args.some(arg => arg.includes('/matching-refs/'))) {
        calls.push('api-preflight');
        return { code: 0, stdout: JSON.stringify(refPayload(f.options.branch, previous)), stderr: '' };
      }
      calls.push('api-postflight');
      const actual = await f.local(['ls-remote', 'origin', `refs/heads/${f.options.branch}`]);
      return { code: 0, stdout: actual.split(/\s+/)[0], stderr: '' };
    }
    return f.dependencies.run(command, args, cwd);
  };
  const result = await deliver({ ...f.options, expectedHead }, { ...f.dependencies, run });
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.equal(result.remoteSha, expectedHead);
  assert.equal(result.pushes, 1);
  assert.equal(f.pushes(), 1);
  assert.equal(result.networkMode, 'NETWORK_DEGRADED');
  assert.deepEqual(calls, ['git-read', 'api-preflight', 'api-postflight']);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('API preflight exact target returns the original commit without pushing again', async t => {
  const f = await fixture(t);
  const run = async (command, args, cwd) => {
    if (command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr: 'Failed to connect SECRET' };
    if (command === 'gh') return { code: 0, stdout: JSON.stringify(refPayload(f.options.branch, f.options.expectedHead)), stderr: '' };
    return f.dependencies.run(command, args, cwd);
  };
  const result = await deliver(f.options, { ...f.dependencies, run });
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.equal(result.remoteSha, f.options.expectedHead);
  assert.equal(result.channel, 'github_api');
  assert.equal(result.networkMode, 'NETWORK_DEGRADED');
  assert.equal(f.pushes(), 0);
});

test('successful empty matching-refs evidence permits a new branch, never a 404 assumption', async t => {
  const f = await fixture(t);
  let reads = 0;
  const run = async (command, args, cwd) => {
    if (command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr: 'Could not resolve host SECRET' };
    if (command === 'gh') {
      reads++;
      return { code: 0, stdout: args.some(arg => arg.includes('/matching-refs/')) ? '[]' : f.options.expectedHead, stderr: '' };
    }
    return f.dependencies.run(command, args, cwd);
  };
  const result = await deliver(f.options, { ...f.dependencies, run });
  assert.equal(result.state, 'DELIVERED_VERIFIED');
  assert.equal(f.pushes(), 1);
  assert.equal(reads, 2);
  assert.equal(await f.local(['ls-remote', 'origin', `refs/heads/${f.options.branch}`]), `${f.options.expectedHead}\trefs/heads/${f.options.branch}`);
});

for (const [name, stderr, state, metadata = {}] of [
  ['authentication', 'authentication failed SECRET', 'STOP_AUTH_OR_DIVERGENCE'],
  ['certificate', 'SSL certificate problem: certificate verify failed SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION'],
  ['configuration', 'unsupported ssl backend SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION'],
  ['SNI identity', 'schannel: SNI or certificate check failed: SEC_E_WRONG_PRINCIPAL SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION'],
  ['hostname identity', 'SSL: no alternative certificate subject name matches target hostname SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION'],
  ['timed-out identity', 'SSL certificate verify failed SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION', { timedOut: true }],
  ['timed-out authorization', 'HTTP 403 SECRET', 'STOP_AUTH_OR_DIVERGENCE', { timedOut: true }],
  ['divergence', 'non-fast-forward rejected SECRET', 'STOP_AUTH_OR_DIVERGENCE']
]) {
  test(`Git ${name} stops before API fallback or push`, async t => {
    const f = await fixture(t);
    let apiReads = 0;
    const run = async (command, args, cwd) => {
      if (command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr, ...metadata };
      if (command === 'gh') { apiReads++; return { code: 0, stdout: '[]', stderr: '' }; }
      return f.dependencies.run(command, args, cwd);
    };
    const result = await deliver(f.options, { ...f.dependencies, run });
    assert.equal(result.state, state);
    assert.equal(apiReads, 0);
    assert.equal(f.pushes(), 0);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
  });
}

for (const [name, code, payload, stderr, state] of [
  ['malformed', 0, 'SECRET', '', 'STOP_REMOTE_EVIDENCE_INVALID'],
  ['wrong ref', 0, JSON.stringify(refPayload('other/branch', 'a'.repeat(40))), '', 'STOP_REMOTE_EVIDENCE_INVALID'],
  ['non-exact prefix', 0, JSON.stringify(refPayload('chore/test-delivery/child', 'a'.repeat(40))), '', 'STOP_REMOTE_EVIDENCE_INVALID'],
  ['duplicate exact', 0, JSON.stringify([...refPayload('chore/test-delivery', 'a'.repeat(40)), ...refPayload('chore/test-delivery', 'b'.repeat(40))]), '', 'STOP_REMOTE_EVIDENCE_INVALID'],
  ['bad SHA', 0, JSON.stringify(refPayload('chore/test-delivery', 'SECRET')), '', 'STOP_REMOTE_EVIDENCE_INVALID'],
  ['coerced SHA array', 0, JSON.stringify(refPayload('chore/test-delivery', ['a'.repeat(40)])), '', 'STOP_REMOTE_EVIDENCE_INVALID'],
  ['404', 1, '', 'gh: Not Found (HTTP 404) SECRET', 'LOCAL_PASS_REMOTE_UNVERIFIED'],
  ['403', 1, '', 'gh: Resource not accessible (HTTP 403) SECRET', 'STOP_AUTH_OR_DIVERGENCE'],
  ['certificate', 1, '', 'SSL certificate verify failed SECRET', 'STOP_TLS_IDENTITY_OR_CONFIGURATION']
]) {
  test(`API fallback ${name} cannot authorize a push`, async t => {
    const f = await fixture(t);
    const run = async (command, args, cwd) => {
      if (command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr: 'TLS EOF', elapsedMs: 3 };
      if (command === 'gh') return { code, stdout: payload, stderr };
      return f.dependencies.run(command, args, cwd);
    };
    const result = await deliver(f.options, { ...f.dependencies, run });
    assert.equal(result.state, state);
    assert.equal(result.networkMode, 'NETWORK_DEGRADED');
    assert.equal(f.pushes(), 0);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
  });
}

test('API preflight cannot bypass missing ancestry or a changed local worktree', async t => {
  const f = await fixture(t);
  let remoteSha = 'a'.repeat(40);
  let mutate = false;
  const run = async (command, args, cwd) => {
    if (command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr: 'TLS EOF' };
    if (command === 'gh') {
      if (mutate) await writeFile(path.join(f.worktree, 'concurrent.txt'), 'preserve this edit');
      return { code: 0, stdout: JSON.stringify(remoteSha ? refPayload(f.options.branch, remoteSha) : []), stderr: '' };
    }
    return f.dependencies.run(command, args, cwd);
  };
  assert.equal((await deliver(f.options, { ...f.dependencies, run })).state, 'STOP_REMOTE_RELATION_UNVERIFIABLE');
  remoteSha = null;
  mutate = true;
  assert.equal((await deliver(f.options, { ...f.dependencies, run })).state, 'STOP_LOCAL_CHANGED');
  assert.equal(await readFile(path.join(f.worktree, 'concurrent.txt'), 'utf8'), 'preserve this edit');
  assert.equal(f.pushes(), 0);
});

test('DNS and connect failures remain transport failures; permissions and certificates take precedence', () => {
  for (const stderr of ['Could not resolve host SECRET', 'Could not resolve proxy SECRET', 'Failed to connect SECRET', 'Connection timed out SECRET'])
    assert.equal(errorCategory({ code: 128, stderr }), 'uncertain_transport');
  assert.equal(errorCategory({ code: 1, stderr: 'TLS error (HTTP 403) SECRET' }), 'authentication_or_divergence');
  assert.equal(errorCategory({ code: 1, stderr: 'TLS certificate verify failed SECRET' }), 'tls_identity_or_configuration');
});

test('API preflight cannot bypass a real divergent commit', async t => {
  const f = await fixture(t);
  const tree = await f.local(['rev-parse', `${f.options.expectedHead}^{tree}`]);
  const target = await f.local(['commit-tree', tree, '-p', f.options.expectedHead, '-m', 'target child commit']);
  const sibling = await f.local(['commit-tree', tree, '-p', f.options.expectedHead, '-m', 'unaccepted remote commit']);
  await f.local(['update-ref', `refs/heads/${f.options.branch}`, target]); // Only this isolated fixture.
  const run = async (command, args, cwd) => {
    if (command === 'git' && args[0] === 'ls-remote') return { code: 1, stdout: '', stderr: 'TLS EOF' };
    if (command === 'gh') return { code: 0, stdout: JSON.stringify(refPayload(f.options.branch, sibling)), stderr: '' };
    return f.dependencies.run(command, args, cwd);
  };
  assert.equal((await deliver({ ...f.options, expectedHead: target }, { ...f.dependencies, run })).state, 'STOP_AUTH_OR_DIVERGENCE');
  assert.equal(f.pushes(), 0);
});

for (const mode of ['timeout', 'unavailable']) {
  test(`API preflight ${mode} stops with no push or network retry`, async t => {
    const f = await fixture(t);
    const calls = [];
    const run = async (command, args, cwd) => {
      if (command === 'git' && args[0] === 'ls-remote') { calls.push('git-read'); return { code: 1, stdout: '', stderr: 'TLS EOF' }; }
      if (command === 'gh') { calls.push('api-read'); return { code: 1, stdout: '', stderr: 'PRIVATE', timedOut: mode === 'timeout', spawnError: mode === 'unavailable' }; }
      return f.dependencies.run(command, args, cwd);
    };
    const result = await deliver(f.options, { ...f.dependencies, run });
    assert.equal(result.state, 'LOCAL_PASS_REMOTE_UNVERIFIED');
    assert.equal(result.preflight.api.category, mode === 'timeout' ? 'timeout' : 'executable_unavailable');
    assert.equal(f.pushes(), 0);
    assert.deepEqual(calls, ['git-read', 'api-read']);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
}

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

test('subprocess timeout keeps observed identity errors in memory for fail-closed classification', async t => {
  const f = await fixture(t);
  const result = await runCommand(process.execPath, ['-e', "process.stderr.write('SSL certificate verify failed PRIVATE\\n');setTimeout(()=>{},5000)"], f.worktree, 2000);
  assert.equal(result.timedOut, true);
  assert.equal(errorCategory(result), 'tls_identity_or_configuration');
  const classified = await deliver(f.options, { ...f.dependencies, run: (command, args, cwd) =>
    command === 'git' && args[0] === 'ls-remote' ? Promise.resolve(result) : f.dependencies.run(command, args, cwd) });
  assert.equal(classified.state, 'STOP_TLS_IDENTITY_OR_CONFIGURATION');
  assert.equal(f.pushes(), 0);
  assert.ok(!JSON.stringify(classified).includes('PRIVATE'));
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
