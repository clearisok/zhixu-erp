# Desktop two-step Server Quote creation V1

2026-10-10; single primary Codex, base `84c8c5b520dbcb956ae27a24103e6607a1c227c3` (#89/#90 merged), clean isolated worktree `D:/workspace/zhixu-quote-two-step`, branch `feat/quote-two-step-creation`. Other worktrees untouched. D-101/QI-01–06 unchanged; only ordinary desktop creation implemented, not Intake or existing-type switching.

## Implemented boundary

- Explicit Server `/quote-center/new`: type/country/active matching preset → brand/active same-brand salesperson/styleNo/name/decimal quantity/date-only garmentLeadDate/note → visible parameter review → atomic draft. Page load, back, cancel and preview do not create a Quote or allocate a number. Multiple presets are never silently selected. No preset/country is allowed; missing business fields remain an incomplete draft, not a fabricated formal confirmation.
- `QuoteCreationWizard`, typed creation client and shared DTO reuse the existing shell/components; future Intake needs an authorised adapter, not a second writer. `source`/`imageSelection` are null-only today; no Intake schema, source freezing, image copying or team permissions.
- Server processing Editor defaults to hidden Fabric/Trim panels with an explicit internal-material toggle. Facts, formula, validation, permissions and history remain intact; material-inclusive garment amount is not labelled pure labor. Distribution and default Browser preserve prior behavior. No existing Quote type-switch entry or generic status parameter was added.

## API / precision / security

| Route under `/api/v1/quotes` | Contract |
| --- | --- |
| GET `creation-options?search=...` | quote.create; active minimal ID/name/brand/country projections, max200 per kind, truncated flag/search; no price values |
| POST `creation-preview` | strict CreationInput; repeatable-read review + actor/payload/version-bound token,10min expiry; no Quote/number/business audit |
| POST `creation-workflows` | strict input plus UUID clientRequestId/previewId and null imageSelection;201 new/200 committed replay; one Quote/children/receipt result/audit transaction |
| GET `creation-receipts/:clientRequestId` | actor-bound minimal committed IDs/version or pending/rejected; never an aggregate or other user's receipt |

Old POST{} remains neutral and unchanged. Quote Service/draft, allocator, repository SQL writer and trusted OperationLog are reused. Final transaction locks/reviews global settings → brand → salesperson → selected preset and checks current DB identity/permissions, states, ownership, country and reviewed versions before allocation. Invalid selections400; drift/expiry409; audit failure rolls back business/children/result, sequence gaps remain legal. Receipt registration is a separate durable technical transaction, not a partial business save.

Input quantity/parameters use canonical decimal strings; null !=0, dates are exact valid YYYY-MM-DD. Existing master IDs remain TEXT, UUID is only used for new request identities. Preset and accepted existing FX defaults become a PV-owned snapshot, never a live master reference. No-preset keeps FX/markup/freight null and CNY explicitly technical/incomplete. Optional `pricingParameters.configuration` records creation-time provenance/status using a source array (avoids treating decimal-named object keys as numbers); it is not a new calculator or retrospective rewrite. Later PV settings editing is the existing workflow.

All routes require trusted session/quote.create; final DB permission recheck. Preview numbers require quote.cost.view or quote.settings.edit; overrides require quote.settings.edit. Preset maintenance remains independent/settings.global.edit. Complete detail still separately needs quote.view and existing field permissions. Roles/catalog unchanged.

UI doubleclick uses a synchronous single-flight/request latch. Any submitted unknown outcome blocks new creation and only queries the original receipt; URL retains the request UUID for reload recovery, not credentials or business storage. Same token + changed payload rejected. Rejected receipt requires explicit re-review with input retained. Pending/missing receipt is not proof of rollback and never authorises automatic re-POST; unresolved pending requires investigation rather than guessing. A committed-but-lost response recovers the same Quote ID, without a new number.

## 0010 migration / backup rehearsal

- Adds only `quote_creation_previews` / `quote_creation_receipts`, no backfill or business seed; normal startup remains verify-only. No edits to published0001–0009. Only new0010 has an LF `.gitattributes` rule; old line endings/checksums are not globally normalised.
- This task's disposable PostgreSQL16/tmpfs database was populated at0001–0009 with trusted identities, masters, old runtime Quote and synthetic full aggregate (history/PVs/Estimate/cost/snapshot refs). Before/after JSON readback of every prior public table matches; migration only0010, rerun skips, ledgercurrent.
- Pre-upgrade custom pg_dump was hashed and pg_restore'd into a second owned disposable database, all old rows compared, then0010 applied/current/readback verified. Latest test dump SHA-256 `b564cb6793b5f074ad12f1a10281d3a7f19c355679d2f4f9f07ba1f9ebde5eb5`; synthetic disposable artifact, not a backup of18444 or real business. Container/tmpfs cleanup removes only test resources. No host data volume/real credentials/COS.
- **18444 NOT UPDATED /0010 NOT EXECUTED THERE**. New Preview migration needs separate user approval after this evidence is reviewed; then exact target/old migration bytes/current ledger + fresh recoverable DB/object backup must be checked before migration/app+gateway update. Do not initialise accounts, seed/reset existing demos or auto-restore on failure. Preserve all current demo Quotes/attachments/preferences. The existing18444 URL is not a two-step deployment claim.

## This task's verification (not earlier PR evidence)

- `npm run test:quote-creation`:25/25 PASS, DTO/API/TX/actor isolation, invalid/master drift, exact decimal/null0/date, same-token concurrent dedup/replay, original preset snapshot, populated upgrade/dump restore.
- Final full actual Chromium67/67 PASS after status-text polish; two-step explicit preset paths, back/cancel/no allocation, doubleclick, preview409 retains inputs, server-committed response loss/reload/GET-only recovery. Existing edit/version/history, cost-sync409/network, Estimate, linked confirmation, permissions, exact decimals, attachments and downloaded bytes/SHA, customer files/internal summary retained; no unhandled browser rejection/automatic retry.
- Focused D-099 actual pixels/images27/27 PASS:100px/reload/group↔field, other column widths unchanged, four desktop widths, protected thumbnail/relationship/permissions/no per-row aggregate reads.
- Affected Quote API/Revision/Estimate/attachments/thumbnail/0009 DeliveryPlan suite63/63 PASS; additional PostgreSQL foundation/CCT/fresh-start28/28 PASS. Explicit latest-migration lists now include0010; historical subset tests unchanged. New creation integration is part of regular test:postgres, which was not rerun in full (these scoped executable suites were run).
- auth/frontend83/83 (includes SSR/presentation), npm679/679, typecheck/lint/Server build/Server frontend PASS. Default Browser frontend PASS with build-info browser/browser/writable/session; environment changes were process-scoped, no .env edits. Candidate Linux smoke remains pending. Synthetic profiles, isolated ports/PG/memory storage, cleanup PASS; no real Browser reads/writes.
- Earlier failed attempts retained: obsolete nine-migration API expectation and legacy POST counter updated to exact0010/one workflow/zeroPOST{}/zeroPUT; a wizard test waited on already-visible generic text instead of completed preview, corrected to the actual response marker. Final lint caught ref access during rendering in the status label; display state was separated from the synchronous request lock and full Chromium/typecheck/lint/Server build rerun PASS. No assertion disabled or permission/precision relaxed.

## Delivery / pending

API checkpoint `1b927b234e7e8f3b7efe4c1ed3cafe935fe8788e` remotely exact verified after uncertain network push. UI/verification checkpoint and candidate identity recorded after completion. No automatic merge, real deployment, historical import or Q5 Execute. D-096 historical import NOT REQUIRED. User UI acceptance PENDING, Preview migration approval still required. Current18443/old3000–3002/real DB/COS/keys and other worktrees unchanged.
