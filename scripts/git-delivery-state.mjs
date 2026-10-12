/** Pure delivery decision, never logs raw command output or mutates Git config. */
export function deliveryState({ phase, exitCode, stderr = '', targetSha, remoteSha,
  baselineExists = true, clean = true, dirtyFingerprint, expectedDirtyFingerprint,
  remoteRelation, remoteVerified = false }) {
  const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
  const knownDirty = /^[0-9a-f]{64}$/.test(expectedDirtyFingerprint ?? '') && dirtyFingerprint === expectedDirtyFingerprint;
  if (!clean && !knownDirty) return { state: 'STOP_UNKNOWN_WORKTREE', continueLocal: false, retry: false };
  if (!baselineExists) return { state: 'STOP_BASELINE_MISSING', continueLocal: false, retry: false };
  if (/certificate problem|certificate verify failed|SEC_E_UNTRUSTED_ROOT|SEC_E_CERT_EXPIRED|CERT_E_|certificate.*(expired|not match)|unsupported ssl backend/i.test(stderr))
    return { state: 'STOP_TLS_IDENTITY_OR_CONFIGURATION', continueLocal: false, retry: false };
  if (/authentication failed|permission denied|access denied|could not read username|invalid username|error: (401|403)|non-fast-forward|\brejected\b|conflict|diverg/i.test(stderr))
    return { state: 'STOP_AUTH_OR_DIVERGENCE', continueLocal: false, retry: false };
  if (phase === 'push' && sha(targetSha) && remoteSha === targetSha)
    return { state: 'DELIVERED_VERIFIED', continueLocal: true, retry: false };
  if (remoteRelation === 'diverged') return { state: 'STOP_AUTH_OR_DIVERGENCE', continueLocal: false, retry: false };
  if (phase === 'push' && remoteSha !== undefined && remoteSha !== null && (!sha(remoteSha) || !sha(targetSha)))
    return { state: 'STOP_INVALID_EVIDENCE', continueLocal: false, retry: false };
  if (phase === 'push' && exitCode === 0 && !remoteVerified)
    return { state: 'LOCAL_PASS_REMOTE_UNVERIFIED', continueLocal: true, retry: false };
  if (exitCode === 0 && phase !== 'push') return { state: 'COMMAND_PASS', continueLocal: true, retry: false };
  if (/schannel|close_notify|ssl.*(connect|handshake|error)|tls|failed to connect|could not connect|connection.*reset|connection.*timed out|recv failure|eof|timeout/i.test(stderr) || (phase === 'push' && exitCode === 0))
    return { state: remoteVerified ? 'LOCAL_PASS_REMOTE_NOT_DELIVERED' : 'LOCAL_PASS_REMOTE_UNVERIFIED', continueLocal: true, retry: false };
  return { state: 'STOP_UNCLASSIFIED_FAILURE', continueLocal: false, retry: false };
}
