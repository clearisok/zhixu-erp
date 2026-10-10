# Ainuoke Order Material Progress — isolated read-only slice

2026-10-10. ENGINEERING PASS / SYNTHETIC UI ACCEPTANCE PENDING.

## Scope and baseline

- Repository `clearisok/zhixu-erp`; dedicated worktree `D:\workspace\zhixu-order-material-b`; branch `feat/ainuoke-order-material-progress`.
- Fresh fetch origin/main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`; new branch HEAD same SHA, initial status clean. Target branch/path did not exist locally/remotely. No other worktree used for implementation.
- PR #91 OPEN, head `bb451fe1895ef48eed7a8215dd1d88acd2cc0e9f`; changed files retrieved before implementation. Owner prefixes: `features/ainuoke-material-progress/`, `app/order-center/material-progress-preview/`, independently named tests and this document only. Shared state/rules/config/package/migrations/Quote/Server/ops files prohibited by the user's parallel-development instruction; this overrides routine AGENTS shared-document updates.
- Read latest context, Ainuoke API/Discovery, Style Progress, SalesOrder persistence, applicable business rules and Active D-069/D-071/D-073/D-074 plus actual source/normalization/projection/Server read code and tests.

## Audit and design boundaries

| Existing fact | Reuse / action |
| --- | --- |
| 6087050 API adapter + Normalize/Dedup/Validate Preview | Call existing pure Preview; retain Source Trace and deterministic event IDs |
| Existing pure `toAinuokeMaterialImportPreview` validator | Reuse completeness/integrity checks without calling commitImport or any repository |
| `deriveMaterialStatuses()` | Sole readiness algorithm; gate unknown/incomplete source before calling it |
| Canonical resolver and factory exclusion | Reuse D-069 group identity and `isFactorySupplied`; keep color/spec child demands |
| BillNo normalization / stable order association | Reuse formal normalized SalesContractNo; InsideOrderNo is query/drift evidence only |
| Nullable purchase fields | Missing/null evidence remains unknown; explicit numeric zero is distinct. No invalid Source can imply not_purchased |
| Unit mapping absent in MaterialDemand/6087050 | Display source quantities per demand; mark unit unverified and never total different demand/unit quantities |
| Browser persistence and formal Server material domain | Not part of this slice; no repository/Bridge/account/migration/writer integration |
| Global app bootstrap / Quote Server boundary | Independent developer preview mounts only this component on dynamic loopback port, without root providers or storage; app route also supplied but no shared route whitelist changed |

The page uses safe generated 6087050-format snapshots clearly labelled SYNTHETIC, not live sync. Pure projection indexes events/trace by demand, groups only with the existing canonical resolver, and exposes source-quality warnings. Search/filter/pagination cap rendered rows for large data. No new material identity/state/matcher/logistics algorithm.

## Planned Gates

1. Audit checkpoint and file ownership (this Gate).
2. Pure projection + synthetic fixtures + independent route/component; domain/SSR tests.
3. Isolated Chromium search/refresh/details/narrow/large-data verification, typecheck/lint/build/diff-check; final #91 intersection check; one PR only.

## Future trusted Server gap

Formal material read API/repository/storage, trusted Zhixu user to personal Ainuoke account binding, permission/visibility contract, complete snapshot lifecycle, source-version/transactional audit policy and explicit material unit semantics need a separately reviewed design. 6087050 only proves InsideOrderNo transport lookup; BillNo fieldName/compareType must not be invented. No migration number (including #91's 0010) reserved. Await #91 integration and user confirmation before formal wiring.

## Local implementation checkpoint

Audit HEAD `1323d2fccf686f8d7407374578f764003a73f332`. Audit push failed with curl56/schannel missing close_notify; the single read-only remote verification also failed. REMOTE PENDING, no credential/configuration changes or blind push retries. Independent local phases continue on the same verified main baseline; next delivery attempt is the final reliable checkpoint.

Pure projection, generated snapshots, scoped component/CSS and independent app route implemented. The developer preview starts only this component with Vite middleware on Node's dynamic loopback HTTP port, with no ERP root bootstrap, permissions mock or business stores. Initial Vite port=0 defaulted to5173; corrected to Node listen(0), and actual Chromium rerun used52459. Initial domain22/22 and Chromium9/9 (34 assertions) PASS; initial typecheck/build/npm701/701 PASS. A harmless unnecessary useMemo dependency warning was corrected using explicit in-memory source state. Added boolean/whitespace unknown-quantity guards; final reruns follow.

Desktop1440 and touch390 screenshots are checked under `features/ainuoke-material-progress/__tests__/evidence/`. Source equality, unique event totals, color/spec variants, zero/null, factory exclusion, stable BillNo/Inside drift, missing paging, source collision and no persistence/network writes are covered. Large5000 projection/search measured~485ms and UI renders at most30 rows.

## Final engineering validation (2026-10-10)

Implementation HEAD `8b30f8e3ee701c4b1c4ba042a0dc6a8f99c5ba2c` on the verified main baseline. All results below were executed for this task, not inherited from #91:

| Check | Result |
| --- | --- |
| `node --test tests/ainuoke-material-progress.test.mjs` | PASS23/23, zero skipped |
| `node --test features/ainuoke-material-progress/__tests__/browser.test.mjs` | PASS9/9,34 Chromium assertions, zero skipped; private profile/server cleanup PASS |
| `npm test` | PASS702/702, zero skipped, including the23 new domain tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, zero warnings after source-state fix |
| `npm run build` | PASS,42 prerendered routes including independent preview; existing non-failing chunk advisory |
| `git diff --check` | PASS |

5000-demand Source projection/search measured1.09s in the isolated targeted run (10s guard); earlier unloaded runs~0.46–0.49s. Final Chromium bulk load/page/search subtest1.92s while quality checks ran in parallel. UI caps visible demands at30 and preserves group/child identities across pages. Desktop1440 and true touch390 no horizontal overflow; screenshots inspected. Test browser made zero storage writes, zero IndexedDB databases and zero business API/external-origin requests. Temporary synthetic profiles were removed. No real DB/Bridge/COS/account/runtime or Quote candidate image operation; PostgreSQL tests/Server build are NOT RUN because this slice changes no Server/schema code.

## File ownership / parallel intersection

Exactly13 task paths: one new app route; this independent task document; the new `features/ainuoke-material-progress/` module, isolated preview, Chromium test and two synthetic screenshots; independently named `tests/ainuoke-material-progress.test.mjs`. No shared state/decision/rules/package/config/migration/Quote/ops changes. Read-only reuse imports existing source/normalization/canonical/factory/readiness functions; no new order matcher or state algorithm.

Before implementation checkpoint, GitHub #91 OPEN HEAD `8c6578b98311a9a14211d236d18b2376f8cb4343` was re-read, and the actual task paths were compared to all its changed files: **intersection=[]**. Final check is repeated before delivery. If future #91 files overlap or main integration conflicts, stop and preserve the worktree for the integration owner; no automatic resolution/rebase. No new migration or 0010 reservation.

## Browse and manual acceptance (five steps)

1. In this dedicated worktree run `node features/ainuoke-material-progress/preview-server.mjs`; open the printed dynamic loopback URL ending `/order-center/material-progress-preview/`. This preferred standalone preview has no ERP global bootstrap and writes no business store. The app route is also included; current Quote-Server production boundary intentionally keeps unapproved Order routes unavailable, and its shared whitelist is not modified.
2. Confirm the synthetic/non-live banner, contract/style/source time; check fabric/trim groups, black/blue color/spec variants, quantities and four readiness states. Unknown purchase displays unknown; factory supply is excluded.
3. Search `160cm` or `PO-SYNTHETIC-partial-b`; expand purchasing/ready rows to check two unique purchase events, dates/supplier and inbound document. Click refresh: fixture time and IDs remain stable.
4. Switch no-data/incomplete-page/identity-mismatch/collision scenes: warnings appear and no fabricated procurement states. Switch5000 scene: at most30 rows, next page and search05000 work.
5. Use a390px touch viewport: filters/details remain visible without horizontal overflow. Stop the local preview with Ctrl+C after review.

## Remaining scope / delivery

No new business semantics awaiting confirmation for this synthetic-only slice. Formal trusted Server material API and persistence, session/RBAC/order visibility, personal Bridge account isolation, source-snapshot freshness/version/transactional audit, real6087050 reads via current Inside lookup and confirmed unit semantics are still missing. Submit their design differences/risk for user approval after #91 merge and latest main synchronization; never guess a BillNo query field or use Browser IndexedDB as formal PostgreSQL.

No automatic merge/deploy, no real Ainuoke live Server sync. Final local/remote full SHA and unique PR are verified at Git delivery and reported to the user; this document records full code-validation HEAD above to avoid pretending a self-referential commit hash can be embedded in its own commit. Audit network failure remains historical until final delivery is confirmed. Completed engineering stops here for user feedback.
