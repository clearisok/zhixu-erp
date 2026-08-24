# Quote Center 操作日志

## Purpose

为 Quote Center 的关键业务写操作提供可追溯的追加式记录，回答“谁、何时、对哪个对象做了什么、修改前后是什么”。操作日志是独立审计数据，不替代 Quote Revision 历史，也不进入 Quote、QuoteRevision 或 PriceVersion。

## Current behavior

- 报价详情顶部、吸顶操作区和移动端更多菜单均提供“操作记录”入口；系统设置提供全局“操作日志”页面。
- 时间线按 `createdAt` 倒序展示操作人姓名快照、操作、Revision/PriceVersion/成本行上下文和字段前后值。
- 日志只在 Quote repository 保存成功后生成；尚未保存的输入不会写日志。
- 新建报价首次保存记录“创建报价”；报价硬删除成功后记录“删除报价”。
- 新建/删除报价版本、创建/删除价格版本、客户确认以及面料、辅料、工价、其他费用变更均通过已保存快照差异生成。
- 新增图片/文件、删除附件、款式图引用和估算成本动作在保存报价后记录。
- 报价单/批量/汇总导出、模板上传/默认/状态和角色/权限/账号状态修改在对应操作成功后追加。
- 仓库接口提供 `append`、`appendMany`、全局 `list` 和 `listByQuoteId`，没有编辑或删除能力。
- 全局页面使用 Dense Table，支持款号、款式名称、用户、操作、模块和对象内容搜索，支持日期范围、用户、模块和操作类型筛选；点击记录显示格式化 before/after。

## Business rules

- OperationLog 只能追加，不能编辑或删除。
- 日志记录时点是业务保存成功，而不是 Input `onChange`。
- 同一保存事务中的成本变化按 PriceVersion + 成本行记录；只保留发生变化的字段，空值仍为 `null`，不会变成 0。
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
  action
  beforeData
  afterData
  createdAt
}
```

`beforeData` / `afterData` 保存可展示的业务字段快照，不保存 React 状态或整个 Quote 对象。

## Persistence and API

- Repository：`features/operation-logs/repository/operation-log-repository.ts`；全局和报价详情读取同一数据源。
- 当前存储：localStorage `zhixu.operation-logs.v1`
- 当前没有操作日志 API、数据库表、migration 或服务器端写入保证。
- 存储与 Quote mock repository 分离，因此不会改变现有报价数据结构。

## Frontend behavior

- 入口接线：`features/quote-center/components/quote-editor.tsx`
- 时间线：`features/operation-logs/components/operation-log-modal.tsx`
- 全局查询：`features/operation-logs/components/global-operation-log-page.tsx`
- 样式：`app/globals.css` 中 `qc-operation-log-*`
- 历史时间线只读，不提供编辑、删除或清空按钮。

## Important constraints

- 不得把 OperationLog 数组塞入 Quote Revision。
- 不得用日志替代 Revision 完整快照或客户确认快照。
- 不得在每次键盘输入时写日志。
- 未来服务端实现必须在业务写事务成功后追加日志，并由后端重新确定当前用户；不能信任客户端传入的操作者。

## Tests

`tests/operation-logs.test.mjs` 覆盖面料单价前后值、辅料/工价/其他费用、价格版本、客户确认、附件、报价/Revision 生命周期、只追加 repository 和 Quote Editor 保存接线。

## Known gaps

- localStorage 可以被客户端修改，不是生产级不可篡改审计存储。
- 当前日志只覆盖 Quote Center；根路径 ERP 继续使用 PostgreSQL `audit_logs`，两者未合并。
- 当前全局页面没有分页、日志导出或保留策略。
- 现有代码没有 Quote Revision 删除 UI，因此“删除报价版本”差异能力已预留，但没有可触发的当前页面操作。
- 附件日志当前记录稳定附件 ID；尚未把文件名快照写入日志。
