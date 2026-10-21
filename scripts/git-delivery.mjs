import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deliveryState, isTlsIdentityFailure } from './git-delivery-state.mjs';

export const repository = 'clearisok/zhixu-erp';
const sha = value => /^[0-9a-f]{40}$/.test(value ?? '');
const denied = /authentication failed|permission denied|access denied|could not read username|invalid username|(?:error:|HTTP)\s*(401|403)|non-fast-forward|\brejected\b|conflict|diverg/i;
export function errorCategory(result) {
  if (isTlsIdentityFailure(result.stderr)) return 'tls_identity_or_configuration';
  if (result.code === 0 && !result.timedOut && !result.spawnError && !result.overflow) return 'command_pass';
  if (denied.test(result.stderr)) return 'authentication_or_divergence';
  if (result.timedOut) return 'timeout';
  if (result.spawnError) return 'executable_unavailable';
  if (result.overflow) return 'output_limit_exceeded';
  if (/schannel|close_notify|tls|ssl|eof|connection.*reset|recv failure|failed to connect|could not connect|could not resolve (host|proxy)|connection.*timed out/i.test(result.stderr)) return 'uncertain_transport';
  return result.code === 0 ? 'command_pass' : 'command_failed';
}

/** Raw output stays in memory; callers publish only allowlisted fields. */
export function runCommand(command, args, cwd, timeoutMs = 30000) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
    let stdout = '', stderr = '', timedOut = false, spawnError = false, overflow = false;
    const terminate = () => {
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill();
    };
    const append = (field, bytes) => {
      if (stdout.length + stderr.length + bytes.length > 16 * 1024 * 1024) {
        overflow = true; terminate(); return;
      }
      if (field === 'stdout') stdout += bytes.toString('utf8'); else stderr += bytes.toString('utf8');
    };
    child.stdout.setEncoding('utf8').on('data', bytes => append('stdout', bytes));
    child.stderr.setEncoding('utf8').on('data', bytes => append('stderr', bytes));
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    child.on('error', () => { spawnError = true; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code: timedOut || overflow || spawnError ? 1 : code, stdout, stderr: timedOut ? `${stderr}\ntimeout` : stderr,
        timedOut, spawnError, overflow, elapsedMs: Date.now() - started });
    });
  });
}

export function trustedOrigin(url) {
  return /^(https:\/\/github\.com\/clearisok\/zhixu-erp(?:\.git)?|git@github\.com:clearisok\/zhixu-erp(?:\.git)?)$/.test(url);
}

