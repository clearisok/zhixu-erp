# 织序 ERP 前端操作日志

## Q2B2A isolated writer audit boundary

The isolated Server writer performs one Q2A aggregate PUT and never appends Browser `operationLogRepository` records. The Server transaction remains the sole authority: a successful real change appends its one trusted PostgreSQL Quote OperationLog using the Server session actor; audit failure rolls back the aggregate. Stale 409, 401/403, unsafe decimal projection, no-op and client/network failure perform no Browser fallback or second log. C4.2 current terms are not mutated or audited by an aggregate save.

## Q2A Server Quote aggregate audit

Q2A create and real aggregate-save mutations append exactly one existing PostgreSQL `operation_logs` row inside the same Q1 write transaction. The actor comes only from the trusted Server session. The event stores Quote ID, create/save action, aggregate version transition, bounded Quote/default-Revision/count summary and safe request ID/method/path context; it never dumps the full Quote, attachment content or request body. Audit failure rolls back every aggregate row. Unauthorized, malformed, stale, immutable-history and no-op writes append no event. Browser-local Quote logs remain on their existing repository until Q2B cutover; Q2A does not dual-write them.

## C4.2 Server ConfirmedCommercialTerms audit

Every actual shared-current terms create/update appends exactly one existing PostgreSQL `operation_logs` row in the same transaction. The trusted session supplies actor ID/name; request bodies cannot supply or override actor. The log records old/new customer-confirmed price, confirmed labor price, labor currency and terms version, plus mutation surface, exact Quote provenance when linked, and associated formal SalesOrder UUIDs. Audit failure rolls back the terms and association; existing logs remain append-only. Adding the shared TypeScript action/entity labels does not create a second Browser persistence authority or require a Browser storage migration.

## Purpose

为 Quote Center、新订单中心与设置模块的关键业务写操作提供可追溯的追加式记录，回答“谁、何时、对哪个对象做了什么、修改前后是什么”。操作日志是独立审计数据，不替代 Quote Revision、订单数量或价格历史，也不进入业务聚合。

PostgreSQL Server Persistence Phase 1 已建立独立 server `operation_logs` foundation；browser localStorage repository 继续服务尚未 cutover 的现有业务，两者当前不双写。

## Current behavior

- 正式模型继续使用唯一的 `OperationLog` / `OperationLogRepository`，没有新增第二套 `AuditEvent`。
- 品牌和客户业务员的新增、修改、删除、默认汇率、默认其他费用与固定辅料变化，会在主数据保存成功后以稳定业务 ID、名称快照和字段级 `changes[]` 追加日志；报价页内的就地快速创建也走同一日志工厂。
- 系统报价设置保存后记录默认汇率、默认加成率、默认加工币种、默认其他费用、默认工序说明，以及制作预设新增、修改、删除和默认预设切换。全局制作预设维护与 Quote PriceVersion 选择预设是两种独立事件。
- 生产组、外发厂、默认关账税率和月度生产目标在各自 Repository 保存成功后追加设置日志；一次新增/编辑/启停/删除动作共用一个 `operationId`，字段差异仍保存在 `changes[]` 中。
- 新订单中心记录手工创建、报价生成、翻单、确认、基础信息修改、交期新增/修改/作废、数量调整、颜色级部分取消、全部取消、价格版本调整和整单取消。颜色取消日志保存目标颜色、有效数量 before/after、delta 与原因；来源颜色行不被覆盖。一次相关动作可共享 `operationId`，订单/款式/报价来源上下文和字段级差异写入同一 OperationLog 模型。
- 关账中心记录创建月份、新增/修改/作废归属、同步/保留排单快照、确认/取消确认、锁定和重新打开；重新打开必须保存原因。一次归属保存中的多个字段变化共享 `operationId`，继续写入统一 Repository。
- 款式进度只在用户修改“当前预计到料日”或恢复艾诺科交期成功后追加统一 OperationLog，保存 MaterialDemand ID、订单/款式上下文、Source/Effective 修改前后与操作者。Excel ImportBatch/Raw Snapshot 是技术 Trace，不创建第二套审计日志，也不替代人工操作日志。
- PriceVersion 重新选择制作预设时使用“修改价格版本制作预设”事件，保存 quoteId、revisionId、priceVersionId/name、切换前后 presetId/name，并继续用 `changes[]` 记录国家、币种、加成率和运费快照差异。
- 批量报价单和批量汇总导出日志在 `exportQuotes[]` 中保存完整的最小业务快照清单：Quote、款号/款名、Revision，以及实际相关的 PriceVersion 和制作预设信息；不保存整个 Quote、附件或 Excel Blob。

