# Git delivery preflight — independent evidence after transport failure

2026-10-20; main independently verified through GitHub API as
996dfedc12da3527343cd3ff2aa5eea35497e10e. Branch
codex/git-delivery-preflight-fallback starts there in a new managed worktree,
clean, without inherited edits. One root implementer; existing reviewer read-only.
This is an isolated developer-tool repair, not a cumulative Server business PR.

## Observed facts and uncertainty

The navigation application remains at 16f8d57daf900802a2f3b6c3c41d878dbd6cdd9f;
its last remote SHA was 22b50178c68224ec47b6f149f599d8a3c799f2c3. Several existing
tool invocations stopped in Git preflight, pushes=0. A diagnostic dry-run copy
observed actual Git exit128/3188ms/empty stdout and Schannel/TLS handshake failure;
raw stderr never left process memory. Direct exact-ref reads and a full, unmodified
deliver(execute:false) also succeeded at other times. This is intermittent transport
evidence, not proof of a PowerShell/Node entry defect or permanent root cause.

Bounded process-only TLS/HTTP and exact-URL proxy contrasts did not establish a
stable fix. One local environment assembly error stopped before network/tool
execution; it is not a transport or push failure. Temporary settings did not
persist in later processes. Shared config, trust, authentication and TLS validation
were unchanged. Detailed redacted reports remain in the original ignored outputs.

## Repair and preserved boundaries

- Preserve Git-first preflight. Only uncertain transport or timeout permits one
  independent matching-refs read through the existing gh authentication, pinned
  to github.com and clearisok/zhixu-erp. Never repeat the failed Git read.
- Accept exactly one valid exact commit ref. Successful empty JSON array proves
  absence; 404, malformed data, duplicate exact refs and a nonempty prefix page
  without the target do not. Never infer absence from metadata visibility.
- Retain trusted origin/push URL, branch/HEAD/object, dirty fingerprint, actual
  ancestor and fresh local-state checks. Normal exact-SHA Git push remains at most
  once and non-forced. Postflight is independently verified; no file API uploads.
- Share certificate/hostname identity detection between preflight and postflight;
  identity, configuration, authentication and divergence failures remain STOP.
- Save safe phase, category, exit code and timing. No raw errors, tokens, proxy
  values, auth helpers or environment dumps enter receipts. API-assisted recovery
  retains NETWORK_DEGRADED rather than claiming the Git path is permanently fixed.

## Validation and delivery

Earlier synthetic suites passed 42/42 and 49/49 at their respective checkpoints.
Review additions cover SNI/hostname identity, normal certificate-related branch
names, identity/permission errors followed by timeout, real sibling divergence,
missing objects, changed local files, malformed/prefix/404 evidence and absent gh.
Final suite passed 53/53 (139178ms); negative baseline passed 94/94 (302015ms),
both Node syntax checks, changed-script ESLint and exact-main guard passed (0 UI
paths). Read-only final code review found no remaining blocker and did not execute
tests or network. The fixture tests perform no real network calls or Git pushes.

Separate real read-only checks of matching-refs returned exactly the existing
22b50178 navigation ref and a successful empty array for this not-yet-created tool
branch. This validates response shape/absence behavior, not delivery. The baseline
workflow now runs these isolated tool regressions, retaining the Windows-only
PowerShell-entry check's explicit platform skip on Linux. No deploy workflow changed.

Final commit/remote delivery and fresh CI are still pending at this record.
After local PASS and review this tested tool may deliver the exact
navigation SHA. Each target gets at most one actual push, independent remote
verification and the named acceptance CI; no repeated failed transport loop.
Unique tool draft PR and any CI conclusions require exact delivered evidence.
No merge, deployment, real database/account/source operation or old-asset deletion.
