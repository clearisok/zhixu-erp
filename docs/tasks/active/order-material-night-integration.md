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
