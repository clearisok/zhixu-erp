# 正式订单物料夜间集成（2026-10-11）

## Gate 0 — main 整合

起始 branch `feat/ainuoke-order-material-progress`，本地/远端 #92 `0f2bbb161a108e77cd13f7cc843aca46af697771`；此前 REMOTE PENDING 已由本轮 fetch/GitHub exact SHA 核实送达。

最新 main / #91 merge：`fcf36e5eab6c78254f808c1cba38f3a63a66d4f8`，#91 MERGED，#92 OPEN/Draft。专属工作树 `D:/workspace/zhixu-order-material-b`，无其他未知 dirty。普通 merge 无冲突，未改写 #91 代码、0010/0011 或其原部署证据。Inherited dirty `order-material-read-gate1.md` 30行，SHA256 `8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E`，不 stage，必须全程保留。

Gate0 本轮 typecheck、npm755/755（0 skipped）、Server build、frontend build42 routes、diff-check PASS。没有实际业务 DB/账号/Preview操作。

后续：商业字段 SECURITY GATE PENDING，精确权限键与默认授权未批准；只实现可注入策略、隔离 API/组件与合成验收。生产页面白名单不开放，真实来源不接线。采购价格共享，与 Quote成本/销售价/工价/利润保护分离。

## Gate 1 — SECURITY GATE PENDING

Gate0 checkpoint `d321e0700b97d007f812bd5333a4bb6d86f43640` exact remote confirmed after push ref-lock reported target already present.

Actual disposable PG16 + trusted session HTTP audit1/1 proves ordinary order.view/quote.view actor receives both CCT prices on Order and Quote GET, and Quote aggregate labor-cost sentinel with no quote.cost.view. Audit PASS means vulnerability reproduced, NOT security fixed. Existing list/internal-export cost masking does not cover these aggregate/terms paths. Existing frontend CCT reads/cache rely on these APIs; React hiding cannot close exposure.

Independent injectable field projection2/2 uses default-denied sale/labor decisions, whitelisted result and omitted restricted fields, preserves null/zero/currency and original terms. No new keys, role defaults or catalog/schema changes. Policy is preparatory and not installed on legacy routes; CCT transaction/CAS/history unchanged. Required future decision: exact sales/labor/profit view/edit policy and compatible response/write contracts. Production Order/Style routes remain outside Quote Server whitelist.

Typecheck PASS. Files: independent commercial-read-policy.ts, unit test, actual HTTP security-audit test, task report/handoff. Own disposable random loopback/temp PG cleaned; no actual business database or accounts used.

## Gate 2 — isolated session HTTP

Gate1 checkpoint `2dca6381b765a7e5b616281a52c21638d25dfacd` exact remote verified after same target-present ref-lock.

`GET /api/v1/sales-orders/:uuid/material-progress` is registered but disabled unless AppDependencies explicitly installs `orderMaterialRead` trusted capability. Default createApp/index does not install it: 503 not connected, no real provider. Configured resolver must enforce team visibility; client accepts UUID only, query selectors rejected, auth/session + order.view/style_progress.read precede Source, success Cache-Control no-store. With resolver but no Source reader, result is not_connected; no Browser fallback. No Source write API.

Actual HTTP10/10 PASS in own random disposable PG16 (0010/0011 only on this temporary database) with real login cookies, two actor/order scopes, fixed synthetic Discovery/Material providers. Covers401/403/404, arbitrary account rejection, account switch, source procurement prices, protected sentinel omission, unknown/zero, drift, missing/failed/stale/incomplete/empty/async-time. Container/database cleaned. The first async typecheck completed with an implicit orders-array type error after the HTTP tests passed; the Gate2 commit was made before its final output was inspected. The follow-up explicitly types the fixture array and reruns typecheck before UI work. Normal coarse list/detail remains unchanged and is not proven team scoped; production whitelist remains blocked.

## Gate 3 — actual UI isolated integration PASS

HTTP Gate2 `d98ccec8ceb617670894e0e02089d04b3c14a233` exact remote confirmed; fixture typing follow-up `58f647c61966c24ea7fb2a978d8446c4991fb7ed` typecheck PASS before UI work.

Original ServerOrderCenterPage → original ServerSalesOrderDetailPage executionOnly mode → compact same-projection summary → existing style-progress detail path with explicit Server read-only Control Tower → UUID return. Actual normal detail entry now requests executionOnly: no CCT GET, no terms editor; source/colors remain outside commercial condition. Load generation/AbortController prevent old results being shown across scope changes. No price/new source/business algorithm or Repository added.

Control Tower shares extracted existing card/table display with Browser mode; Canonical grouping and item state are from the sole v1 DTO. Source prices and distinct event lists expand in cards; no cross-unit group quantity totals. Server component mounts trusted permission/session providers, not Browser planner/import/provider. Browser route without orderId preserves original behavior; orderId in Browser authority explicitly refuses fallback. Global Quote Server whitelist is unchanged and continues blocking official activation.

