# SalesOrder Bootstrap Preview / Dry Run

## Status and safety boundary

- Phase: PostgreSQL Phase 2B2 Bootstrap Preview / Dry Run complete on `feat/postgres-salesorder-bootstrap-preview`.
- Authoritative baseline: `f424a9b78f66dffdd47075f8ff29ea5f3590717b` (`main`, Phase 2B1 PR #17 merged).
- This phase reads the current account's fixed Ainuoke Order Discovery plus reports 6086103/6086997, builds an in-memory projection, reconciles it, and proves the schema path in disposable PostgreSQL 16.
- It is not a real bootstrap or Browser Order Center cutover. Real PostgreSQL business writes, Ainuoke writes, Browser Order/Scheduling writes, Quote writes, Style Progress writes and Closing writes were all zero. Report 6087050 was not read.

## Implemented preview boundary

- `SalesOrderBootstrapCandidate` is a pure in-memory projection. It contains the Discovery/source identities, contract identity/status/dates/style, company/customer/brand snapshots, quantity, normalized color rows, stable source hashes and fetch time. It creates no UUID and has no repository dependency.
- Candidate mapping reuses the existing 6086103/6086997 adapter and normalization semantics. The typed detail client now fails closed on report/query mismatch, total drift, incomplete pages or page-limit exhaustion.
- Reconciliation groups blocking, warning and informational issues and checks source ID, source-row identity, InsideOrderNo and SalesContractNo duplicates/cross-mappings, detail failures, identity mismatches, invalid quantities and color-total differences. Status is preserved verbatim and never filters inclusion.
- Candidate ordering and `previewHash` are deterministic from normalized business/source facts. Fetch timestamps and page grouping do not create a different candidate identity.
- The stale guard performs a second complete Discovery only after all details, then compares total, normalized hash and source/identity sets. A change makes the Preview stale and prevents readiness.
- Historical Phase 2B2 had no confirmed formal server-side `order_no` policy and recorded `ORDER_NO_POLICY = NEEDS_USER_DECISION`; its disposable PG alone used deterministic `PREVIEW-000001` values. Phase 2B2.3 later supersedes that policy for new server records without rewriting this historical evidence.
- `runSalesOrderBootstrapDryRun` invokes the Phase 2B1 `createAinuokeSalesOrder` service, retries every valid candidate to prove source idempotency, performs one deliberate invalid-color rollback probe, and counts source-link/schema/log outcomes. It accepts only an explicit trusted actor argument.

## Authoritative live Preview — 2026-09-11

The final complete run observed:

- Discovery: 507 rows / 11 pages, `current_account_visible`.
- Status: `草拟=364`, `生效=143`; all 507 rows remained in scope.
- Before/after normalized Discovery hash: `95b36d6375ab8061731ef976debffa41b46995da6e8c8146b32960e9ff616261`.
- Snapshot delta: added 0, removed 0, changed identity 0; stable `YES`.
- 6086103 parity: D1935 plus nine date/status-spanning samples, 10/10 strict mapped-field parity. Strategy: `DISCOVERY ROW REUSE`; final run used 10 additional 6086103 page reads.
- 6086997 transport/pagination: 507/507 queries completed over 551 pages. Existing adapter semantics accepted 473 and blocked 34.
- Candidate scope: 507. Strict schema-projectable in-memory candidates: 473. Preview hash: `888dcdeec2237c9c95cd5eaef3007e217599c855893b6862c358b89c4aa75597`.
- Blocking conflicts: 34, all in color detail: 29 rows/groups lack required `stylecolor`; 5 results contain duplicate canonical 6086997 source-row identities. No value was guessed or silently deduplicated.
- Warnings: 26 `color_quantity_difference`; source values were preserved without correction.
- Discovery duplicate sourceId / sourceRowIdentity / InsideOrderNo / SalesContractNo: 0 / 0 / 0 / 0. Cross-identity mismatch: 0. Invalid numeric quantity: 0.

The final authoritative run used 583 successful Ainuoke report-page reads: 11 Discovery-before + 10 sampled 6086103 + 551 paged 6086997 + 11 Discovery-after. During development the same complete, stable read was run once before a local statistics-classification correction; cumulative successful page reads for this phase were therefore 1,166. An earlier request rejected locally by an outdated Bridge did not reach Ainuoke. No 6087050 request occurred.

## Disposable PostgreSQL 16 result

Only the 473 strictly projectable candidates entered the disposable PG16 tmpfs database after migrations `0001_trusted_auth_rbac_operation_logs.sql` and `0002_sales_order_foundation.sql`:

| Metric | Result |
| --- | ---: |
| Planned | 473 |
| Created | 473 |
| Rejected | 0 |
| Duplicate/idempotent returns | 473 |
| Deliberate rollback probes | 1 |
| Source-link conflicts | 0 |
| Schema rejections | 0 |
| Trusted OperationLogs | 473 |

Idempotency and rollback both passed. The container/database was destroyed immediately after the run. These writes are disposable test evidence, not real PostgreSQL SalesOrders.

## Safe sample review

Only D1935 is shown verbatim. The other nine rows are masked and omit company, customer and brand data.

| InsideOrderNo | SalesContractNo | Status | Style | Quantity | Colors | DeliveryDate | Disposition |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `D1935` | `PI2607-235` | 草拟 | `D1935` | 4,640 | 5 | 2026-10-13 | candidate |
| `2359/***-3(*****-N)` | `PI25**-075` | 生效 | `2359/***` | 5,000 | 1 | 2025-09-01 | candidate |
| `51**` | `PI25**-014` | 生效 | `MS51**` | 12,493 | 1 | 2025-11-11 | candidate |
| `42**** 常规码-22` | `PI25**-106` | 草拟 | `42****` | 11,419 | 9 | 2026-01-02 | candidate |
| `42**** 常规码-23` | `PI25**-008` | 草拟 | `42****` | 8,150 | 6 | 2026-02-05 | candidate |
| `3566/***-1(*****-N)` | `PI25**-207` | 草拟 | `3566/***` | 12,000 | 1 | 2026-03-29 | candidate |
| `57**-4` | `PI26**-100` | 草拟 | `MS57**-4` | 8,000 | 2 | 2026-06-17 | candidate |
| `42**** 常规码-26` | `PI26**-010` | 草拟 | `42****` | 6,400 | 4 | 2026-07-30 | candidate |
| `6624/***-1(*****-N)` | `PI26**-108` | 草拟 | `6624/***` | 4,000 | 1 | 2026-10-18 | candidate |
| `56****肥婆码` | `PI26**-272` | 草拟 | `56****` | 1,924 | 8 | 2026-10-29 | candidate |

## Readiness and required decisions

**READY FOR REAL BOOTSTRAP: NO.** This Preview is stable and the valid subset passes disposable PostgreSQL, but real bootstrap remains blocked by:

1. resolving or explicitly adjudicating the 34 6086997 color-detail blockers without inventing source facts;
2. confirming the formal server-side `order_no` policy;
3. confirming that `current_account_visible` is the intended organizational bootstrap scope;
4. confirming disappearance/tombstone and snapshot-retention policy;
5. a separate explicit authorization for real bootstrap after a fresh stable Preview.

Even after these items are resolved, a later phase must rerun a fresh full Preview. This document grants no authority to write a real business database, switch Browser reads/writes, or retire Browser data.

## Subsequent Phase 2B2.1 candidate-source evidence

The 34 blockers above remain the authoritative historical result of the 6086997-based Phase 2B2 run; they have not been deleted or rewritten. A later Phase 2B2.1 validation added 6087105 (成衣分色分码明细) as a fixed **candidate** garment color/size source and observed a stable 511-row current-account Discovery.

- 511/511 fixed 6087105 queries succeeded. Exact post-filtering excluded 174 `contains` false-positive rows; no cross-order contamination remained.
- 497 orders produced usable color slices, and all 497 had `sum(SizeNum) == 6086103 contract quantity`.
- Of the historical 34 blockers, 31 are resolved by clean 6087105 detail. The remaining T1829-2/T1795-2/T2017-2 results are correctly `invalid` because each contains two identical blank placeholder rows; none remains `missing` and none is quantity-warning-only.
- Eight current Discovery orders have no 6087105 exact detail and six have invalid slices. These are enrichment missing/invalid results, not reasons to reject the SalesOrder main Candidate.
- D1935, T1826-4 and 1917U anchors passed exactly. Full evidence is in `AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`.

## Subsequent Phase 2B2.2 stable identity decision

The user approved 6087105 as the formal current SalesOrder color/size source and confirmed normalized `SalesContractNo` / `BillNo` as the stable Ainuoke cross-report business association. `InsideOrderNo` is a mutable source attribute; drift under the same BillNo is informational and never an identity failure. The original 6086997 Preview and its 34 blockers remain historical evidence, not the current source contract.

The fixed 6087105 query changed from `insideorderno contains <InsideOrderNo>` to `{ salesContractNo }` → `BillNo contains <SalesContractNo>`, followed by exact normalized `row.BillNo` filtering. Fresh read-only validation observed:

- stable Discovery before/after: 511 rows, hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`, no added/removed/changed identity;
- 511/511 successful BillNo queries, 511 exact-detail orders, 0 no-detail, 1,390 exact rows and 0 contains false positives;
- 505 usable, 0 missing and 6 invalid color slices; all 505 usable totals equal their contract quantity;
- 8 InsideOrderNo drift orders. These are exactly the former eight InsideOrderNo-query misses, and all eight are now resolved by BillNo;
- PI2512-121 maps Discovery `5384/086-1(46021-N)` to 6087105 `5466/086(46021-N)`, one usable color totaling 9,000: PASS.

Missing or invalid 6087105 enrichment still does not block SalesOrder creation. Phase 2B2.2 did not generate a fresh bootstrap candidate set or execute real PostgreSQL bootstrap; its required fresh Preview was subsequently completed in Phase 2B2.3 below.

## Final validation

- Disposable PostgreSQL integration: 13/13 PASS.
- Full tests: 584/584 PASS.
- TypeScript typecheck, zero-warning ESLint, server build, frontend production build (30 routes), and `git diff --check`: PASS.
- Style Progress benchmark was not rerun.

## Phase 2B2.3 final fresh Preview — 2026-09-11

Phase 2B2.3 preserves the historical 6086997 Preview above and adds a separate `sales-order-final-bootstrap-preview.v2` path using the approved BillNo/6087105 contract.

- Fresh Discovery before/after: 511 rows / 11 pages, `草拟=368` / `生效=143`, identical hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`; BillNo blank/duplicate and added/removed/changed identity are all zero.
- 6087105: 511/511 successful BillNo queries, 511 pages, 511 exact orders, usable/missing/invalid 505/0/6, InsideOrderNo drift 8. All 505 usable color totals equal contract quantity; lower/higher 0/0.
- Candidate semantics: planned 511. Usable candidates contain full color mirrors; missing/invalid candidates remain valid SalesOrder aggregates with `colors=[]` and sanitized reconciliation metadata. SizeRule/Size1..26/SizeNum are typed evidence only; no size table was added. Preview hash: `6966d8d360118f4aa5fb8565061b0234a482d114de90f9b0fc5dc7c17337ea71`.
- Disposable PG16 applied `0001`, `0002`, `0003` and created 511/511 through `createAinuokeSalesOrder`; rejected/source conflicts/schema rejections 0/0/0, exact idempotent returns 511, trusted OperationLogs 511 and rollback probes 1. UUID/order-number duplicates were zero. Formal numbers were `SO-00000001` through `SO-00000511`; client override and mutation were rejected, and the rollback number was not reused.
- Ainuoke reads were 533 pages (`6086103` 22 + `6087105` 511); 6086997/6087050 reads were zero. Ainuoke, real PostgreSQL, Browser, Quote, Style Progress, Scheduling and Closing writes were all zero. The disposable container/database was destroyed.
- Final validation: Bridge 36/36, targeted 23/23, PostgreSQL integration 14/14, Full Tests 601/601, typecheck, zero-warning lint, server build, frontend Production Build 30 routes and `git diff --check` all passed.

**READY FOR A SEPARATELY AUTHORIZED REAL BOOTSTRAP: YES.** This historical Preview did not itself authorize or execute that bootstrap, Browser cutover, Browser retirement, legacy 6086997 deletion, or any other domain migration. The user subsequently granted real-bootstrap authorization for Phase 2B3B.2.

## Phase 2B3B.1 production runner

Phase 2B3B.1 prepares the production path but deliberately performs zero real PostgreSQL business writes and zero real sequence consumption.

- `server/sales-orders/bootstrap-source.ts` is the shared fresh-source orchestration used by both the historical disposable script and the production CLI. It reuses the fixed Bridge, 6086103/6087105 adapters and `buildFinalSalesOrderBootstrapPreview`; there is no second candidate-mapping pipeline.
- `server/sales-orders/bootstrap-cli.ts` compiles to `dist/server/server/sales-orders/bootstrap-cli.js` and has explicit `--plan` / `--execute` modes. No mode fails closed. Execute additionally requires `--confirm-real-bootstrap=zhixu` and `ZHIXU_REAL_BOOTSTRAP_CONFIRM=YES`; the named existing actor and browser-local Ainuoke user id are also explicit.
- Every plan/execute rebuilds 6086103 BEFORE → all 6087105 BillNo details → 6086103 AFTER. BillNo blanks/duplicates, query failures, candidate coverage problems or an unstable snapshot stop before writes. The resulting `previewHash` and immutable in-memory candidate array are emitted as safe aggregate evidence; raw upstream payload and credentials are not printed.
- Before 6086103, the runner calls Bridge `GET /v1/ainuoke/account` with the exact operator-supplied Browser-local `--ainuoke-user-id`. `configured=false` fails closed as `bootstrap_ainuoke_account_precondition_failed` with only configured/status/bridgeCode. PostgreSQL `app_users.public_id` is not a substitute for Browser `currentUser.id`; the runner never auto-discovers or scans stored credential identities.
- FIRST_BOOTSTRAP preflight requires the real `zhixu` database, an exact 0001/0002/0003 filename/checksum ledger, empty SalesOrder aggregate/link/mirror/log state and an unconsumed sequence. The actor must be an existing active `app_users` row with a public UUID; no fake actor, admin bootstrap or RBAC sync is allowed.
- Execute ordering is the final Preview's normalized BillNo ordering. Each candidate goes serially through the existing transactional `createAinuokeSalesOrder`; no production script DML duplicates the service. The first failure stops future candidates without destructive cleanup or sequence reset.
- Only after a complete first pass, the exact same in-memory array is replayed. Every result must be idempotent with the same UUID, order number and version, and business counts must remain unchanged. Final read-only reconciliation checks source/contract/color coverage, invalid/missing zero-color behavior, trusted OperationLog actor and exact action, UUID/order-number uniqueness, `SO-########` continuity and sequence state.
- Disposable PG16 tests cover both success and first-failure stop. They do not connect the production execute path to real `zhixu`.

The user has explicitly authorized Phase 2B3B.2 to run this bootstrap from merged latest main. The authorization remains valid unless scope changes. It does not permit B3B.1 to execute from an unmerged runner, and it does not permit Browser Order Center cutover or any Ainuoke/Quote/Style Progress/Scheduling/Closing write.
