/** Pure delivery decision, never logs raw command output or mutates Git config. */
export function deliveryState({ phase, exitCode, stderr = '', targetSha, remoteSha,
  baselineExists = true, clean = true }) {
  const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
  if (!clean) return { state: 'STOP_UNKNOWN_WORKTREE', continueLocal: false, retry: false };
  if (!baselineExists) return { state: 'STOP_BASELINE_MISSING', continueLocal: false, retry: false };
  if (/authentication failed|permission denied|access denied|non-fast-forward|\brejected\b|conflict|diverg/i.test(stderr))
    return { state: 'STOP_AUTH_OR_DIVERGENCE', continueLocal: false, retry: false };
  if (phase === 'push' && sha(targetSha) && remoteSha === targetSha)
    return { state: 'DELIVERED_VERIFIED', continueLocal: true, retry: false };
  if (phase === 'push' && remoteSha !== undefined && (!sha(remoteSha) || !sha(targetSha)))
    return { state: 'STOP_INVALID_EVIDENCE', continueLocal: false, retry: false };
  if (exitCode === 0) return { state: phase === 'push' ? 'AWAIT_REMOTE_VERIFICATION' : 'COMMAND_PASS', continueLocal: true, retry: false };
  if (/failed to connect|could not connect|connection.*reset|connection.*timed out|tls.*timeout|recv failure|eof|timeout/i.test(stderr))
    return { state: 'LOCAL_ENGINEERING_REMOTE_PENDING', continueLocal: true, retry: false };
  return { state: 'STOP_UNCLASSIFIED_FAILURE', continueLocal: false, retry: false };
}