Isolated Vite adapter mounts actual list/detail/Control Tower components (not old standalone preview), uses dynamic loopback API, fresh private Chromium and synthetic session users. 1440/1280/390 UI5/5 PASS,37 assertions; shared layout/green sidebar/card density retained. Six screenshots in evidence/order-material-night. Search/refresh/return, color details, no CCT/Quote API, no Browser business writes, no external origins, zero root horizontal overflow PASS. Table overflow stays inside its scroll container. All browser/profile/API/Vite/disposable PG cleaned.

Initial browser isolation assertion matched source-module URLs containing confirmed-commercial-terms; fixed to classify only actual /api/ paths, retaining strict no-sensitive-API assertion. JSX review found the commercial condition also wrapped colors; corrected and added actual three-width color assertion. Typecheck/full npm757/757/Server+frontend42 routes PASS. Full lint initially had only test ternary warning; targeted final touched-code lint PASS after replacing it with explicit if/else. No real business runtime touched.

## Gate 4 — final isolated acceptance

- Final focused Source/Gate1/policy:78/78 PASS,0 skipped (Adapter29 + Gate1/old projection47 + policy2).
- Final real trusted-session HTTP / CCT regressions / known-exposure audit:19/19 PASS,0 skipped (Material11, CCT7, exposure audit1). Audit PASS is still SECURITY PENDING, not a repaired legacy API.
- Actual Chromium components:7/7 PASS,43 assertions at1440/1280/390. Added real synthetic session switch A→B→A, unauthorized B rejection with no cached material, unconnected UI and DOM summary/detail item-count parity. First added switch assertion relied on PageHeader description, which is hidden on narrow screens; now Source contract is explicitly visible in a compact line, and tests wait for target BillNo+rows. Cookies restore in finally. No security assertion skipped/weakened.
- Full npm757/757,0 skipped; final typecheck/lint0 warnings/Server build/frontend42 routes/diff-check PASS. Server and frontend builds serial. Repeated only for subsequent code fixes/integration assertions.
- Existing CCT test inherited main's expected migration list ending0010 while actual ledger contains0011. Added exact0011 filename to the expected array; no SQL/migration bytes changed. CAS/shared current/currency/history/audit rollback remain tested.
- Developer manual preview `npx tsx features/ainuoke-material-progress/integration-preview/demo.ts` uses this same disposable fixture/API/actual components. `--verify` smoke passed real login proxy and cleanup. Fixture allows only explicitly registered dynamic127.0.0.1 origins, rejects3000/3001/3002/18443/18444. Synthetic users only; no deployment/env/credentials loaded.
- All private browser profiles, loopback API/Vite servers and own random PostgreSQL16 containers cleaned. Final `docker ps --filter name=zhixu-pg-it` empty. Only temporary DBs received repository migrations; no real business DB, Preview, COS or original Browser data touched.

### Commercial path matrix

| Path | Evidence / remaining boundary |
| --- | --- |
| Order/Quote CCT GET | Actual ordinary view-only session returns sensitive current prices; remains unpatched pending exact independent policy |
| Quote aggregate detail | Actual quote.view actor receives internal labor-cost sentinel without quote.cost.view; existing estimate filtering does not cover it |
| Quote list/internal summary | Existing projections/guards separately mask or require cost permission; no generalization to aggregate detail |
| Customer Excel and ZIP | Code requires quote.view+quote.export+quote.cost.view; current shared CCT overlay is preserved, future independent sale/labor export rules still require policy review |
| Client memory/cache | Server clients use no-store but that does not redact response or React memory; existing unsafe read paths remain a risk. New Material client uses no-store/abort/scope check, only safe Material DTO |
| Execution-only detail / read Control Tower | Actual browser makes no CCT/Quote request, no Browser business storage writes; server response excludes protected commercial fields; default-denied preparatory CCT projection never becomes part of Material DTO |

Future color-level CNY sale price is not inferred from the existing scalar CCT. No new field/schema/key/default role policy is selected. Synthetic account switch proves injected scope/session isolation, not real personal Ainuoke binding.

## Gate 5 — engineering handoff / approval boundary

**LOCAL ISOLATED ENGINEERING PASS / SECURITY GATE PENDING / SYNTHETIC UI ACCEPTANCE PENDING**. PR #92 remains the only Draft. This handoff is docs-only; no new business policy is marked Active.

