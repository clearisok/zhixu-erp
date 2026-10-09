# Quote original UI / Server convergence

## Gate A — read-only audit (2026-10-09)

Verified start: `ops/update-quote-trial-windows-ui` / `62af9d33fd1de9a981972405b0d1ef01b503d351`, clean. Fetch succeeded; base `edc3598764266de087c0f669f8bcf5452c6d3fd2`. PR84 OPEN, same head, no merge commit. Independent branch `fix/quote-server-original-ui-convergence`; PR84 deployment files excluded.

Reference: PR64 merge `7658663038b1da504c95086711f627b6dce5c7a0`. PR83 before `cc3c450562e692b696024558706954816227cb8a`, after `dd5fc62e6a4cdf5920528c71cfbd4dbae3c9013d` (head `1d1b3c4a10db9abb98d4f74020d2e8cc2d0bee16`). Current Server is the verified base, not the Browser reference. Actual `production-quote-pages.tsx` branches list/new/detail by quoteAuthority; ServerDetail reuses QuoteEditor. No historical business data used as fixtures.

Categories: A restore original visual/IA; B retain Server behavior; C retain PR83 usability fixes; D unsupported, never fake; E requires decision. No blocking E conflict identified. Country/PV-name list metadata and real thumbnails are not in current summary; do not expand API to imitate that reference detail.

| Area | PR64 | Current Server / PR83 change | Cause/category | Restoration / risk |
| --- | --- | --- | --- | --- |
| App Shell | green sidebar, warm workspace, white panels | same shared Shell; trusted session logout | B/C, not a redesign | reuse Shell; keep floating logout and independent workspace scroll; no auth change |
| Title/actions | QUOTE CENTER, count, description, new, low-weight More | count/new; three prominent toolbar commands | A, separate Server entry grew utility controls | restore description/More; preserve ZIP/summary/settings entry points |
| Search/filter | icon search, filter card, result count | plain input plus filters/commands | A/B | reuse search class/Toolbar; keep bounded whole-database search, no unsupported slash syntax |
| Columns | image, identity, brand/person, type/status, qty, costs, price/confirm, revision/PVs, date, action | independent 9 default BusinessColumns, all optional 18 | A/B | presentation-only grouped default; formal keys/permissions/export stay independent; old saved layout remains valid |
| Style image | IndexedDB thumbnail | summary has no legal image relation/bytes | D | explicit empty visual slot; no old URL/IDB/per-row GET; real wiring deferred under D098 |
| Cost/prices | two-line range, currency qualifiers | formal projection already calculates same values, linked confirmation has CCT qualifiers | A/B | reuse displays, never recalculate or infer confirmation from Quote status; each hidden child omitted |
| Revision/PV | Vn, PV count, country/name | summary has label/count, not country/name | A/B/D | restore chip/count hierarchy; do not invent country or query aggregate per row |
| Scrolling | proportional table/local overflow, sticky action | PR83 explicit readable min widths, right alignment | C | grouped defaults fit common desktop; optional all-field view retains floors/local overflow; Foundation defaults unchanged |
| New | normal workspace header and inline type selection before save | safe POST{} then optional selected-type PUT; small utility panel | A/B | familiar workspace/section/type presentation; never mount old Browser draft or POST on open; partial failure preserves ID |
| Detail/base | QuoteEditor with object header, cockpit, base card | same Editor; technical notices moved to diagnostic | B/C | retain shared Editor and diagnostics; localized content-width adjustments only if actual evidence requires |
| Costs | shared Wide/Compact fields | PR83 1280 compact grid, sticky observer ready-binding | C | preserve width/grid, no formula/permission changes; validate 1280 and fine-pointer 900 |
| Attachments/modals | shared panel, Modal/Portal | typed Server controller, version lock, exact relations | B/C | preserve API/controller; do not restore Browser storage; Portal must remain outside overflow |
| Responsive | desktop/compact/tablet/true-mobile via pointer+hover | Server table lacks renderRecord, so true-mobile can hide data table | A/C | permission-filtered record cards using same projected cells; test touch navigation and fine-pointer 900 separately |

Why drift: PR75 introduced distinct Server list/new wrappers while adapting data; field-level API/prefs were exposed directly as independent cells. PR83 deliberately improved readability, width floors, scroll and technical noise, but kept the utility-style wrappers. Grouping is not a need of PostgreSQL, RBAC or CAS. Conversely trusted identity, immutable history, saved-source exports and safe create timing are necessary Server differences, not visual choices to undo.

## Current capability / permission baseline

Actual authority: PostgreSQL via `/api/v1/quotes`; trusted session and service PermissionKey checks. Default Browser dispatch/repository unchanged. UI disabled alone is not authorization.