- 报价详情顶部、吸顶操作区和移动端更多菜单均提供“操作记录”入口；系统设置提供全局“操作日志”页面。
- 时间线按 `createdAt` 倒序展示操作人姓名快照、操作，以及 Quote、Revision、PriceVersion、模块和成本行上下文与字段前后值。
- 日志只在 Quote repository 保存成功后生成；尚未保存的输入不会写日志。
- 新建报价首次保存记录“创建报价”；报价硬删除成功后记录“删除报价”。
- 新建/删除报价版本、创建/删除价格版本、客户确认以及面料、辅料、工价、其他费用变更均通过已保存快照差异生成。
- 新增图片/文件、删除附件、款式图引用和估算成本动作在保存报价后记录。
- 报价单/批量/汇总导出、模板上传/默认/状态和角色/权限/账号状态修改在对应操作成功后追加。
- 仓库接口提供 `append`、`appendMany`、全局 `list`、`listByQuoteId` 和 `listByOrderId`，没有编辑或删除能力。
- 个人艾诺科账号只在绑定成功、更新成功或解除成功后追加日志。payload 仅保留 actor、action、`result=success` 与 time；不保存 password、token/session、raw username 或 raw upstream response。连接测试与失败 credential 不写 secret 或 raw response。
- Ainuoke 合同 API read/preview 不写 OperationLog；用户明确确认同步后，只追加既有 `synchronizeAinuokeContracts` 生成的订单业务日志，不建立 API 专用审计模型。API ImportRun 是 sanitized source trace，不替代 OperationLog，也不保存 credential/token/session/header/cookie。
- Gate 4 统一层不创建“统一同步”日志，也不复制日志工厂；Contract/Material 各自在成功提交后继续追加既有领域日志。两侧 no-change 的刷新不写日志；partial failure 重试先重新 Preview，已成功侧变为 no-change，因此不会重复该侧日志。
- 显式清理旧历史 `schedule_match` / `closing_match` backlog 后追加“清理艾诺科旧迁移待确认”。日志只保存 actor、timestamp、removedScheduleReviewCount、removedClosingReviewCount 与 totalRemoved；不保存被删除 Review 的 payload、候选、原因或任何 secret。第二次幂等执行删除 0 条时不追加重复日志。
- 全局页面使用 Dense Table，支持款号、款式名称、用户、操作、模块和对象内容搜索，支持日期范围、用户、模块和操作类型筛选；点击记录显示格式化 before/after。

## Business rules

- OperationLog 只能追加，不能编辑或删除。
- 日志记录时点是业务保存成功，而不是 Input `onChange`。
- 同一保存事务中的成本变化按 PriceVersion + 成本行记录；只保留发生变化的字段，空值仍为 `null`，不会变成 0。
- 新日志在 `beforeData` / `afterData` 中保存 `quoteCode`、`quoteStyleNo`、`styleName`、`revisionId/Label`、`priceVersionId/Name`、`objectSource/Type/Id/Name`；技术详情直接读取这些事件快照，不用当前报价数据反推历史对象。旧日志缺少这些字段时保持兼容并显示“旧日志未记录”。
- `userName` 保存操作发生时的姓名快照；`userId` 保留稳定身份引用。
- `quoteId` 是报价详情聚合下级 Revision、PriceVersion、成本与附件日志的独立索引字段。
- 当前 mock 实现无法提供服务端不可篡改性、跨设备同步或多用户并发顺序保证；生产化时必须迁移到服务端追加表并由 API 在事务边界写入。

## Data model

权威模型：`features/operation-logs/model/operation-log.ts`。

