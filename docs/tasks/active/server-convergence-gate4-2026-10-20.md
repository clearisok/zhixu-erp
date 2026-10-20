# Server convergence Gate 4 — trusted order read chain

2026-10-20; one root implementer in7bf3, existing independent reviewer read-only.
Main reverified through GitHub API:996dfedc12da3527343cd3ff2aa5eea35497e10e.
Branch codex/server-order-source-readchain starts clean at that exact main and
explicitly fast-forwards to accepted navigation16f8d57daf900802a2f3b6c3c41d878dbd6cdd9f.
No inherited dirty edits; no change to existing runtime checkout or databases.

## Accepted inputs and separate tool follow-up

Gate3 exact16 is independently delivered. All three workflow_dispatch checks are
completed/success with that exact head:39374706787/source,39374709996/team,
39374712862/baseline. Local application source remains ed5821ba6b15a471c283f94e40f9a1e4257c3658;
927 project including116 baseline,158 related client/API, one71-case browser run
and separate36 source-page checks passed. Source16 differs only in test/docs since
that application build. Historical failures/cancellations remain in the Gate3 task.
The three previous state documents are archived byte-for-byte under
completed/2026-10-20-gate4-inputs/navigation-16f8d57d/.

Independent tool draft#127 is5a9a2c7e7bd7a73f2e55c77dd697d5a5938d3a3b, exact remote
verified. Its tool53/baseline94 and source projection9 checks, types/Node/lint,
exact guard and read-only review passed. Its first e621 source CI exposed an old
whole-JSON digit120 assertion; deterministic harmless-ID reproduction and stronger
field-based correction are documented in the tool task. New5a9 CI39375799649/source,
39375799693/team and39375799568/baseline completed: source/baseline succeeded; team
failed in a read-only login readiness observation during a CDP navigation context
change. The isolated tool worktree is fixing that bounded test wait, not application
behavior. Do not call all three green, merge the PR or copy its shared summaries.
The navigation validation ref has no cumulative business PR. Existing120–126 heads
remain unchanged and all120–127 are draft/open; no merge/close is authorized.

## Read-only audit facts

- Formal6087105 adapter and mapColors already preserve reportId, exact contract
  number, sizeRule, slot-ordered sizeAllocations, sizeMatrixStatus and pending/null
  quantity evidence in color source_metadata. repository.ts currently discards
  these fields from the public color DTO; the detail says sizes are not connected.
- Add only a typed allowlisted projection of that saved evidence. No raw metadata,
  hash, arbitrary extra keys, source credentials or commercial snapshot leaves it.
  BillNo/SalesContractNo stays identity; mutable InsideOrderNo is not a join key.
- The saved metadata does not contain all26 raw slots/sizeValuesValid. Preserve
  the adapter's recorded matrix status; do not recompute full business validity
  from the partial allocation array. Structural evidence errors are separate.
  A business mismatch/overflow never deletes an otherwise valid color.
- Color tables have no independent fetch time. Contract fetched_at is the maximum
  of the saved Discovery/color batch page times. Never label it as each color's
  last read or infer a10-minute expiry; material/payment TTLs remain independent.
- DeliveryPlan GET already enforces trusted session/order.view, uses one statement
  snapshot, keeps collection version/ownership/void history and decimal strings.
  PATCH has CAS/audit but no request ID or unknown-result receipt. No new editing
  UI or automatic replay is safe in the first read-only slice.

## Ordered slices and allowed scope

1.4A: validate saved color/size metadata into a typed Server detail DTO and prove
  contract→SO→colors/sizes→existing material/plan reads on disposable fixtures.
  Legacy or absent evidence remains unknown; original null/explicit zero/pending
  zero remain different. Preserve slot order, null allocations, duplicate display
  labels and recorded overflow evidence. No new source reads or migration.
