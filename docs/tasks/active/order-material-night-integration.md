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
