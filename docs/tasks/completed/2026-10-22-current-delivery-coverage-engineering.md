# Current registered-fact delivery coverage: engineering evidence

2026-10-22. D147 approved Server convergence; D155 is a read-only technical slice.
Root is the sole writer; the existing reviewer performs independent static review.
No source activation, deployment, new UI or human acceptance is claimed.

## Exact input and application source

- Branch: `feat/server-delivery-coverage`.
- Independently reverified main: `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
- Clean input: `144f2a269affb41207566557f09ed06e8decf49a`; no inherited dirty.
- Application/tests/workflow checkpoint: `ff8b8d68bf25e61ea757caee90ad5a7e998d6037`.
- Documentation repair checkpoint: `0e546e2a653c1285d15b4321b105936eeaa9cbf3`.
  Its changes from ff8 are documents only; application, SQL, tests and guard match.

The original DeliveryPlan receipt phase remains separately frozen. Its exact144
remote ref and Source39685216005 / Team39685221309 / Release39685225162 all passed
attempt1. This report does not extend that earlier report or call those runs new
coverage CI. Its original push STOP and subsequent zero-push reconciliation remain.

## Implemented scope

`server/production-scheduling/delivery-coverage.ts` projects only the current
registered facts. The existing `readOrderProductionPlans` appends `deliveryCoverage`
inside its existing READ ONLY REPEATABLE READ transaction, with fresh order.view
and schedule.view. The existing execution batch is read once. No table, command,
permission, money/CCT query, Browser fallback, source query or UI is introduced.

Active DeliveryPlans group by date, retain all IDs and accumulate exact demand.
Current registered output includes cancelled original assignments. D151's existing
quantity projector excludes cancelled remainder and completed-but-unmade remainder;
only positive remaining work enters expected supply at its original planned end.
Each date cursor adds that supply once. Gap is never negative, but actual output
is not truncated. Unknown dates remain individually unassessed; no dated demand
means unassessed, and no SourceDate fallback is used.

This is not historical on-time performance, dated daily output, inventory, shipment,
revenue or closing. A single actualCompletedDate does not distribute cumulative
output into days. Shipment observations are not subtracted. Physical SO ownership
is retained even when a historical alias resolves to another effective root.

Original500-assignment /1000-active-plan bounds and the1MiB detail response limit
remain explicit failures, without truncation. Decimal strings and BigInt preserve
precision; bounded decimal representation fails explicitly. Production planVersion
does not claim to version the independent DeliveryPlan collection.

## Actually executed validation

| Check | Actual result |
| --- | --- |
| Final pure + PostgreSQL/HTTP current coverage |15/15,8389.6034ms; no skips/failures/cancellations |
| Existing execution/plan/upgrade and contracts |76/76,53630.6943ms |
| Full project |927/927,262124.4801ms |
| Independent release regression |116/116,260394.2574ms |
| Typecheck |Passed on final source |
| Full lint, then changed-TypeScript lint |Passed |
| Node and frontend builds |Passed |
| Actual-main guard after document repair |PASS,main996/head0e54,11pages/56capabilities/80 inherited UI paths,errors[] |
| Independent application review |No P1/P2; reviewer read logs, did not run tests |
| Evidence repair review |P2 closed; original263 evidence/56capabilities/other fields unchanged |

The current-phase tests use only owned random disposable PostgreSQL and loopback
HTTP fixtures; no existing DB or environment is adopted. Key checks exercise:

- Same-day order invariance and IDs, cumulative multi-date supply, exact fractional
  and large values, zero corrections, overproduction and explicit capacity failures.
- Internal/outsource output, cancelled output, completed short work, disabled adopted
  master history, missing/undated/voided plans and source dates without active plans.
- A real SQL read barrier after DeliveryPlans, another connection committing both
  demand and output, then resumed RR read: old demand/output stay together; a fresh
  read sees both new facts. This is not a mocked snapshot assertion.
- Original alias versus effective root, no money fields, fresh revoke/archive,
  trusted session GET/no-store/query rejection, no receipt/audit writes and the
  existing production client accepting the additive real HTTP response.
- A complete1000-row valid demand projection whose original facts fit below1MiB
  but full appended response does not: explicit422, no partial result or writes.

No new browser/pixel acceptance or new full270-PostgreSQL invocation is claimed.
Earlier broader results remain attached to their original sources; new remote CI
and the exact final metadata guard are recorded separately after this freeze.

## Failures retained and corrected

The first focused invocation passed11/15; its three failed children plus parent
were test mistakes: guessed table name, wrong existing permission error code, and
a sample too small to exceed the real response bound. Tests now use the actual
resource command and permission_denied plus a genuinely oversized result. Product
semantics were not weakened. The initial typecheck rejected a BigInt literal under
the existing TS target; use of the existing BigInt constructor fixed compatibility
without changing target, arithmetic or shared runtime.

The first exact-main guard failed four evidence errors: REVISION, REVISION_ANCHOR,
REVISION_LEAF and WORKTREE_DRIFT on a feature revision rooted outside actual main.
The927/116 regression passes did not prove that manifest valid. The reviewer found
the same P2. The original execution contract was restored byte-for-byte; the new
substantive contract is independently frozen at0e54 in SERVER_DELIVERY_COVERAGE.md.
Only the uncommitted rejected feature record was removed. D155 remains bound to
its real ff8 blob. No guard, old ID, screenshot, runtime or prior record was edited.
The repaired actual-main guard passed; original failure logs remain in ignored
outputs/delivery-coverage/guard-source.log.

## Boundaries and remaining work

No PR is created or changed here: this cumulative branch is a verification ref,
preserving all original PR120–127 history. No merge, close, deployment, existing
endpoint cutover, account change, business DB operation or environment retirement.
No real Ainuoke request, credential/private report read, binding or scheduler.
Num/outdate stay D152's confirmed shipment fields, not this production projection.

Old3001/50426/59069/62326/62426 and other protected assets remain. The oldf469 image
is not this source and does not contain0042; this report creates no replacement
runtime. UI consumption, dated production events, formal shipment activation,
closing decisions and broader runtime convergence remain separate incomplete Gates.
The overall Goal is active; original pending business/quota questions are not defaulted.