2.4B: reuse existing detail/table/Foundation patterns for read-only sizes and the
  existing DeliveryPlan GET, with local loading/error/retry and identity-scoped
  stale-response protection. No new navigation/density/model; submit exact UI path
  impact before checks. Any actual V2/V3 redesign waits for concrete approval.
3.4C: if adding plan editing, first extend the existing domain with explicit
  idempotency/receipt reconciliation, not a parallel writer. It remains a separate
  implementation/acceptance checkpoint. Do not claim Gate4 complete from4A alone.

Expected owners: server/sales-orders/model.ts, repository.ts and a pure evidence
projection; existing order-center Server DTO/client/query and detail/color display;
focused integration/unit/browser tests; current order/source feature and release
documentation. Root alone owns shared app/migration/permission/state files.
No schema, source adapter formulas, catalog/permission expansion, source activation,
new refresh command, commercial price writer or Browser repository/storage changes.

## Acceptance and runtime protection

Cover missing/legacy/malformed/oversized evidence, exact identity and drift,
pending/null/zero, matrix mismatch/overflow/order, source quantity change, concurrent
source/read snapshots, stable commercial color references and hidden monetary fields.
Session401/403, revocation, absent order, processing without fictitious Ainuoke
data, historical source ownership and late responses must fail closed. Keep typed
source evidence and manual DeliveryPlan ownership separate; never reallocate plans.
Run focused SQL/API/client, project/types/lint/Node/build and exact baseline checks;
actual built Chromium for UI slices; independent review and exact-head CI.

At the initial16f8d57d baseline, no4A implementation or new tests had run. Isolated data only.
Readonly environment check found3001/50426/59069/62426 still listening and the five
Gate1 containers healthy on image zhixu-persistent-local:8175f628-20261020. No fresh
business-table count or runtime upgrade is claimed. No merge, deployment, real
account/business-data/source operation, scheduler, cleanup or asset retirement.

## 4A implementation checkpoint (local, not Gate4 completion)

Baseline documentation checkpoint5a2a8bc0ba81f5b44e80c6b59af11e52443fabec was
clean. Root alone changed the typed evidence projection, order detail SQL and
Server DTO/GET helper, existing plan comparison, tests and source acceptance CI.
No UI component, schema, price writer, permission or source adapter changed.

- Saved6087105 metadata is validated, not asserted as a DTO. Output excludes raw
  metadata, hashes, credentials, hidden prices and arbitrary extension properties.
  Known rule/slot budgets explicitly return evidence_too_large without truncation.
  Pending source null, explicit zero, unchanged slot gaps and repeated names remain
  distinct. Recorded matrix anomalies do not discard valid colors or recalculate
  quantity. Processing has not_applicable evidence and no fabricated Ainuoke plans.
- Contract color summary exposes only recorded status/drift/batch time; array or
  object status coercion found in review was corrected to strict string validation.
  It never reports freshness or a per-color fetch time from the batch maximum.
- A plan source comparison now requires exact source-link/mirror ID and BillNo.
  Review found that a normal JOIN could duplicate rows with an extra unmatched
  historical link; EXISTS preserves one plan result. The order read's lateral
  link selection likewise prefers the exact mirror match, otherwise requires a
  sole candidate. It does not guess among multiple unmatched historical links.
  Owned plans and each order's commercial terms remain untouched.
- The new read helper performs one no-store, credentialed GET to the existing
  DeliveryPlan endpoint. It preserves decimal strings, null/date/void history and
  typed401/403/404 errors; no PATCH, retry or Browser fallback is added. Detail
  and plan are still separate requests/snapshots.

New targeted suite24/24 passed (11179ms). It includes eight pure evidence cases,
seven client/adapter cases and a disposable PostgreSQL parent with eight child
cases: formal contract→colors/sizes→materials/plans, seven roles without money
permissions, malformed/foreign/large evidence, source absence, invalid initial
identity, extra historical link, a controlled RR concurrent refresh, and session
revocation/404/invalidID. Fixture failures were corrected, not hidden: the material
contract is nested under progress.order;0022 correctly rejected source-ID mutation,
so the negative fixture now creates an invalid initial association in a transaction
without disabling any trigger; mirror insertion already initializes a plan set.

