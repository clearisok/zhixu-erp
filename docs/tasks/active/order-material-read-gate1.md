# Order Material Read Gate 1 — isolated preparation

Date: 2026-10-10. Status: isolated read-contract implementation; formal HTTP/UI/source activation NOT IMPLEMENTED.

## Baseline and authorization

Dedicated worktree `D:\workspace\zhixu-order-material-b`; branch `feat/ainuoke-order-material-progress`.
Starting clean HEAD `eb22cc95f54567071728d4392452ff4c1475d677`.
Fresh fetch: main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`.
GitHub #91 OPEN/non-Draft HEAD `a3335ed6cd3203f49619b940f3fde7ec849eb095`; #92 OPEN/Draft at the starting HEAD. Other worktrees are not edited. No merge/rebase/reset/clean.

The user's latest clarification supersedes the preceding proposed procurement amount restriction: Ainuoke procurement quantities, unit prices and amounts are team-shared execution information, requiring the existing `order.view` + `style_progress.read` in this prepared reader, with no new procurement money permission. Quote internal costs, customer sale prices, confirmed labor prices and future profit remain separately protected domains. Ainuoke procurement pricing is returned as `sourcePricing.ownership=ainuoke_source`; future Zhixu-maintained procurement amounts are not implemented and cannot overwrite it.

Future sale-price reconciliation uses periodic Excel exports from a separate C/S system without an API, not Ainuoke. No Excel upload/reconciliation is implemented here.

The common state/decision/rule documents are deliberately unchanged under the user's parallel-file gate. This task file is the current recovery point; shared documentation reconciliation requires the next integration owner.

## Gate 0 findings — confirmed code, not a real-environment probe

1. `server/app.ts` SalesOrder ConfirmedCommercialTerms GET checks only `order.view` and returns `customerConfirmedPrice` and `confirmedLaborPrice`. Its read service receives no actor/field-permission context. This is an actual response exposure path, not merely an enabled UI label. Quote-provenance terms GET similarly checks only `quote.view`.
2. `server/quotes/quote-response.ts` removes only Estimate fields when `estimate.view` is absent. The normal aggregate detail's `getForActor()` otherwise returns Revision/PV costs/prices without `quote.cost.view` field redaction. Quote list/internal-summary/customer-export protections are separate and do not close this aggregate/terms read path. Gate 1 does not change shared Quote or terms code. Next Gate must review read surfaces, serialized responses, exports, caches and errors together before permitting ordinary tracker access to an integrated detail.
3. Existing order detail loads commercial terms alongside basic order data. Next Gate must separate their reads so a restricted money panel cannot prevent authorized basic/material facts from displaying. Keep existing shared terms/CAS/currency/provenance writer semantics.
4. Bridge session creation accepts a Browser `userId` and explicitly reports `browser_local_mock`. Origin/CSRF/HttpOnly are not a trusted Server identity binding. Controlled baseline collection and future personal operations require separate approved designs; no real Bridge adapter is installed by this Gate.
5. Existing SalesOrder GET is coarse `order.view`; user/team row visibility is not implemented by its Repository. The prepared reader delegates visibility to an injected, server-only `resolveVisibleOrder` capability. A real adapter must enforce the company-authorized team scope; synthetic tests are not production authorization proof.
6. 6087050 has no reliable unit dimension. Quantities retain existing Normalize/Event numeric semantics, every row has `unit=null`, and no numeric quantities are summed across demands/material groups. Prices retain source currency text, null/zero, no guessed currency/FX or financial total.
7. Formal color-size evidence exists in PG metadata but public SalesOrder DTO is still simplified colors. Material's `CnColor` and garment's `CnColor` are different report facts; `StyleColor/StyleColorcy` provide descriptive associations, not a proven color-line FK or allocation algorithm.
8. Existing Style Progress loader reads Browser orders/materials/scheduling/settings; current detail/back/order links use Browser context. Global Quote-Server boundary also blocks unapproved Order routes. They are not touched here.

## Implemented isolated code

- `features/ainuoke-material-progress/projection.ts`: the sole `order-material-read.v1` projection, used by the existing synthetic preview and prepared reader. Explicit Demand/Purchase/Movement field allowlists replace raw/full domain objects. Reuses the existing report adapter, pipeline, event dedup, canonical resolver, factory exclusion, pure readiness validation and sole `deriveMaterialStatuses()`.
- Quality: exact normalized BillNo per row, paging/totals/pageSize/nonfinal fullness, timestamps, collisions/validation; unknown procurement/inbound/movement quantities are distinct from explicit zero. A positive quantity without its document identity cannot become a known total. Unknown/blank/boolean procurement pricing is not false zero, using existing Event source references as evidence.
- Purchase/inbound/material shipment/outbound events remain separate. Material movement is never garment shipment. Factory supply retains the existing exclusion. Source date/quantity/order fields are never mutated.
- Summary is explicitly **Demand item counts**, with Canonical group counts separately identified. It is computed from the exact same rows used for detail. It is not an alternate group readiness algorithm or cross-unit quantity sum. Formal Canonical ordering alignment remains part of the existing Style Progress integration review; no second sorter is invented.
- Exceptions return fixed messages, not parser/provider messages or raw fields. Failed validation clears source metadata instead of reflecting an invalid timestamp. No protected financial domain fields, raw rows, source metadata, pricing-derived trace payloads or commercial terms are serialized.
- `read-service.ts`: stateless injected read capability. Requires an existing trusted identity and both read permissions before any lookup. Accepts only one formal UUID, resolves visibility, checks returned UUID/version and source-envelope UUID/BillNo, and calls the same projection. Scope fields are allowlisted before passing to the Source capability. No cache, Repository, network, business writer, Bridge, account operation or commercial-domain read.
- Source loader is absent by default: returns `not_connected` with no Browser fallback. Tests only install clearly labeled `synthetic` sources. `server_snapshot` is a future adapter provenance value, not proof of runtime integration or current real data.
- `order-navigation.ts`: deterministic links to the existing style-progress detail with `orderId=<UUID>` and return to `/order-center/server-detail?id=<UUID>`. No arbitrary return URL, Browser ID or contract selector. These links are **prepared contracts**, not wired into current routes.

## Verification — this Gate only

| Check | Current result |
| --- | --- |
| Independent Gate 1 + existing projection tests | PASS 47/47, zero skipped (24 new + 23 existing) |
| 5,000-demand projection/search | PASS ~0.482s in the final focused run; existing 10s guard |
| Isolated Chromium synthetic preview | PASS 9/9, 34 Chromium assertions, zero skipped; temporary profile and preview cleanup PASS |
| npm test | PASS 726/726, zero skipped on final code |
| typecheck / lint | PASS / PASS, zero warnings |
| server:build / build | PASS / PASS, 42 prerendered routes; builds run serially for final result |
| git diff --check | PASS |
| PostgreSQL / actual HTTP permission / actual Source reads | NOT RUN; no real adapter/schema/route is implemented or authorized |

Two initial focused failures were corrected: failed Source validation retained its invalid fetchedAt, and a zero-price fixture changed only one member of identical duplicate Source rows. Final tests cover fixed-error metadata, null/zero pricing and unchanged duplicate identity semantics.

Permission assertions exercise an ordinary tracker with only existing Order/Material read permissions: Ainuoke procurement prices are present; injected Quote cost/sale/labor/profit sentinels are absent from the returned DTO, JSON response bytes, serialized row-export consumer and a serialized test cache consumer. Provider/parser error paths do not echo them. Forbidden users trigger no order/source read. The reader itself has no export or cache implementation. This is contract/consumer evidence, **not a claim that existing real API/export/cache exposure is repaired**.

Other coverage: stable BillNo, Inside drift, Source-envelope mismatch, row mismatch, concurrency between two orders, visibility denial, no Source capability, full/empty/incomplete pages, collisions, colors/specifications, duplicate events, factory supply, shipment/outbound, all four existing states, summary/detail consistency, fixed formal return link, redirect and extra-selector rejection, immutable snapshots and no inherited/cached data.

## Next Gate — approval and #91 merge required

| Proposed shared file/change | Why / conflict boundary |
| --- | --- |
| `server/app.ts` | Material GET plus actor-aware protected reads; directly intersects #91, cannot edit now |
| `server/confirmed-commercial-terms/service.ts`, relevant DTO/projection/tests | Independent sale/labor field viewing and read masking; preserve current shared writer/provenance/currency/CAS rules |
| `server/quotes/quote-response.ts` and relevant Quote read/export tests | Close aggregate field exposure without making unavailable fields authoritative null/empty writes; Quote-owned scope |
| `features/permissions/model/permissions.ts`, Server permission activation design | Resolve sale/labor/profit field contracts; **no new procurement price permission**. No names/catalog/DB change chosen here |
| `server/sales-orders/model.ts` / read Repository or authorized scope adapter | Bounded source time/reconciliation/provenance and company-team visibility; schema need must be separately established |
| `features/order-center/components/server-sales-order-detail-page.tsx` | Compact material summary, separate protected commercial read, controlled link to existing detail |
| `features/style-progress/components/style-progress-pages.tsx`, `material-control-tower.tsx`, loader adapter | Explicit Server read mode on the existing page, one projection, no Browser fallback or manual planner writer; controlled return UUID |
| `features/quote-center/authority/quote-authority.ts`, global identity/bootstrap boundary as necessary | Explicit approved route access/identity and prevent global Browser initialization; shared Quote-first scope, no blanket ERP opening |
| Shared business/permission/feature/state/handoff docs | Integrate latest user ownership/price-sharing/C/S facts after #91 coordination, preserve parallel evidence |

Do not reserve a migration number or assume a material schema. First approve the trusted Source read/visibility and protected-field contract; then determine whether the read slice needs persistence and an independently authorized activation. No 0010 or Preview edits.

The later integrated target is: authorized SalesOrder UUID → compact summary of this same DTO → existing style-progress detail in Server read mode → exact formal order return. Unconnected source continues to show unconnected. Real collection, personal trusted binding, persistent Source retention/freshness, protected field rollout and deployment remain separate Gates. Profit, garment shipping, finance, sale-price Excel and writes remain out of scope.

Frontend build initially failed with ENOTEMPTY while Server compilation and vinext concurrently used `dist/server`. Both paths are confirmed by compiler/build configuration; the serial frontend rerun passed without source/config changes. Never run these two builds concurrently. No real Server was started. The existing human-review synthetic preview is separate; automated test previews/profiles were cleaned up.

Delivery review re-fetched main at the same full SHA and re-read #91 at the same full a3335ed HEAD, OPEN/non-Draft. Full #92 relative-main scope including this Gate has **17 paths**, versus **38** #91 paths, intersection `[]`. This Gate adds/changes exactly seven independently owned paths (three projection/read/navigation modules, two independent tests, two task documents); no shared code/docs, permission catalog, package, migration, Quote files or ops changes.

## Delivery discipline

Only independent #92 module/tests/task documents are staged. Relative-main ownership and intersection with the latest #91 file set are rechecked at delivery; if they overlap, stop. #92 remains the sole Draft PR. No new PR, merge, deployment, real Source reads, DB migration, production-data or credential operations. Final full commit/remote receipt and clean working-tree result are reported after checkpoint delivery.
