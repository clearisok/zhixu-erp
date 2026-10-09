# PR #87 DeliveryPlan integration Gate

Started 2026-10-09; completed local engineering 2026-10-10 (Asia/Shanghai). Repository `clearisok/zhixu-erp`; sole integration worktree `D:\workspace\zhixu-order-b`, branch `feat/order-c43-delivery-plan`. Existing [C4.3 domain delivery](2026-10-09-order-c43-delivery-plan.md) and D-083/D-100 remain authoritative; this is integration, additional verification and a synthetic API demo.

## Gate 0 — verified baseline

- Read AGENTS/context, current feature/rules/decisions and executable migrations/repositories/services/API/tests. `git worktree list --porcelain` confirmed this branch belongs only to the dedicated order worktree. Initial status clean; HEAD and freshly fetched remote branch both `cb202db33cea06fbe0a917b33a49daf0e03222c1`.
- Fresh main `49a82c9f970e158ded589300b4aa04fc4c809038`; #84/#85/#86 merged, #88 independent and open. Final validation fetch still confirmed this main. No other worktree changed.
- Existing 0009 and domain already implement stable rows, permanent collection ownership, exact quantities/CAS, narrow session API, internal source refresh and append-only atomic audit. No duplicate implementation or business decision was needed.
- Gaps: DeliveryPlan absent from regular `test:postgres`; original upgrade fixture covered only 0001–0003; source/user concurrency randomly selected a winner; audit rollback checks omitted raw colors/terms/links/logs; no checked developer API demonstration.

## Gate 1 — ordinary main integration

Normal `git merge --no-ff origin/main`; only `docs/AI_HANDOFF.md` conflicted. Manually combined sections, without whole-file ours/theirs. Checked automatic CURRENT_STATE/PROJECT_INDEX merge, corrected #84 merged status and preserved its executed deployment/backup/read-only acceptance evidence, #85 Source/Bridge conclusions, #86 D-099 UI and #87 C4.3. Imported main code/tests reviewed; forbidden Quote/Source/Bridge modules have no task delta against main.

Checkpoint `c976b89441af0aa6b8d6073817a1a2b64f5d10f9`. Push returned ref-lock reporting the target already at that SHA; one read-only `git ls-remote` confirmed exact delivery, without blind retry/force. No unresolved conflicts. No reset/rebase/clean/real deployment.

## Gate 2 — coverage and one bounded audit fix

- `npm run test:delivery-plans` runs only the DeliveryPlan integration file. `test:postgres` now includes it; ordinary `npm test` retains its Docker-free entry.
- Nonempty 0001–0008 database: real synthetic order, two colors, exact amount/zero labor commercial terms and association, source link/mirror, trusted logs, eight ledger rows. Applying 0009 preserves full business snapshots and every prior ledger field/checksum/time; only 0009 is added, rerun skips, no old collection/row is backfilled. Legacy manual ownership starts at version zero and is claimed explicitly.
- Wrong source ID/BillNo, old fetchedAt and missing `ainuoke.sync` reject without any mutation.
- A test-only Pool proxy waits after the actual root `SELECT FOR UPDATE`. The second transaction is observed blocked with `pg_blocking_pids`; releasing the first explicitly covers user-first, source-first and source/source. Each asserts the designated winner, loser 409/code, stable ID, exact ownership/source/version and only one new audit. Timers observe lock arrival; they do not pick winners. Production has no test hook.
- Trusted audit FK failure is intentionally reached after mutation. Raw snapshots of roots, source links/mirrors, colors, terms/associations, logs, plan sets/rows compare equal after both manual and source command rollback. Source failure attempts changed date/quantity/inside number/colors; failed manual command attempts a new row/ownership transition.
- Existing 0/default quantity, manual zero rejection, null restoration, stable IDs, same-value intervention, void history, permanent ownership, exact fractions, CAS/RBAC/session/spoof boundaries remain covered.
- Demo discovered source audit ISO date shifted one day through the legacy Date-based SalesOrder DTO in local timezone. C4.3 audit now uses its already existing `sourceDeliveryDate` text projection before/after; regression asserts the full date/null/restoration audit sequence. No schema/decision change. Other historical SalesOrder Date DTO normalization remains outside this integration scope.

Checkpoint `7930b08`; standalone 17/17 PASS. First new test run failed because it expected version `9` rather than the runner's returned filename; assertion corrected and all reruns passed. One local editing command also hit a Python default-encoding error before its second edit; UTF-8 editing resolved it. Neither affected real data.

## Gate 3 — disposable API demonstration