Five existing domain suites70/70 passed (68437ms): DeliveryPlan including legacy
0009 upgrade/concurrency/audit, effective attribution/current-vs-history, processing
batch lifecycle, first binding/material reads, and PostgreSQL foundation/API.
Types and compiled Node passed. One unsafe optional assertion in the new test was
caught by lint and corrected; final lint/project/build/guard/review remain pending
at this checkpoint. No new actual-browser result is claimed for4A yet.

Independent tool37bd0e1e81810f46c1972f37630dc99b7fc9b18d is now exact remote and
PR127 remains draft. Two earlier bounded attempts failed (direct TLS timeout and
default transport failure), each independently proving remote still5a9. A read-only
contrast observed the configured-proxy/OpenSSL/HTTP1.1 profile pass; one separately
bounded process-only recovery succeeded, with TLS verification on and no persistent
config/auth change. Final exact37 CI39379407326/source and39379407265/team are
running;39379407269/baseline succeeded. Do not claim all green or permanent repair.

### Local source checkpoint readiness

The full project suite passed927/927 (366484ms), including the116 existing
baseline/responsive checks; final lint passed with no warning, types/Node compiled,
and the exact-main guard passed (38 UI-scoped paths cumulatively, only two new
read DTO/helper paths with V0/no visible change). Independent second review found
no remaining blocker after strict summary typing and source-link cardinality fixes.
No new image, runtime, UI component or database upgrade has occurred. A clean
source checkpoint precedes exact-SHA Browser/Server builds and the explicit
baseline command; those later checks are not claimed by this checkpoint.

## 4A local acceptance and tool forward integration

Clean application sourcea1879b70dde94d9670f33da476732157e48c9443 produced both
Browser-compatible and explicit Server/session/snapshot builds. Build metadata was
saved separately; no running environment was upgraded. The actual built P6
Chromium suite passed13/13 (63668ms) with seven roles, six viewport widths,
no Browser fallback, refresh/failure and identity/unsaved-write boundaries.
The explicit npm run test:release-baseline passed116/116 (351371ms), in addition
to the927 project suite. Full types/compiled Node/lint and exact-main guard passed.
Independent second code review found no blocker.4A is local engineering PASS;
4B display and4C optional protected editing are not implemented or claimed.

Tool37bd0e1e81810f46c1972f37630dc99b7fc9b18d is independently exact remote and
all three checks completed/success (source39379407326/team39379407265/
baseline39379407269). Unique PR127 stays draft/open. Its forward merge preserves
both original histories; this is a local task-branch integration, not a main merge.
Conflicts are limited to three shared summaries, resilience history and the
commercial test. Root recovery state is retained; incoming summaries are archived.
Resilience histories are combined. The stronger full-field restricted projection
and allowed-price positive control are retained together with Gate3's recursive
numeric sentinel assertions and harmless-ID control. No freeze assertion is lost.
The corresponding SQL regression, types/lint and exact guard run after resolution.
No raw application, permission or schema conflict exists. Remote4A delivery/CI
will be reported only after exact verification; no duplicate cumulative PR.

### Conflict-resolution verification

After forward integration the combined commercial source SQL suite passed9/9
(5111ms), and the24-case evidence/API/client suite passed again (11918ms).
Independent staged-diff review confirmed all incoming tool, CI, login test and
archived summary blobs exactly match37; the business application/SQL/permissions/
manifest blobs remaina1879b70. No unresolved conflict or unowned edit remains.
Types/lint/exact guard are recorded in the merge logs before commit. Tool tests53
and prior baseline116 bind unchanged source/test blobs; no synthetic coverage is
represented as a runtime upgrade or real source activation.
