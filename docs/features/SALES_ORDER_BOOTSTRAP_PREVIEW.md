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
- There is still no confirmed formal server-side `order_no` policy. The Preview records `ORDER_NO_POLICY = NEEDS_USER_DECISION`; disposable PG alone uses deterministic `PREVIEW-000001` values. Those values are test-only and may never enter a real bootstrap.
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

## Final validation

- Disposable PostgreSQL integration: 13/13 PASS.
- Full tests: 584/584 PASS.
- TypeScript typecheck, zero-warning ESLint, server build, frontend production build (30 routes), and `git diff --check`: PASS.
- Style Progress benchmark was not rerun.