| Capability | Existing boundary to retain |
| --- | --- |
| List/detail/search/filter/paging | quote.view; bounded summary, real total; requested cost fields additionally quote.cost.view |
| Create | quote.create; user action POST{}; server ID/number/Revision; processing initialization normal CAS PUT |
| Ordinary save | quote.edit + changed field cost/settings permissions; expectedVersion, precision, transaction/audit |
| History | quote.revision.view; historical Revision immutable |
| Revision create | quote.revision.update; saved source/validation, CAS and trusted audit |
| PV create/delete/update | quote.price_version.create/delete and quote.edit for updates; last PV/history protection, shared persistence lock |
| Costs/settings/Quick Create | quote.cost.view/edit, quote.settings.edit; respective settings.*.edit for master create |
| Estimate view/edit/history | estimate.view; mutations quote.edit + estimate.view/edit; restricted DTO omits protected slice; independent history |
| Confirmation | quote.view/confirm; saved PV, unlinked snapshot vs linked shared current; separate Quote/CCT versions |
| Attachments | existing quote/revision view and edit command guards; legal relations, byte/SHA, shared write lock |
| Customer XLSX/ZIP | quote.view/export/cost.view; history revision.view; Estimate never enters customer model |
| Internal summary | quote.view/export; selected costs cost.view; explicit Estimate estimate.view; source versions reverified |
| Logs | audit_log.view (detail quote.view); Estimate events projected by estimate.view |
| Personal columns | trusted user-scoped local UI keys only; no business init, no cross-device claim |
| Whole copy/delete, Revision delete, Order creation | D: no Server commands/UI enablement; cannot restore legacy actions |

## Evidence / delivery

- Before capture: current base Server build PASS; existing opt-in visual test 1/1 PASS, cleanup PASS. Four desktop sizes, owned profile/PG tmpfs/memory storage. This is not the new full business acceptance.
- Evidence root: `C:\Users\Administrator\.codex\tmp\quote-original-convergence`; final synthetic representative images/index and actual regression results will be recorded at Gate E.
- Runtime/database/COS/user Browser untouched. Engineering completion is not USER UI ACCEPTANCE.

## Gates B–E — implemented and actually validated

- B `8d49b61`: same formal BusinessColumn/API, authorized visible children grouped in original default hierarchy; old v1 preferences remain independent/lossless, unchanged key. Explicit restore/toggle only. Original PageHeader/More/search/card shared styling, bounded paging/selection/export retained; touch record actions added through Foundation's existing opt-in renderer. No per-row aggregate reads.
- C `656d5d6`: CREATE QUOTE/base-info card, explicit processing/distribution choice; existing handler unchanged. No create on open/cancel, POST{} remains, returned ID/version processing PUT, double-click/unknown/conflict and no-repeat protections retained. Necessary difference from PR64: full Editor after explicit Server creation, not a Browser pre-created aggregate.
- D `81fab4e`: Editor runtime unchanged; keep PR83 working cost/sticky/Portal layout. Actual keyboard Enter row activation, 1280 cost field widths, history/viewer/restricted cost/loading/error/409/touch evidence. Synthetic captures and source-authority sentinel assertions reuse the existing harness, not a second business/data implementation.
- E: final quality/default build-info, durable docs and complete synthetic screenshot archive. Application source after C unchanged; Server frontend captures identify C, default Browser build identifies D; later docs/test commits do not imply those artifacts were rebuilt with a future commit identity.

