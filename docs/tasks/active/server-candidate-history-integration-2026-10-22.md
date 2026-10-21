# Candidate history integration and delivery reconciliation

2026-10-22. Root is the sole writer; the existing independent reviewer is read-only.
Main was independently reverified as `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Branch `chore/server-candidate-history-integration` starts there and fast-forwards
clean input `7ac59413d5b55b0aa31962f6952a8c635b166c38`. No inherited dirty changes.
This is a local validation merge, not a GitHub PR/main merge or deployment.

## The missing original history

Eight open draft PRs120–127 have their own successful checks. Seven exact heads
were already ancestors of7ac. PR126 head
`956921f63ba3069c059ca64c2324edbc33afefd8` was not, although its guard script,
guard tests and feature document had exactly the same Git blobs. Copying those
files alone does not preserve its original commits and was not grounds to close the PR.

An actual merge-tree preview found exactly four document conflicts: CURRENT_STATE,
AI_HANDOFF, PROJECT_INDEX and release/baseline.json. The no-ff/no-commit merge
confirmed exactly that set. All213 incoming evidence objects were already present
unchanged in the current261-record manifest. Conflict resolution keeps the newer
current state/manifest and archives both parents' three state summaries as exact
Git blobs under `../completed/2026-10-22-history-integration-inputs/7ac59413/` and
`956921f6/`. All55 capabilities, pages, CSS, routes, runtime snapshots and frozen
records remain unchanged. No original migration or evidence hash is rewritten.

The incoming branch adds only its original task and two old input summaries;
application/tool/test blobs were already identical. This phase adds recovery
documents/archives and the actual merge parent so that all eight PR histories can
be proved, without changing application behavior. The committed merge's parents,
every PR ancestry, full non-doc tree equivalence and precise release guard must
be checked after commit. Local release tests/review are not yet complete here.

## Git failure now identified at the message level

The prior7ac persistence slice passed8 actual-image,22 ops and116 release checks,
with a clean precise guard. A fresh read-only diagnosis confirmed one trusted
origin/push URL, standard all-heads mapping, no pre-push hook or custom receive
command/mirror/follow-tags/submodule behavior, and no current target/packed-ref
lock. All three existing bounded network contrasts passed. These observations
alone did not explain an earlier failure or authorize unlimited retries.

Remote a296 was exact but its local tracking ref was absent. One ordinary,
non-forcing exact-ref fetch created that tracking ref at the independently verified
SHA (3172ms/exit0), with no HEAD/dirty/config/authentication change. The first local
precondition used show-ref's missing-ref exit incorrectly and stopped before any
fetch; the successful command instead requires successful for-each-ref enumeration
and an exact ref match. No failure was converted into absence proof.

One receive-pack dry-run for the new7ac checkpoint then passed (2269ms, one exact
new-ref plan, actual pushes0). Under the standing safe-recovery authorization,
the original deliver/runCommand was called once, unchanged, with a reviewed
observation wrapper. Its first diagnostic-read P2 was fixed before use; a failure
inside complete observation now cannot interrupt the original runner/result or
independent verification. Five offline scope/privacy/failure tests passed.

The actual push returned exit1/STOP_AUTH_OR_DIVERGENCE in6538ms, but original
postflight and a separate GitHub API read both proved exact7ac. No repeat push.
Structured output localized a target remote rejection but redacted its unknown
reason. A finite set of standard Git error templates was then checked offline
against the previously captured full stderr SHA256 and byte count. Exactly the
target-reference-already-exists template matched both complete messages:

- 7ac:340 bytes, SHA256 `ac770c5cc1c4022ade9d59977d5591cce4a62d230ece1699cc6ed2ef74115b34`.
- a296:334 bytes, SHA256 `a9fa4719da4adf15022e3437f3ec696f3f4f3083b0d92703ff3fe244e7061891`.

Thus these two processes reported `cannot lock ref` / `reference already exists`
for their exact destination heads, not an authentication or TLS message. This
does not identify who/when/where created the ref or prove a permanent transport
repair. No raw output, secret, URL credential or private path was persisted.
Independent static review verified the exact template/hash method and limits.
The original STOP/exit1 receipts remain unchanged. The original tool's subsequent
DryRun independently returned DELIVERED_VERIFIED/exact7ac/pushes0; that is a new
readback reconciliation, not a rewritten push result or permission to force.

## Exact remote CI and remaining boundary

After independent exact7ac verification, the three allowed acceptance workflows
were each dispatched once, attempt1: source39673330905, team-access39673338812,
baseline39673344242. Their statuses are separately observed in ignored
`outputs/git-reference-diagnosis/`; do not claim terminal success until verified.
No cumulative implementation PR was created, and no existing PR was updated,
merged or closed. Git writes after the reconciled checkpoint remain bounded;
the source of duplicate ref creation remains unresolved.

No real Source/credential/candidate read, account/Browser/business DB change,
existing environment upgrade, scheduler, retirement, 50426 cutover or deployment.
Num/outdate is already confirmed. The pending exact-source quota and three closing
decisions are not defaulted. The complete Goal remains active. This local graph
integration does not promote capability merge/deploy/user-acceptance dimensions.