export async function workingEvidence(worktree, run = runCommand) {
  worktree = await realpath(worktree);
  const status = await run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], worktree);
  if (status.code !== 0 || status.overflow) throw new Error('worktree_unverifiable');
  if (!status.stdout) return { clean: true };
  const digest = createHash('sha256').update(status.stdout);
  for (const args of [['diff', '--binary', '--no-ext-diff', '--no-textconv'], ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']]) {
    const diff = await run('git', args, worktree);
    if (diff.code !== 0 || diff.overflow) throw new Error('dirty_unverifiable');
    digest.update(JSON.stringify(args)).update(diff.stdout);
  }
  // -z output uses literal paths; renames have a second NUL-delimited path.
  const entries = status.stdout.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    if (/[RC]/.test(entry.slice(0, 2))) i++;
    const file = path.resolve(worktree, entry.slice(3));
    const relative = path.relative(worktree, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('dirty_path_invalid');
    let stat;
    try { stat = await lstat(file); } catch (error) {
      if (error.code === 'ENOENT') { digest.update(entry).update('missing'); continue; }
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('dirty_file_unsupported');
    const resolved = path.relative(worktree, await realpath(file));
    if (resolved.startsWith('..') || path.isAbsolute(resolved)) throw new Error('dirty_path_invalid');
    digest.update(entry).update(String(stat.mode)).update(await readFile(file));
  }
  return { clean: false, dirtyFingerprint: digest.digest('hex') };
}

export async function remoteEvidence(worktree, branch, run = runCommand, independent = false) {
  if (independent) {
    const api = await run('gh', ['api', '--hostname', 'github.com', `repos/${repository}/git/ref/heads/${branch}`, '--jq', '.object.sha'], worktree);
    if (api.code === 0 && sha(api.stdout.trim())) return { verified: true, sha: api.stdout.trim(), channel: 'github_api' };
    // A single Git read is a fallback, never another push. Raw API errors are not published.
  }
  const result = await run('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], worktree);
  if (result.code === 2 && !result.stdout.trim()) return { verified: true, sha: null, channel: 'git_read' };
  const lines = result.stdout.trim().split('\n');
  const fields = lines[0]?.trim().split(/\s+/);
  if (result.code === 0 && lines.length === 1 && sha(fields[0]) && fields[1] === `refs/heads/${branch}`)
    return { verified: true, sha: fields[0], channel: 'git_read' };
  return { verified: false, category: errorCategory(result), channel: 'git_read', diagnostic: safeCommandSummary(result) };
}

/** No stderr, URLs, environment values or credentials enter delivery receipts. */
function safeCommandSummary(result) {
  return { exitCode: Number.isInteger(result.code) ? result.code : null,
    category: errorCategory(result), timedOut: result.timedOut === true,
    ...(Number.isFinite(result.elapsedMs) ? { elapsedMs: result.elapsedMs } : {}) };
}

/** One independent read after a transport failure; never retry the failed Git read. */
export async function preflightRemoteEvidence(worktree, branch, run = runCommand) {
  const git = await remoteEvidence(worktree, branch, run);
  if (git.verified || !['uncertain_transport', 'timeout'].includes(git.category)) return git;
  const api = await run('gh', ['api', '--hostname', 'github.com', `repos/${repository}/git/matching-refs/heads/${branch}`], worktree);
  const preflight = { git: git.diagnostic, api: safeCommandSummary(api) };
  if (api.code !== 0) return { verified: false, channel: 'github_api', category: errorCategory(api), preflight, degraded: true };
  let refs;
  try { refs = JSON.parse(api.stdout); } catch { /* Invalid evidence must never authorize a push. */ }
  const targetRef = `refs/heads/${branch}`;
  const valid = Array.isArray(refs) && refs.every(ref => ref && typeof ref.ref === 'string'
    && ref.ref.startsWith(targetRef) && ref.object?.type === 'commit'
    && typeof ref.object.sha === 'string' && sha(ref.object.sha));
  if (!valid) return { verified: false, channel: 'github_api', category: 'invalid_evidence', preflight, degraded: true };
  const exact = refs.filter(ref => ref.ref === targetRef);
  // A successful empty matching-refs result proves absence. A nonempty prefix page
  // without an exact match does not: it may be paginated. Do not infer from 404.
  if (refs.length !== 0 && exact.length !== 1)
    return { verified: false, channel: 'github_api', category: 'invalid_evidence', preflight, degraded: true };
  return { verified: true, sha: exact[0]?.object.sha ?? null, channel: 'github_api', preflight, degraded: true };
}

export function recoveryCommand(options) {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  return `pwsh -NoProfile -File ${quote(path.join(options.worktree, 'scripts', 'git-delivery.ps1'))} -Worktree ${quote(options.worktree)} -Branch ${quote(options.branch)} -ExpectedHead ${quote(options.expectedHead)}${options.expectedDirtyFingerprint ? ` -ExpectedDirtyFingerprint ${quote(options.expectedDirtyFingerprint)}` : ''} -Execute`;
}

/** Dependencies are injectable only through this testable module API, not CLI switches. */
export async function deliver(options, dependencies = {}) {
  const run = dependencies.run ?? runCommand;
  const originCheck = dependencies.originCheck ?? trustedOrigin;
  let pushes = 0;
  const summary = (state, extra = {}) => ({ state, repository, branch: options.branch,
    expectedHead: options.expectedHead, pushes, retry: false, ...extra });
  if (!sha(options.expectedHead) || !/^(feat|fix|chore|ops|codex)\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(options.branch ?? ''))
    return summary('STOP_INVALID_TARGET');
  try {
    const worktree = await realpath(options.worktree);
    options = { ...options, worktree };
    const git = args => run('git', args, worktree);
    const root = await git(['rev-parse', '--show-toplevel']);
    if (root.code !== 0 || (await realpath(root.stdout.trim())).toLowerCase() !== worktree.toLowerCase()) return summary('STOP_WORKTREE_IDENTITY');
    const origin = await git(['remote', 'get-url', 'origin']);
    if (origin.code !== 0 || !originCheck(origin.stdout.trim())) return summary('STOP_REPOSITORY_IDENTITY');
    const pushUrls = await git(['remote', 'get-url', '--push', '--all', 'origin']);
    if (pushUrls.code !== 0 || pushUrls.stdout.trim().split(/\r?\n/).length !== 1 || pushUrls.stdout.trim() !== origin.stdout.trim())
      return summary('STOP_PUSH_REMOTE_IDENTITY');
    const branch = await git(['branch', '--show-current']);
    const head = await git(['rev-parse', 'HEAD']);
    const object = await git(['cat-file', '-t', 'HEAD']);
    const ref = await git(['check-ref-format', '--branch', options.branch]);
    if (ref.code !== 0 || branch.code !== 0 || head.code !== 0 || object.code !== 0 || object.stdout.trim() !== 'commit' || branch.stdout.trim() !== options.branch || head.stdout.trim() !== options.expectedHead)
      return summary('STOP_BRANCH_OR_HEAD');
    const initial = await workingEvidence(worktree, run);
    const dirtyCheck = deliveryState({ phase: 'check', exitCode: 0, ...initial, expectedDirtyFingerprint: options.expectedDirtyFingerprint });
    if (!dirtyCheck.continueLocal) return summary(dirtyCheck.state);
    const before = await preflightRemoteEvidence(worktree, options.branch, run);
    const recovery = recoveryCommand(options);
    const preflight = before.preflight ?? (before.diagnostic ? { git: before.diagnostic } : undefined);
    const degraded = before.degraded === true || ['uncertain_transport', 'timeout'].includes(before.category);
    const preflightSummary = { ...(preflight ? { preflight } : {}), networkMode: degraded ? 'NETWORK_DEGRADED' : 'NORMAL' };
    if (!before.verified) return summary(before.category === 'authentication_or_divergence' ? 'STOP_AUTH_OR_DIVERGENCE' : before.category === 'tls_identity_or_configuration' ? 'STOP_TLS_IDENTITY_OR_CONFIGURATION' : before.category === 'invalid_evidence' ? 'STOP_REMOTE_EVIDENCE_INVALID' : 'LOCAL_PASS_REMOTE_UNVERIFIED', { recovery, remoteStatus: 'REMOTE_UNVERIFIED', ...preflightSummary });
    if (before.sha === options.expectedHead) return summary('DELIVERED_VERIFIED', { remoteSha: before.sha, channel: before.channel, ...preflightSummary });
    if (before.sha) {
      const relation = await git(['merge-base', '--is-ancestor', before.sha, options.expectedHead]);
      if (relation.code !== 0) return summary(relation.code === 1 ? 'STOP_AUTH_OR_DIVERGENCE' : 'STOP_REMOTE_RELATION_UNVERIFIABLE');
    }
    if (!options.execute) return summary('READY_DRY_RUN', { remoteSha: before.sha, dirtyProtected: !initial.clean, recovery, ...preflightSummary });
    const freshHead = await git(['rev-parse', 'HEAD']);
    const fresh = await workingEvidence(worktree, run);
    if (freshHead.code !== 0 || freshHead.stdout.trim() !== options.expectedHead || JSON.stringify(fresh) !== JSON.stringify(initial)) return summary('STOP_LOCAL_CHANGED');
    pushes++;
    const pushed = await git(['push', 'origin', `${options.expectedHead}:refs/heads/${options.branch}`]);
    // Always verify after a push, including rejection and response-loss outcomes.
    const after = await remoteEvidence(worktree, options.branch, run, true);
    const final = await workingEvidence(worktree, run);
    const finalHead = await git(['rev-parse', 'HEAD']);
    if (JSON.stringify(initial) !== JSON.stringify(final) || finalHead.code !== 0 || finalHead.stdout.trim() !== options.expectedHead) return summary('STOP_LOCAL_CHANGED', { remoteSha: after.sha });
    if (after.category === 'authentication_or_divergence') return summary('STOP_AUTH_OR_DIVERGENCE', { recovery });
    if (after.category === 'tls_identity_or_configuration') return summary('STOP_TLS_IDENTITY_OR_CONFIGURATION', { recovery });
    let relation;
    if (after.verified && after.sha && after.sha !== options.expectedHead) {
      const ancestry = await git(['merge-base', '--is-ancestor', after.sha, options.expectedHead]);
      if (ancestry.code === 1) relation = 'diverged';
      else if (ancestry.code !== 0) return summary('STOP_REMOTE_RELATION_UNVERIFIABLE', { remoteSha: after.sha });
    }
    const decision = deliveryState({ phase: 'push', exitCode: pushed.code, stderr: pushed.stderr,
      targetSha: options.expectedHead, remoteSha: after.sha, remoteVerified: after.verified,
      remoteRelation: relation, ...initial, expectedDirtyFingerprint: options.expectedDirtyFingerprint });
    return summary(decision.state, { continueLocal: decision.continueLocal, remoteSha: after.sha,
      remoteStatus: after.verified ? after.sha === options.expectedHead ? 'EXACT_HEAD_VERIFIED' : 'TARGET_NOT_DELIVERED' : 'REMOTE_UNVERIFIED',
      pushCategory: errorCategory(pushed), pushDiagnostic: safeCommandSummary(pushed), elapsedMs: pushed.elapsedMs, channel: after.channel,
      ...(preflight ? { preflight } : {}),
      networkMode: degraded || errorCategory(pushed) === 'uncertain_transport' || pushed.timedOut || decision.state.startsWith('LOCAL_PASS_REMOTE_') ? 'NETWORK_DEGRADED' : 'NORMAL',
      ...(decision.state === 'DELIVERED_VERIFIED' ? {} : { recovery }) });
  } catch {
    return summary('STOP_LOCAL_EVIDENCE_UNVERIFIABLE');
  }
}

export async function diagnose(worktree, run = runCommand) {
  const get = args => run('git', args, worktree);
  const version = await get(['--version']);
  const backend = await get(['config', '--get', 'http.sslBackend']);
  const http = await get(['config', '--get', 'http.version']);
  const proxy = await get(['config', '--get-regexp', '^http\..*proxy$|^http\.proxy$']);
  const executable = await run(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], worktree);
  const tests = [];
  for (const [name, settings] of [['default', []], ['http1.1', ['-c', 'http.version=HTTP/1.1']], ['openssl_http1.1', ['-c', 'http.sslBackend=openssl', '-c', 'http.version=HTTP/1.1']]]) {
    const result = await get([...settings, 'ls-remote', '--exit-code', 'https://github.com/clearisok/zhixu-erp.git', 'refs/heads/main']);
    tests.push({ name, exitCode: result.code, category: /unsupported ssl backend/i.test(result.stderr) ? 'backend_unsupported' : errorCategory(result), elapsedMs: result.elapsedMs,
      remoteSha: result.code === 0 && sha(result.stdout.split(/\s+/)[0]) ? result.stdout.split(/\s+/)[0] : undefined });
  }
  return { node: process.version, platform: process.platform, gitVersion: /^git version [\w.]+/.exec(version.stdout)?.[0],
    gitExecutables: executable.code === 0 ? executable.stdout.trim().split(/\r?\n/) : [],
    sslBackend: /^(schannel|openssl)$/.test(backend.stdout.trim()) ? backend.stdout.trim() : 'default_or_other',
    httpVersion: /^(HTTP\/1\.1|HTTP\/2)$/.test(http.stdout.trim()) ? http.stdout.trim() : 'default_or_other',
    gitProxyConfigured: proxy.code === 0 && !!proxy.stdout,
    proxyEnvironmentPresent: ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'].filter(key => Object.keys(process.env).some(name => name.toUpperCase() === key)),
    ...await workingEvidence(worktree, run), tests, configurationChanged: false, pushSubmitted: false,
    limitation: 'Read-only reachability is not proof of push reliability; root cause unresolved without comparison evidence.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const allowed = new Set(['--worktree', '--branch', '--expected-head', '--expected-dirty-fingerprint', '--execute', '--diagnose']);
    const values = {};
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (!allowed.has(key) || Object.hasOwn(values, key)) throw new Error('invalid_arguments');
      values[key] = ['--execute', '--diagnose'].includes(key) ? true : args[++i];
      if (values[key] === undefined) throw new Error('invalid_arguments');
    }
    const result = values['--diagnose'] ? await diagnose(values['--worktree']) : await deliver({ worktree: values['--worktree'], branch: values['--branch'], expectedHead: values['--expected-head'], expectedDirtyFingerprint: values['--expected-dirty-fingerprint'], execute: values['--execute'] === true });
    console.log(JSON.stringify(result));
    process.exitCode = values['--diagnose'] || ['DELIVERED_VERIFIED', 'READY_DRY_RUN'].includes(result.state) ? 0 : 1;
  } catch { console.log(JSON.stringify({ state: 'STOP_INVALID_ARGUMENTS' })); process.exitCode = 1; }
}