| This task's actual command / run | Result | Boundary / coverage |
| --- | --- | --- |
| `npm run test:quote-server-ui` (normal mode, final business run) | 62/62 PASS | real Chromium formal routes; trusted roles; create/types; global search/filter/total/paging; CAS/dirty/precision; Revision/PV; cost-sync success/409/network; Estimate; CCT; attachments/download bytes+SHA; customer XLSX/ZIP; summary values/source/permissions; logs; grouped/independent/restore preferences; no Browser business access |
| Same command, `ZHIXU_UI_VISUAL_STAGE=after` + dedicated output | 1/1 PASS | 78 frames, 1920×1080 / 1440×900 / 1280×800 / 900×800 fine-pointer; 390×844 coarse/touch/no-hover; no document overflow, workspace scrolling, readable frequent costs, sticky, Portal, keyboard row navigation, restrictions/failures; cleanup PASS |
| Same harness, archived PR64 build / reference output | 1/1 PASS | 12 actual reference frames, synthetic Browser fixture only in own profile; PostgreSQL Quote count remains zero; local single-user is reference identity only |
| Same harness, current-base before visual output | 1/1 PASS | 56 before frames; no user profile, real data or storage |
| `npm run test:server-auth-frontend` | 67/67 PASS | trusted auth + adapter/persistence/Estimate/preferences/version-state regressions |
| `npx tsx --test features/quote-center/server/__tests__/list-presentation.test.tsx` | 4/4 PASS | formal fields independent; v1 order/width/idempotence; hidden/revoked tooltip/record isolation; group moves/widths |
| `npx tsx --test features/quote-center/server/__tests__/table-layout.test.tsx` | 2/2 PASS | Browser/basic-settings fit-first unchanged; Server readable floors opt-in |
| `npx tsx --test features/quote-center/server/__tests__/quote-editor-persistence.test.ts` (Gate C) | 13/13 PASS | handler/runtime unchanged thereafter; aggregate/attachment CAS and dirty error guards |
| `npx tsx --test --test-concurrency=1 server/integration/{quote-api,quote-version-workflows,estimate-workflows,quote-attachments}.integration.test.ts` (four explicit paths) | 38/38 PASS | disposable PostgreSQL/memory storage; 401/403/CAS/rollback/immutable history/exact snapshots; no real COS |
| `npm test` | 674/674 PASS | current Browser/model/export/permission/Foundation regressions, not old PR83 evidence |
| `npm run typecheck`, `npm run lint`, `npm run server:build` | PASS | actual current runtime + affected tests |
| `npm run build` with process-only Quote/master=server, identity=session | PASS | formal production Server routes; built before final Chromium, no real .env change |
| `npm run build` without temporary authority inputs; inspect `dist/client/build-info.json` | PASS | browser/browser/writable/session; no changed production defaults or lingering process env |
| `git diff --check`, changed-doc local-link and conflict-marker audit | PASS | expected files only, no API/schema/deployment modifications |

Earlier failures are not hidden: first normal run52/62, second59/62 (old default-code/flat-header/positional-XLSX assertions and grouped width). Width fixed without removing local scroll/field configurability; assertions now identify the expected record and semantic export columns while preserving exact value/source checks. Initial extended capture failed on early loading text and a wrong record selector; final capture completed. No skipped/removed business assertions, no permission/calculation/schema changes.

## Functional / permission regression and remaining differences

| Area | Preserved / current evidence | Remaining |
| --- | --- | --- |
| Formal data authority | API / full Chromium + sentinel: no old localStorage/IndexedDB reads/writes | real environment untouched |
| List & preferences | grouped defaults, old saved field preferences, explicit restore; real total/search/filter/bounded paging/cross-page select; independent summary columns | local prefs are not cross-device sync |
| Create & save | processing/distribution, zero create on open, double-submit guard, returned identity/version, CAS/null/zero/precision, retained draft/ID/unknown state | type-first Server preparation differs from unsaved Browser full aggregate |
| History, PV, Estimate, costs | immutable historical snapshots; source/restore/stale; cost-sync choices preserved on failure; baseline/write lock | no historical Revision delete or generic Estimate writer |
| Sensitive fields | trusted roles/Server rejects requests; grouped children/tooltips/cards filtered; Estimate omitted rather than fake empty | grouping must stay presentation-only as more fields are added |
| Confirmation & files/logs | linked vs unlinked vs unknown, independent Quote/CCT versions, authoritative Excel/ZIP, explicit Estimate summary, bytes/SHA, read-only trusted audit | whole copy/delete, Order creation remain disabled |
| Visual baseline | same green/warm/white Shell/cards; grouped hierarchy, More, original new/base styling; PR83 costs/sticky/Portal retained | real list thumbnails, country/PV-name metadata deferred (D-098); trusted account identity not reverted to local mode |

Screenshot index: [146 synthetic reference/before/after PNGs](../assets/quote-original-convergence/README.md). Human review still required for default and personalized list, both new types, base detail/costs, readonly/failure/Portal, 900 fine-pointer and touch. No new candidate image or real deployment made; real trial acceptance NOT RUN. Entire COS/history-import suites were NOT RUN because storage/schema/import code did not change; historical import NOT REQUIRED (D-096).

## Delivery recovery

Gate A push failed with Connection reset. Under AGENTS, reliable LOCAL checkpoints continued; no repeated remote push per small edit, no shared network configuration change. Final delivery is determined by exact local/remote/PR SHA checks, not presumed from the local commits. No PR84 Windows operations/config files mixed into this branch. USER UI ACCEPTANCE PENDING and deployment separately unauthorized even after delivery succeeds.

Delivery subsequently recovered: PR86 MERGED at `330aad7d1bfc8e93326e1eb4971a7a9f34a74514`, UI head `460a9c1ef29ef69c21a0d0e02162ffb23d0528d8`, verified2026-10-09. Network failures above remain historical, not a current blocker. The separate [win01 preparation](d099-win01-update-preparation.md) records its actual audit/build/tests and approval boundary; merge did not deploy this UI.
