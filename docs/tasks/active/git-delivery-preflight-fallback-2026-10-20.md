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

## Exact delivery and CI follow-up

e621ff20ccb5352feb15bab6955c95a42ebdcc59 was uploaded once and independently
verified as exact through GitHub API; unique draft PR #127. Its Git preflight
failed with exit128/3236ms, one matching-refs API read succeeded, then the normal
Git push succeeded in7878ms. Receipt remained NETWORK_DEGRADED. Its baseline
39374537705 and team39374537656 succeeded; source39374537699 failed at an
existing test in order-business-source.integration.test.ts:68, not in the tool.

That test searched the whole restricted JSON for digits120, also valid in quote
IDs, random UUIDs, hashes and dates. The Hosted log did not retain the response,
so its actual collision field is unknown. A disposable fixture quote ID ending
in120 deterministically reproduced the old assertion failure (7pass/2fail,
including the parent), without changing the production projection or grants.
The replacement checks both summary and every color's exact restricted envelopes,
absence of raw amounts/reason/snapshots, the allowed product summary, and the
authorized reader's actual price120 as positive control. The completed-order
freeze assertion is unchanged. The complete isolated source suite passed9/9
(7608ms); typecheck, compiled Node server and targeted lint passed. Independent
read-only review found no blocker. The 53/94 prior results bind unchanged tool
and baseline test blobs; they were not unnecessarily rerun for this test-only fix.

Navigation16f8d57d was not delivered on its first actual default push (TLS failure,
remote still22b50178); one separately bounded, process-only exact-URL OpenSSL+
HTTP/1.1/no-proxy/sslVerify=true recovery succeeded in2946ms and was independently
verified. No persistent config changed. Its exact acceptance runs39374706787/source,
39374709996/team and39374712862/baseline were submitted once; team/baseline passed,
source was still running at this record. This is not a claim of permanent network
repair. One normal push per invocation remains the bound; new recovery decisions
under standing authorization require evidence, never an unchanged retry loop.

The current CI compatibility checkpoint contains only that integration test and
state/task documents. It does not alter any application, permissions, SQL, formulas,
source scope, UI or deployment flow. Exact commit delivery and new CI remain to
be verified separately before a final green claim.
