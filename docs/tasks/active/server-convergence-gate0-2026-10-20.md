# Server convergence — Gate 0 approved baseline

2026-10-20 (Asia/Shanghai). One primary integrator and one independent reviewer. F = observed fact, U = user decision, R = recommendation, Q = unresolved. Approved target and implemented behavior are separate.

## User approval and boundaries

- U: the user approved the convergence plan and confirmed no business data needs migration. Historical import is NOT REQUIRED (D-096). This is not a claim that existing databases contain zero records.
- U: new Server closing uses CNY for garment sales output and USD for labor prices. Preserve currency with amount; do not add currencies or introduce automatic FX. Existing Quote/PV/CCT, purchase-source currencies, formulas and historical snapshots are not rewritten.
- U: retain 3001; 50426 is the desired target entry after persistence and cutover verification. No automatic PR merge, formal deployment, existing-account change, deletion or new real Ainuoke collection.
- R: Gate 1 now prepares a fresh persistent empty target, instead of moving historical business data. Existing experience accounts, synthetic records and source samples stay in place. Their preservation need not block empty-system engineering.
- Q: garment shipment meaning, processing-service output classification and closing staleness still need decisions before their respective Gate. Existing commercial versions permit CNY or USD labor (server/sales-orders/color-commercial.ts); Gate 8 must decide how to handle an adopted CNY labor version. Never relabel its currency or supply default USD as if it matched. Currency confirmation does not settle tax, recognition timing, bank payment or profit.
- The user asked whether Goals mode is needed. Approved engineering can start normally; no persistent app Goal has been created by this checkpoint. A mode selection does not expand authority.

## Exact code baseline

- Reused clean audit worktree `C:/Users/Administrator/.codex/worktrees/7bf3/zhixu-ainuoke-api`; previous detached HEAD b0b38d2ab5e8c5e6a1b84d080506ee53fc91532a remains in history. No new worktree or runtime checkout change.
- Branch `codex/server-convergence-baseline` starts clean at main `996dfedc12da3527343cd3ff2aa5eea35497e10e`, re-read through GitHub on 2026-10-20 and available locally. No fetch/reset/clean/rebase.
- Main contains #119 and #108-118 original histories. On 2026-10-20 the following exact heads/draft states were re-read. Their three successful checks were verified in the preceding audit, not rerun by this documentation phase.

| PR | Branch | Exact head | Treatment |
| --- | --- | --- | --- |
| 120 | codex/price-source-stabilization | 57daca3d3f23f39f0aafff57502f490206b10084 | independent, continue |
| 121 | feat/system-role-permissions | 4e075115b0721a6fd807d61d40e3e505de119e4b | before 122 |
| 122 | feat/user-management-lifecycle | 349a84585f50a0a0779d56e4b56127b6cec0e329 | descendant of 121 |
| 123 | feat/business-operation-logs | ebe4cb16c8f5ea65df6243d8a5627094c6f62da1 | descendant of 122 |

These PRs overlap state documents and baseline metadata. Gate 2 must preserve D-146 and this D-147 using forward evidence revisions. Do not create a duplicate cumulative implementation PR; validate the combined candidate before recommending each merge.

## Protected assets (preceding read-only audit, not new Gate 0 data reads)

| Asset | F: observed state | Treatment |
| --- | --- | --- |
| 3001 | Native Node, D:/workspace/preparesystem, build e3e8e743; not stopped historical containers | retain; no Browser writes/restart |
| 50426 | Native Node build 4978e431aad73915864ed2735913dcf091d77bf5; system-settings-ci later docs HEAD 5490009b; synthetic source | retain until explicit cutover; not main |
| 50426 storage | PG zhixu-pg-it-3d060cdca6b3 port 54351, tmpfs; MemoryAttachmentStorage; 8 users/4 Quotes/5 SO/0 attachments observed | no import prerequisite; build new persistent empty target |
| 59069 | Native Node build 5052439a965dc3dc34b174df68e2d30c1b5f524f; PG zhixu-pg-it-db35c84363de port 64686, tmpfs | old experience unchanged |
| 62326 | Running app/PG, persistent volumes, two-contract real source samples plus synthetic examples | preserve, no automatic import/recollection |
| 62316 | App stopped, PG running; two-contract source samples on volume | same |
| 62310 / 62200 | App/PG stopped, volumes and worktree output binds remain | preserve restoration dependencies |
| 18444 | Stopped gateway/app/PG/MinIO/object-TLS; data/object/cert/config volumes and pr84 scripts | no cleanup or deployment |
| 18443 | Stopped gateway/app/PG; data/TLS/config volumes and object backup | same |
| zhixu-database | Running PG; Legacy 3 Quotes/2 orders/1 schedule, plus 511 Server orders observed | historical, no import prerequisite, no deletion |
| native PG 5432 | Running, ownership unknown | outside automatic retirement |
| Docker volumes | 106 total, 15 referenced, 87 anonymous and 4 unreferenced named volumes | unreferenced does not mean disposable |
| Browser stores | Inspected IAB 50426/59069/62326 had no business stores; 3001/other profiles not fully verified | preserve profiles/namespaces/cookies |

