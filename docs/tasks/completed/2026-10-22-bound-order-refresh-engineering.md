# Existing contract source refresh: isolated engineering evidence

2026-10-22 (Asia/Shanghai). Root implementation, existing independent read-only
reviewer. Main independently verified as
`996dfedc12da3527343cd3ff2aa5eea35497e10e`. Branch
`feat/server-bound-source-refresh` starts at main and only fast-forwards the clean
input `a29675586231806960eb5069087e705f0d0c4642`. No inherited dirty edits. The commit
containing this report freezes its exact source/test/doc bytes; later release
metadata points to that Git blob rather than rewriting this report.

## Scope proved

The existing typed source writer is reused in a caller-owned transaction. A new
offline command provides explicit preview, apply and original-request readback for
one already-bound effective SO. It consumes a formal Discovery/6087105 bundle,
not a caller-built mirror DTO, and never invokes a collector or credential loader.
No new HTTP route, scheduler, SO creator, ordinary plan editor or price writer.

Preview binds the database connection destination and actual database identity,
profile/account, source link/contract, physical source owner, effective attribution,
both SO versions, complete current mirrors, owner plan set and the full incoming
structure, including timestamps and metadata. The private file hash checks its
exact bytes separately; neither hash alone grants execution authorization.
Current/incoming color names and quantities are shown without prices. Incomplete
color enrichment fails closed and preserves accepted mirrors. New/renamed colors
do not inherit historical commercial or execution facts.

0041 adds one empty immutable success-receipt table. Actor/request identity and
exact payload serialize retries. The same transaction commits mirrors, receipt and
correlated two-event audit with actor/request operationId and sequences 0/1. A
historical response is returned before current freshness/CAS evaluation, after
fresh permissions. Unknown/absent receipts do not prove that an interrupted
commit failed. The tool never automatically resubmits or rereads Source.

Only the existing link's InsideOrderNo lookup value can update, through UPDATE of
the proved binding, without attempting a new INSERT on a historical alias. Stable
UUID, SO number, source identity and creation history stay unchanged. Existing 0018
rules keep both historical-owner and effective-root plan rows in place. Both SO
receipt FKs enter normalization's complete reference inventory and full row hash.

## Executed checks

- Final focused suite: **18/18**, 29,973.4767 ms, no skips. Real owned disposable
  PG16, actual role locks, private file ACLs and operator workflow; no real account.
  Covers read-only preview, concurrent same/different requests, actor isolation,
  lost response, exact payload conflict, expired historical replay, manual plan
  intervention, missing/invalid/nonfinite/unknown versus explicit zero, wrong scope,
  source identity regression, audit rollback, current and concurrent revocation,
  connection-destination mismatch and immutable references.
- The existing commercial adoption service creates non-empty immutable commercial
  lines. Existing production/resource services create a colored assignment and an
  actual completion record. Quantity/renamed-color refresh preserves the complete
  commercial, assignment, plan and execution rows byte-for-byte.
- A real historical source-owner test changes InsideOrderNo; alias detail,
  effective detail and boundOrders agree, source binding identity remains, both
  plan tables stay byte-for-byte unchanged.
- A protected private operator test commits successfully, deliberately fails only
  report writing, removes the original evidence file and then reads the original
  durable receipt without reopening evidence or performing Source IO.
- A populated 0040 prefix upgrades only 0041, with zero receipts and exact old
  user/role/order/link/mirror/plan/audit rows retained; repeat migration is empty.
- Related adapter/binding/DeliveryPlan/attribution/full-inventory/private-operator
  regression: **81/81**, 77,133.6516 ms, no skips.
- Project tests: **927/927**, 205,784.0508 ms. Types, zero-warning lint, Node build
  and frontend production build passed. Final changes are backend/test/docs only;
  no new pixel/browser acceptance was run or implied by these builds.
- Full existing PostgreSQL suite: **269/269**, 220,974.4305 ms, no skips. Includes
  Quote/versions/confirmation, attachments/S3, trusted sessions/RBAC, commercial
  permissions, activation/upgrade and original DeliveryPlan regression. Only new
  owned synthetic fixtures were used; their cleanup follows the existing helpers.
- Precommit release guard passed against the exact main above (11 pages,
  54 inherited capabilities, 80 cumulative UI paths, errors empty). This phase
  changes no UI path. Forward capability metadata and its final exact-HEAD guard
  and complete release tests are separate from this frozen application report.

Initial failures are retained in ignored `outputs/bound-source-refresh`: wrong
color-status literal, strict TypeScript findings, a fixture missing endDate, the old
alias UPSERT's new-binding trigger, and a same-value link updated_at assertion.
Those findings were fixed before the focused result above. Independent review found
and closed two P2s: connection destination absent from preview, and uncorrelated
audit events. Final static review reports no remaining P1/P2 and explicitly did not
run tests on behalf of root. No failed run is relabeled as passing.

## Independent delivery and runtime facts

At this phase, **no new remote delivery or hosted CI is claimed**. a296's three
exact-head workflows separately completed success: Source39658820783,
Team39658832008 and Baseline39658845543, attempt1. Its delivery tool's original
STOP/exit1 remains alongside independent API exact proof; root cause is unresolved.
No repeated push, authentication/TLS/shared-configuration change, new cumulative
PR, automatic merge or PR closure occurred.

Protected3001/50426/59069/62426 and every other old account, Browser profile,
database, object store, volume and worktree are unchanged. Public-only62426 health
and build readback still identify old Gate1 commit
`8175f6280d54b6d4af28cb2ebe6d86741b906b9d`; this is not new-version readiness or
50426 cutover. No deployment, existing migration, real Source request, private
candidate/credential read, binding/activation, continuous scheduling or user
acceptance. Num/outdate stays D152; no revenue, currency conversion or closing.
Pending fixed-source quota and three closing decisions are not defaulted.

## Capability dimensions

Implemented: yes, **offline bound-contract promotion only**. Merged: false at main
above. Isolated-tested: targeted result above. Deployed: not deployed to any user
environment. Human-accepted: not run. Source-activated: not connected. Normal
startup remains migration verify-only; real execution still needs exact authorized
database/source scope. Manual DeliveryPlan editing and a continuous contract
collector are separate work, not silently included in this capability.
