# 订单身份与业务血统（Gate1开发中）

2026-10-14 / main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。用户批准规则见../tasks/active/order-identity-program.md；本文仅描述当前增量，不表示部署。

## 事实及边界

合同接纳继续复用server/sales-orders/service.ts，创建来源不改。0014新增侧表sales_order_identity_profiles与sales_order_preparations，既有SO无回填；只读通过精确来源link/mirror证明合同类型，否则unclassified。processing保留类型，G3未开放创建。
GET /api/v1/sales-orders/:uuid/identity返回业务类型、owner公共ID、血统和独立version。PATCH只接受claim/transfer/lineage各自精确字段；可信session、Origin与请求头、order.view和独立权限。事务重查账号/权限、CAS和审计；全局血统锁防并发环；原SO、镜像、交付计划及CCT不修改。
POST /api/v1/order-preparations使用actor/request UUID幂等，payload不同拒绝；保存正数量、可空交期、原订单及规格变化说明，不分配SO。准备UI/报价引用待完成，不冒称完整业务流程。

## 验证

9项合成隔离PG回归验证并发认领、类型读取不回填、血统环、事务审计失败回滚、即时撤权和准备不建SO；类型/Server编译/增量lint通过。HTTP/浏览器/完整基线仍待收口。

## 发布

新schema只在一次性PG验证，不升级真实数据库。身份/角色定义变更不等于真实授权。应用/schema兼容、历史类型、完整Gate1验收和精确PR CI通过前不能发布。后续变化时更新本文件及AI_HANDOFF，保留原证据。