`outputs/system-settings-demo.ts` in system-settings-ci injects memory attachments and stops its disposable database on shutdown; `server/integration/postgres-container.ts` uses --rm/tmpfs. Do not promote that launcher to persistent operation.

Runtime dependency links: system-settings-ci -> ainuoke-live-readiness -> ainuoke-continuous-material-display node_modules; several order worktrees -> erp-followup-governance node_modules; pr84-integration -> zhixu-ainuoke-c node_modules. Container output binds depend on live-readiness, live-demo-readiness and erp-followup-governance. Gate 0 uses one ignored local node_modules junction to the existing continuous-material-display dependency directory for checks only; no package installation or new runtime owner.

Session cookies are host/path scoped, not port scoped. localhost:50426 and 127.0.0.1 entries must not be silently exchanged. No cookie values/credentials were read.

### Thirty worktrees, no deletion

W/name means C:/Users/Administrator/.codex/worktrees/name/zhixu-ainuoke-api. All were clean in the audit except the two marked dirty. Main ancestry alone does not protect ignored outputs or runtime dependencies.

| Worktree | Audited HEAD | Protection |
| --- | --- | --- |
| D:/workspace/preparesystem | e3e8e743 | dirty AGENTS.md; runs 3001 |
| W/7bf3 | b0b38d2a -> Gate 0 baseline | reused for this phase |
| W/ainuoke-approved-http | 1de3078d | outputs/dependency links |
| W/ainuoke-continuous-material-display | cc808198 | shared dependencies |
| W/ainuoke-controlled-new-contracts | 31b5f288 | outputs |
| W/ainuoke-f2507037-diagnostics | 6844952d | diagnostic evidence |
| W/ainuoke-live-demo-readiness | f5bbb1e4 | 62200 binds |
| W/ainuoke-live-readiness | ebe4cb16 | PR123, runtime binds/links |
| W/ainuoke-readonly-validation | b43b78be | diagnostic evidence |
| W/ainuoke-server-source | 213fb252 | build outputs |
| W/animated-login | caf99c35 | dependency links |
| W/erp-followup-governance | 48b63101 | shared dependencies, 62310 |
| W/ningbo-first-team-access | 95eca129 | deployment evidence |
| W/ningbo-readonly-preflight | 174a7e5c | unique evidence commit |
| W/order-commercial-versions | e70deacf | outputs/links |
| W/order-effective-attribution | 4b7ac1e8 | outputs/links |
| W/order-identity-and-contract-claim | 7ef6e665 | history only; no claim UI restoration |
| W/order-normalization-preview | 4c59d974 | history only; no public normalization |
| W/processing-order-batches | 4da3590b | validation outputs |
| W/project-requirements-register | 98e3f74f | unique requirements commit |
| W/release-baseline-guard | 0855e75a | candidate after reference check |
| W/server-quote-to-order | d9bf53b4 | no old distribution Quote-to-SO restoration |
| W/system-settings-ci | 5490009b | running 50426/restoration pointer |
| D:/workspace/zhixu-ainuoke-api | 460a9c1e | build references |
| D:/workspace/zhixu-ainuoke-c | d3cce470 | pr84 dependency host |
| D:/workspace/zhixu-order-b | a6a59a9e | build outputs |
| D:/workspace/zhixu-order-material-b | 5a418106 | dirty docs/tasks/active/order-material-read-gate1.md |
| D:/workspace/zhixu-pr84-integration | 2b59244e | 18444 scripts/unmerged preparation |
| D:/workspace/zhixu-quote-two-step | 10aa6998 | delivery/validation outputs |
| D:/workspace/zhixu-server-deploy | f0c252b5 | legacy restoration references |

## Capabilities and ordered Gates

