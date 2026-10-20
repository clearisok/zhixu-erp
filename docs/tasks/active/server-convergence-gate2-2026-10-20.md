# Server convergence Gate 2 — fixed PR integration

2026-10-20; main `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Branch `codex/server-pr-integration` was created clean from main in the sole
integrator's 7bf3 checkout, then explicitly fast-forwarded to Gate 1
`add2d690a9c3afe6ec1a2633551eaef7dee72ce1` (draft #125). The live empty target binds
immutable ops, not this checkout. No inherited dirty changes or other worker edits.

## Frozen dependencies and boundary

- #120: `57daca3d3f23f39f0aafff57502f490206b10084`.
- #121: `4e075115b0721a6fd807d61d40e3e505de119e4b`.
- #122: `349a84585f50a0a0779d56e4b56127b6cec0e329`.
- #123: `ebe4cb16c8f5ea65df6243d8a5627094c6f62da1`.
- The 121→122→123 ancestry is verified; merging the exact #123 head preserves all
  three original histories. #120 is independent and merged first.
- No automatic GitHub merge/close, deployment, old-entry cutover, account change,
  historical import or new real Ainuoke access. Combined testing uses new synthetic
  fixtures. Gate 1's zero-business persistent candidate remains unchanged.

## Shared document and evidence convergence

The first #120 merge automatically applied its application changes; conflicts
were only CURRENT_STATE, AI_HANDOFF, PROJECT_INDEX, BUSINESS_RULES and baseline.json.
Both source state summaries are archived byte-for-byte under the dated input
archive. D-147 is retained alongside #120's D-145 rule cleanup. Evidence IDs and
all original fields from both manifests are unioned unchanged.

The existing guard enforces linear document revisions, but Gate0's D-147 and
#120's stabilization both supersede the same frozen decisions record; #123 adds a
third parallel revision. A new single-parent record cannot close the other branch.
The independent reviewer confirmed that rewriting or dropping any original edge
would lose history. This is a real integration limitation, not a business failure.

Implement only explicit document mergeOf nodes, mutually exclusive with supersedes:
all predecessor paths/kinds/IDs must match, no redundant/cyclic edges, actual merge
commit and all Git ancestors verified, all parent-branch evidence retained, one
final document leaf. Existing screenshot/approval/status/UI/source protections
remain. Preserve every intermediate blob/hash. An unclosed fork stays a failure.
First commit the actual merged document checkpoint, then append its frozen node.
Tests must use real synthetic Git branches as well as existing negative fixtures.

## Status

#125's three Hosted CI checks are successful at the independently verified
`add2d690a9c3afe6ec1a2633551eaef7dee72ce1`. The one authorized recovery upload is
already consumed; no repeat upload was made. The tool's contradictory status
classification is preserved, not interpreted as a permanent network repair.

The real #120 merge checkpoint is `eb3a2833eaa9fe93f7ef8d3ab3014607fa548327`.
The old guard rejected the unclosed parallel evidence, as expected. All original
217 records remain unchanged; a new document merge node binds the exact merged
DECISION_LOG Git blob. Its actual parent commits and each parent manifest are
checked, including side-only evidence not yet on main.

The first expanded baseline run passed 111/112 tests. Its sole failure was a
fixture inheriting a parent's mergeOf while adding supersedes; the helper now
explicitly removes the inherited merge form. Independent review also caught a
screenshot anchor/cycle regression in the initial DAG extension. The original
single-parent screenshot check is restored with legal two-generation, cycle,
unanchored and prohibited-merge cases. The reviewer statically confirmed the fix.
The complete expanded suite then passed **116/116**, zero failures/skips/cancellations
(335956 ms). Syntax, focused lint and the exact main-996 production source/evidence
guard passed (11 pages/46 capabilities/one inherited #120 UI file). No new UI or
schema behavior was added by this tooling correction. No combined Gate PASS or
#123 integration is claimed yet; those are the next dependent step.

The guard checkpoint is `a12825ef829213a58306563e49de704d34ee4b2e`.
The exact #123 head was then merged with no-ff/no-commit. Application/SQL/API/test
changes applied without conflict; only the three shared state documents,
DECISION_LOG and baseline.json needed reconciliation. #123's original state,
handoff and index are archived byte-for-byte. D-146 is retained alongside the
already reviewed D-145 cleanup and D-147. The manifest retains all 219 source
records unchanged and the two approved role/user route additions. Its second
parallel document branch intentionally remains unclosed until the actual merge
checkpoint is committed and a new mergeOf proof binds that Git blob. Combined
tests have not run yet; no runtime or business data is changed by this merge.
`git diff --cached --check` reports ten existing extra EOF blank lines in exact
#123 source files (including 0031). Each is verified unchanged against the input
Git blob; this integration does not rewrite an already-used migration or unrelated
source merely to silence those inherited formatting warnings. Conflict-resolution
documents are checked separately; byte-exact historical archives are preserved.

The second real merge is `7eb63602cdb51c043414deabe4d3afed59a1e72d`, with exact
parents a12825ef and ebe4cb16. Its new document merge node binds the merged
DECISION_LOG and both previous leaf IDs; 220 total evidence records retain every
original field from both parent manifests. Application/schema changes remain the
reviewed #120/#121–123 changes. Types/server compilation, lint and complete source
regressions are now running; isolated SQL/API and built-browser acceptance follow.

## Combined validation and delivery shape

At source checkpoint `de73e611083d8cdc42b4447fa7ce67d93fd94095`, types, Node
compilation and full lint passed. The complete root suite passed **920/920**,
including all 116 release-baseline/responsive cases (463315 ms). The explicit
Server/session/snapshot build passed. The exact main-996 guard passed with
17 changed UI inputs, 11 pages and 46 capability records; original approval and
status protections are unchanged.

Actual production-built Chromium passed 8 team/settings/log, 7 business-source,
6 order-sale, 8 processing-push, 13 bound-source/material and 10 login cases:
**52/52**. The session/quote-client suite separately passed **112/112**. Screenshots
under ignored outputs/server-convergence-g2-browser show the desktop business log,
105-event complete operation details and 390px password dialog; these were visually
inspected, not claimed as user acceptance or new frozen approvals. Only synthetic
accounts, temporary profiles and uniquely owned disposable databases were used.
The default Browser build also passed. All ten selected backend/integration
commands passed: team-access 33; business-operation-logs 12; full PostgreSQL 261;
business-source 9; order-commercial 31; order-sale-adjustments 12; processing-push
13; payment-operator 21; payment-store 19; historical preparation compatibility 23.
That is **434 passed** checks, zero failures/skips/cancellations; each database
fixture owns its temporary resources. No real source request is involved.

Independent static review verified the #120 color/source implementation and tests
against exact 57d blobs; #123 auth/permissions/log code against exact ebe blobs;
219 original evidence records, the new merge-node hash and three byte-exact input
archives. No new implementation blocker was found. Three stale current-state
sentences were corrected; PERMISSIONS no longer describes the implemented log as
future work. Gate2 local engineering is PASS. Current persistent 62426 remains
the original empty Gate1 image; there has been no target migration/cutover. Remote
combined CI, individual PR merges and user acceptance remain separate pending work.

Gate0 explicitly prohibits a duplicate cumulative implementation PR. Preserve this
branch as the fixed combined verification reference. The necessary document-merge
guard will be extracted by exact paths into a minimal independent tooling PR from
main 996 (not by wholesale cherry-picking a12825ef, which includes integration
state and business evidence). It needs its own pure-main validation. Existing
#120–125 stay unchanged in this verification phase and are not merged/closed.

If remote delivery is authorized and verified, only the three named acceptance
workflows (source, team-access, release-baseline) may be dispatched on the combined
reference; never the production-deployment workflow. Verify main, branch and each
run.head_sha independently. Dispatch has no PR base, so its baseline job does not
replace the explicit exact-main guard. Later user-approved individual PR merges
still need forward integration of the then-current main and new checks; this
candidate does not pre-approve those future merge trees.