```ts
OperationLog {
  id
  userId
  userName
  module
  entityType
  entityId
  quoteId // 非报价系统动作可为 null
  operationId // 同一次业务动作的关联 ID
  action
  beforeData
  afterData
  // data 中包含 Quote/Revision/PriceVersion/对象来源与名称快照
  createdAt
}
```

新订单日志只写 `orderId`、订单号、款号和 `reason`；`orderItemId` 仅作为旧日志兼容字段。v9 排单日志使用 `orderId/scheduleAssignmentId`，队列联动共享 operationId；`productionPlanId` 只读取 v8 旧日志。关账日志使用 `closingPeriodId/closingAllocationId` 和可选稳定 `scheduleAssignmentId`。

`beforeData` / `afterData` 保存可展示的业务字段快照，不保存 React 状态或整个 Quote 对象。

批量导出使用专用小对象 `OperationLogExportQuoteSnapshot[]`，全局日志 UI 可折叠展示完整款式和 PriceVersion 清单，折叠只影响呈现，不截断底层日志数据。

## Persistence and API

- Repository：`features/operation-logs/repository/operation-log-repository.ts`；全局和报价详情读取同一数据源。
- 当前存储：localStorage `zhixu.erp.local.operation-logs`；旧 `zhixu.operation-logs.v1` 仅作为非破坏迁移来源。
- Phase 1 新增 PostgreSQL `operation_logs` 与内部 append repository。actor 由 trusted session context 注入，保存 `app_users.id` RESTRICT FK、稳定 public ID 和姓名快照；数据库 trigger 拒绝 UPDATE/DELETE。
- `/api/v1/operation-logs` 只提供 `audit_log.view` 保护的读取；没有 client append/update/delete/clear API。浏览器业务尚未 cutover，因此仍写原 localStorage repository，不做未对账双写。
- 存储与 Quote mock repository 分离，因此不会改变现有报价数据结构。

## Frontend behavior

- 入口接线：`features/quote-center/components/quote-editor.tsx`
- 订单详情日志：`features/order-center/components/order-pages.tsx`
- 关账动作接线：`features/closing-center/components/closing-center-page.tsx`
- 时间线：`features/operation-logs/components/operation-log-modal.tsx`
- 全局查询：`features/operation-logs/components/global-operation-log-page.tsx`
- 样式：`app/globals.css` 中 `qc-operation-log-*`
- 历史时间线只读，不提供编辑、删除或清空按钮。

## Important constraints

- 不得把 OperationLog 数组塞入 Quote Revision。
- 不得用日志替代 Revision 完整快照或客户确认快照。
- 不得在每次键盘输入时写日志。
- 不得把个人 Ainuoke username/password、JWT/token、bridge session/CSRF、完整登录 URL 或 raw response 写入 OperationLog；账号日志的 entityId 只使用当前 Zhixu User.id。
- 未来服务端实现必须在业务写事务成功后追加日志，并由后端重新确定当前用户；不能信任客户端传入的操作者。

## Tests

`tests/operation-logs.test.mjs` 覆盖报价域日志；`tests/audit-settings-and-batch-export.test.mjs` 覆盖品牌、客户业务员、系统报价设置、制作预设、PriceVersion 预设切换和批量导出结构化快照；`tests/operations-infrastructure.test.mjs` 覆盖生产基础设置；`tests/order-center.test.mjs` 覆盖订单来源上下文、字段级 before/after、共享 operationId、确认日志与刷新读取。

## Known gaps

- localStorage 可以被客户端修改，不是生产级不可篡改审计存储。
- 当前统一前端日志覆盖 Quote Center、基础设置、系统报价设置、模板和权限；根路径 ERP 的 PostgreSQL `audit_logs` 仍是另一条既有后端路径，两者尚未合并。
- 当前全局页面没有分页、日志导出或保留策略。
- Server endpoint 当前只有有界最新 100 条读取，尚未接入分页/保留策略；业务 OperationLog transaction 接线随各领域独立 cutover 实施。
- 现有代码没有 Quote Revision 删除 UI，因此“删除报价版本”差异能力已预留，但没有可触发的当前页面操作。
- 附件日志当前记录稳定附件 ID；尚未把文件名快照写入日志。