Record implemented, merged, isolated-tested, deployed, user-accepted and source-activated separately. Source code and existing tests show: Server Quote/commercial/processing principal flows are merged; #120 fixes pending; roles/users/log improvements remain #121-123. DeliveryPlan backend exists but UI/caller chain is incomplete. Source color/size parsing exists, but the formal size UI is not connected. Production scheduling/completion and closing repositories still use Browser storage; garment shipment has no complete Server capability. Real source activation remains scope-specific; 50426 is synthetic.

Code references: quote-authority.ts route allowlist; server/sales-orders/delivery-plan-service.ts and delivery-plan-source-refresh.ts (no production refresh caller found); server-sales-order-detail-page.tsx size note; production/closing repositories. Existing complete Quote browser report remains 32 pass/44 fail/2 cancelled without full attribution, not a new run.

The actual browser audit observed .rsc application/octet-stream followed by full document navigation and shell-less identity checking. server/static-files.ts lacks .rsc content type; quote-server-boundary.tsx renders checking outside AppShell. Gate 3 must validate built artifacts and caching, not merely paint over the transition.

DirectQuoteCreateButton explicitly creates a numbered draft and saves a receipt address before POST; refresh only queries its receipt. Gate 5 reuses the same writer/editor. CreationInput.source accepts null only: add validated creation context, not a second writer or implicit SO commercial adoption.

| Gate | Scope / dependency | Completion / boundary |
| --- | --- | --- |
| 0 | approved baseline/inventory/decisions | checkpoint, baseline checks, independent review; no runtime writes |
| 1 | fresh empty persistent local target | restart and isolated restore checks; no historical import; old 50426 cutover separately approved |
| 2 | 120, then 121 -> 122 -> 123 | combined fixed-SHA validation, preserve commits, explicit merge approval |
| 3 | RSC/identity/Shell after fixed baseline | real navigation/refresh/history/error/expiry checks; no router rewrite |
| 4 | contract -> SO -> color/size -> material -> DeliveryPlan | identity/pagination/age/revocation/color-price/manual-plan tests; no new real read implied |
| 5 | source modal creates Quote | trusted context, explicit draft, receipt recovery/return; no automatic SO or adoption |
| 6A/B/C | resources -> scheduling -> completion | Server owner, transactions/CAS/idempotency/audit, existing pure rules |
| 7 | garment shipment after definition | batches/corrections, separate material flow |
| 8 | closing after remaining business decisions | immutable commercial/period snapshots; CNY sales/USD labor; no automatic FX; shipment dependency conditional |
| R | replacement accepted and dependencies released | disable old writes first; retain history/recovery; no automatic deletion |

Only the integrator edits server/app.ts, server/index.ts, migrations, permission catalog, AppShell/Foundation CSS and shared state documents. Reviewer is read-only. Parallel implementation requires disjoint frozen files; otherwise serialize. Never report an unmerged engineering candidate as main or deployed.

## Validation and handoff

This phase changes documentation and release-baseline metadata only, no application/SQL/UI/accounts/databases/source queries. Prior CURRENT_STATE/AI_HANDOFF are preserved verbatim under docs/tasks/completed/2026-10-20-pre-convergence/.

Documentation checkpoint: `04f3af29022cdee5fe3f603a744112e462e497d9`. Manifest baseline is main `996dfedc12da3527343cd3ff2aa5eea35497e10e`; two forward document revisions preserve all 213 earlier evidence records. Page/capability/status metadata and screenshots are unchanged.

Actual checks on 2026-10-20:

- First guard and baseline test attempt failed with `EVIDENCE_WORKTREE_DRIFT: closing`: the changed closing feature document also required a forward evidence revision. This was a documentation-evidence omission, not an application test failure. The missing revision was appended without overwriting old evidence.
- After that fix, `npm run test:release-baseline`: **94 passed, 0 failed/cancelled/skipped** (122881 ms). `npm run check:release-baseline -- --base-sha 996dfedc12da3527343cd3ff2aa5eea35497e10e`: **PASS**, 11 pages/46 capabilities, 0 changed UI files.
- `git diff --check`, verbatim archive comparison, docs-only scope and 213-record immutability comparison passed. Independent read-only reviewer checked both evidence hashes against checkpoint Git blobs and found no blocker. Reviewer did not rerun tests.
- No application/unit/API/SQL/browser/build/real-source run is claimed for this docs-only phase. No runtime, account or database was changed.

Final commit is resolved from this branch's Git HEAD; remote delivery/Hosted CI are checked independently against that full SHA and reported in the delivery receipt/unique draft PR. Do not infer delivery or deployment from local checks. Next implementation phase prepares a fresh persistent empty target, leaving existing environments intact.