| Phase | Checkpoint / actual incremental files |
| --- | --- |
| Gate0 | `d321e0700b97d007f812bd5333a4bb6d86f43640`: ordinary merge of exact main fcf36e5, existing PR91 paths preserved; B recovery note in AI_HANDOFF and this independent task report |
| Gate1 | `2dca6381b765a7e5b616281a52c21638d25dfacd`: commercial-read-policy.ts, tests/order-material-commercial-policy.test.mjs, server/integration/order-material-security-audit.test.ts, this report |
| Gate2 | `d98ccec8ceb617670894e0e02089d04b3c14a233`: server/app.ts, order-material-fixture.ts, order-material-http.test.ts and this report; fixture type-only correction `58f647c61966c24ea7fb2a978d8446c4991fb7ed` |
| Gate3 | `e7c79d1abb24a8542a6628edec3a7c488d0ace76`: actual order/list/detail and style detail/CSS entries, shared Control Tower display+readonly components, material HTTP client/summary, independent integration-preview driver/CDP test, six synthetic screenshots and this report |
| Gate4 | `43b6675286922565f3f26cc191ea9f55e0e9cdc2`: final browser assertions/screenshots/README, manual demo.ts, compact contract identity line, isolated fixture/default-disabled HTTP assertion, CCT migration-ledger expected0011 filename, this report |
| Gate5 | Minimal ORDER_CENTER/STYLE_PROGRESS/SALES_ORDER_PERSISTENCE docs, CURRENT_STATE/AI_HANDOFF and this task handoff; final docs checkpoint is recorded in the final delivery receipt/PR |

Exact per-checkpoint file lists remain reviewable with `git diff-tree --no-commit-id --name-only -r <checkpoint>`; for the merge, use its first-parent diff. The pre-main strict zero intersection policy is superseded by this explicitly authorized post-PR91 merge task: shared server/app.ts and minimal state/handoff docs are now intentional incremental changes. No Quote feature, shared permission catalog, 0010/0011 migration bytes, deployment configuration or Codex A worktree change. The CCT integration test only reconciles its expected ledger with main's existing0011. Final PR91 intersection is exactly four paths: docs/AI_HANDOFF.md, docs/CURRENT_STATE.md, server/app.ts and server/integration/confirmed-commercial-terms.integration.test.ts. All are the authorized post-merge increments described above; Quote UI, migrations and permissions do not intersect.

Gate4 initial push failed with curl56/schannel close_notify disconnect. One read-only verification confirmed remote and PR still `e7c79d1abb24a8542a6628edec3a7c488d0ace76`; `43b6675286922565f3f26cc191ea9f55e0e9cdc2` remained local then. This is a confirmed transport failure, not permission/divergence evidence. No force/rebase/reset/clean, credentials/config change or blind retry. Final Gate5 has one normal checkpoint delivery attempt; its exact receipt is reported separately, never inferred from “Everything up-to-date”.

Remaining dirty is only inherited `docs/tasks/active/order-material-read-gate1.md`, preserved byte-for-byte SHA256 `8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E` and never staged. Latest independently verified origin/main remains fcf36e5. No merge conflicts remain.

### At most five manual acceptance steps

1. In this worktree with Docker/Node available, run `npx tsx features/ainuoke-material-progress/integration-preview/demo.ts`. This creates only its own random PG16/tmpfs/loopback ports and prints a synthetic entry URL.
2. Use a separate private browser profile; open that URL and login as printed synthetic `tracker-a / synthetic-only`. All orders and Source are test data.
3. From the actual formal list, open the first order; inspect source identity, color/size rows and compact material counts. There is no CCT/price editor in this execution-only detail.
4. Open material follow-up; search, refresh and expand purchase/inbound/shipment/outbound rows, then return to the same UUID. Review1440/1280/390 widths; procurement Source prices are visible, protected commercial domains are absent.
5. Ctrl+C terminates the driver and cleans only its owned Vite/API/disposable PG. The existing business/Preview environments are never involved.

Reproducible focused commands (all executed this round):

```powershell
node --test tests/order-material-source-adapter.test.mjs tests/order-material-read-gate1.test.mjs tests/ainuoke-material-progress.test.mjs tests/order-material-commercial-policy.test.mjs
npx tsx --test --test-concurrency=1 server/integration/order-material-http.test.ts server/integration/confirmed-commercial-terms.integration.test.ts server/integration/order-material-security-audit.test.ts
npx tsx --test features/ainuoke-material-progress/__tests__/integration-browser.test.mjs
npx tsx features/ainuoke-material-progress/integration-preview/demo.ts --verify
```

Full `test:postgres` was NOT RUN this night Gate; the19 focused disposable HTTP/CCT/audit tests and actual UI disposable fixture were run, not substituted with old152 results. Typecheck/lint/npm test/serial Server+frontend builds/diff-check were separately executed as recorded above.

### Required next authorization, not implemented

- Approve exact independent sale/labor/profit view/edit policies and role defaults; define the existing CCT/Quote aggregate/list/export response compatibility, then install Server-side redaction on every relevant read path. Preparatory injectable deny policy alone is insufficient.
- Define company/team Order list/detail scope and controlled collection identity; actual personal Ainuoke binding is unimplemented. Synthetic trusted users prove test scope only.
- Approve real Source retention, explicit freshness SLA and runtime account/report configuration. No live fields, units, currencies or prices are inferred from this synthetic fixture.
- After security and scope proofs, separately approve global route whitelist/production capability activation and real environment acceptance. This task is not deployment authority.
- Quote/Reorder business-source backfill, future color-level CNY sale prices/non-API C/S Excel reconciliation and finance/profit remain separate design work; do not block this read-only slice with invented source/provenance.

Completed all safely executable night work. Stop after final receipt; keep #92 Draft and await user review.