Driver: `scripts/demo-delivery-plans.ts`, command `npm run demo:delivery-plans`. Reuses `startDisposablePostgres()` with PostgreSQL 16, random container, tmpfs, dynamic loopback DB/API ports. No environment configuration or real DB URL is loaded. Internal services create/refresh only synthetic sources. Synthetic user logs in through the real session API; all human mutations use PATCH and displayed snapshots use GET. Credentials/cookies are omitted.

| Step | Source | Active human/default plan | Ownership | Total | Signed difference | Quantity evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 11-01 / 100 | 11-01 / 100 | source_derived | 100 | 0 | matched |
| 2 | 11-01 / 100 | 11-05 / 100 | user_managed | 100 | 0 | matched, date drift |
| 3 | 11-10 / 120 | 11-05 / 100 | user_managed | 100 | -20 | short 20 |
| 4 | 11-10 / 120 | 11-05 / 40 + 11-15 / 60 | user_managed | 100 | -20 | short 20 |
| 5 | 11-10 / 120 | 11-05 / 40 + 11-15 / 80 | user_managed | 120 | 0 | matched |
| 6 | 11-10 / 90 | same two IDs / 40 + 80 | user_managed | 120 | 30 | excess 30 |

Four boundaries plus exact fraction check pass: no initial date/no later fabricated row; system zero accepted/manual zero HTTP400 leaves state untouched; null default restored with original UUID; two old-version API requests yield exactly 200/409 and one version increment. PostgreSQL NUMERIC computes totals/differences as decimal strings (including `0.000000000000000001`), without JS floating point arithmetic. Each snapshot includes source, row IDs, ownership, version, precise quantities and trusted OperationLog.

[14 checked snapshots, PASS and explicit cleanup evidence](../assets/pr87-delivery-plan-integration/README.md). Final run API port 49688, container `zhixu-pg-it-eeb5e1c590d1`; API/pool closed, only its container removed and exact-name absence checked. Checkpoint `151528d926d00e6c6b25b9285c09e85282c210a6` pushed.

## Gate 4 — this run's validation

| Command | Current result |
| --- | --- |
| `npm run test:delivery-plans` | PASS 17/17, zero skipped |
| `npm run test:postgres` | PASS 152/152, zero skipped; includes DeliveryPlan and SalesOrder/Quote/terms/bootstrap/activation/attachments regression |
| `npm test` | PASS 679/679, zero skipped |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run server:build` | PASS |
| `npm run build` | PASS, 41 routes; non-failing existing chunk-size advisory |
| `git diff --check` | PASS |
| `npm run demo:delivery-plans` | PASS, 14 state assertions and cleanup PASS |

All entries executed in this integration; original 87/87 or 674/674 are historical evidence only. Gate 4 leaves no required NOT RUN verification. Formal UI acceptance, real Ainuoke integration, real migration/production tests/deployment were not performed and are outside scope. No win01/18443/18444, old 3000–3002, credentials/COS/backups/business database, candidate images or user data was accessed/changed.

## Release compatibility and next Activation Gate

0009 is forward-only and not a drop-in app-only release. The new application with 0001–0008 DB fails verify-only startup due to pending 0009; a pre-0009 application with upgraded DB fails migration integrity because its migration directory lacks the ledger's 0009 file. Bypassing verification would also leave old source writers unaware of new collection/CAS/audit rules and triggers. An image-only rollback is therefore not a compatible rollback. Schema-only/no backfill does not remove this two-direction mismatch.

Proposed separate Activation Gate: explicitly identify/authorize target and coupled app/schema release; inventory exact ledger/checksums and writers; freeze writes; take and independently restore/verify a complete backup; rehearse populated upgrade, absence of backfill, trusted API, source/audit behavior and coordinated rollback on disposable restored copies; define post-upgrade write handling and rollback limits; activate 0009 once with matching application, then bounded acceptance. No down migration, ledger deletion or old-order ownership inference. This proposal does not authorize activation or add an Order prerequisite to D-098 Quote-first.

## Delivery and recommendation

Existing PR [#87](https://github.com/clearisok/zhixu-erp/pull/87), original branch retained. Gate 1/2/3 checkpoints delivered; final Gate 4 documentation checkpoint follows this report. Final fetch main `49a82c9…` is an ancestor; GitHub reports OPEN/MERGEABLE. No duplicate PR or automatic PR merge. Temporary local command logs are removed after their results/synthetic evidence are archived; remaining dirty expected empty and verified at final delivery.

Engineering integration is complete with no remaining blocker. Recommend merging #87 after review; merge does not authorize real 0009 activation. Next scope is the separate Activation Gate, then separately authorized plan UI/source orchestration; broad SalesOrder mutation remains deferred.
