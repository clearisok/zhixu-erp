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
