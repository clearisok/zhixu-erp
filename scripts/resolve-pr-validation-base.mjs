import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const fullSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const fail = code => { throw Object.assign(new Error(code), { code }); };

function readLocalGit(root, args) {
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 10_000, maxBuffer: 16 * 1024,
    windowsHide: true, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
  });
  if (result.error || result.signal || result.status !== 0) fail('PR_BASE_GIT_READ_FAILED');
  return result.stdout.trim();
}

/** Resolve the base of the merge actually being tested, never a floating ref. */
export function resolvePrValidationBase({ eventName, prNumber, mergeRef, mergeSha,
  headSha, eventBaseSha, root = process.cwd(), readGit = args => readLocalGit(root, args) }) {
  if (eventName !== 'pull_request' || typeof prNumber !== 'string'
    || !/^[1-9][0-9]*$/.test(prNumber) || !Number.isSafeInteger(Number(prNumber))
    || mergeRef !== `refs/pull/${prNumber}/merge`) fail('PR_BASE_EVENT_CONTEXT');
  if (![mergeSha, headSha, eventBaseSha].every(fullSha)) fail('PR_BASE_SHA_FORMAT');
  const actualHead = readGit(['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!fullSha(actualHead) || actualHead !== mergeSha) fail('PR_BASE_CHECKOUT_CHANGED');
  const parents = readGit(['rev-list', '--parents', '-n', '1', 'HEAD']).split(/\s+/);
  if (parents.length !== 3 || parents[0] !== mergeSha || !parents.every(fullSha)
    || parents[1] === parents[2] || parents[1] === mergeSha
    || parents[2] !== headSha) fail('PR_BASE_MERGE_PARENTS');
  for (const sha of parents.slice(1)) {
    if (readGit(['cat-file', '-t', sha]) !== 'commit') fail('PR_BASE_PARENT_OBJECT');
  }
  return { baseSha: parents[1], mergeSha, headSha, prNumber,
    eventBaseSha, eventBaseDiffers: eventBaseSha !== parents[1] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) fail('PR_BASE_ARGUMENTS');
    const result = resolvePrValidationBase({
      eventName: process.env.WORKFLOW_EVENT_NAME,
      prNumber: process.env.PR_NUMBER,
      mergeRef: process.env.CHECKOUT_REF,
      mergeSha: process.env.CHECKOUT_SHA,
      headSha: process.env.PR_HEAD_SHA,
      eventBaseSha: process.env.PR_EVENT_BASE_SHA,
    });
    // Only validated identities enter the job log. No Git stderr or environment dump.
    process.stderr.write(`${JSON.stringify({ kind: 'pr-validation-base', ...result })}\n`);
    process.stdout.write(`${result.baseSha}\n`);
  } catch (error) {
    const code = typeof error?.code === 'string' && /^PR_BASE_[A-Z_]+$/.test(error.code)
      ? error.code : 'PR_BASE_INTERNAL_FAILURE';
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code })}\n`);
    process.exitCode = 1;
  }
}
