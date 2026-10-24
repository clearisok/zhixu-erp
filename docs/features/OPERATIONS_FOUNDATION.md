# 订单、排单与关账共用基础设施

## Purpose

为订单、排单和关账提供可复用的生产基础资料、关账默认设置、权限目录、追加式日志和非破坏持久化边界。本模块自身不承载业务流程；订单业务位于 `features/order-center/`，排单业务位于 `features/production-scheduling/`，关账业务位于 `features/closing-center/`。

## 当前 Server 资源接线（2026-10-24，D147 G6A）

下文聚合 Repository、默认值和关账仍为 Browser 历史。当前独立 Server 候选使用
`server/production-resources/` 与0034：生产日历→地点→组，以及独立外发厂；稳定UUID、版本、
停用保留历史、无Seed，不挂载Browser聚合normalizer。三个既有页面复用原表格/同页卡片/抽屉与共享字段。
工程终态见[本轮任务](../tasks/active/server-production-resources-current-2026-10-24.md)和[f441冻结验收证明](../tasks/completed/2026-10-24-production-resources-current-engineering.md)：73相关领域/API、根811、before2/after14/导航18及双构建通过，发布/最终守卫另记。不把资源CRUD称排单/完成闭环。

- 正式session接口 `/api/v1/production-resources/{calendars|sites|groups|factories}` 列表/UUID详情，
  无local-single-user或Browser fallback。空格分词AND、分页≤100、完整候选超过5000拒绝而非截断；
  日历列表仅例外数量，编辑前读完整详情。组复用既有自然排序，同名不作身份。
- 命令要求requestId/action/kind/resourceId/expectedVersion/data；日期真实、工作周非空唯一、
  每天一个例外，最多1000例外/3650提前天数。启用地点/组要求当前父资料可用并锁到提交；
  停用父项不自动改子项和历史。SQL保护创建身份/版本，资源停用代替物理删除。
- 沿用三个edit权限与schedule.view；组编辑者只读关联地点/日历。数据库重读active身份/权限，
  用户→稳定角色→绑定/权限→资源锁序兼容D146。资源、例外、审计和不可变回执同事务；
  CAS/已知关联拒绝持久化，GET原actor/request返回known/pending/unknown，未知不自动重发。
- 输入、临时outbox、SQL回执仍各限1MiB。事务在原SAVEPOINT内按真实jsonb::text核验结果；
  超界回滚本次资源/例外/审计，持久化小型422拒绝（含no-op），不扩大限额、截断或限制原合法字符。
  客户端核对request/kind/hash及精确状态code后才确认；裸错误或摘要不符保留原命令。
- 先完整保存/读回同用户同类型sessionStorage原命令，再POST；刷新只GET核对，明确unknown后才允许
  原ID原内容重试。会话/layout owner保护覆盖A→B→A；成功/已拒绝后重读当前目录，
  不拿发生时回执冒称最新。CAS重新读取在当前目录授权恢复前disabled。
- 0034只新增空表，不回填/授予角色/建排单/改商业数据，启动仍verify-only。物流和关账后置，
  不重标下文Browser RMB历史或新增换汇。实际目标尚未升级。

## Browser current behavior / 历史兼容

- “基础设置 > 生产组”支持查询、新增、编辑、排序、备注和启用/停用。
- “基础设置 > 外发厂”支持查询、新增、编辑、联系人、电话、备注和启用/停用。
- “系统设置 > 关账设置”维护默认销售产值税率和按月的总加工/内部加工产值目标。
- “系统设置 > 生产与运输”按三个业务问题组织：在哪里生产、物料从哪里发、仓库到工厂怎么走。生产组必须归属生产地点；路线与运输方式通过一个“运输方案”工作流维护，底层仍保存既有 `SupplyRoute` 与 `TransportMode[]`。
- 生产日历使用星期勾选和结构化特殊日期表单；用户不直接编辑 weekday 数字串或 exceptions JSON。
- Configuration Health 从正式生产组、地点、日历、集货仓、路线和运输方式动态诊断缺口，并提供权限受控的修复入口。
- 无权限按钮保持可见、disabled，并显示统一提示；表单 mutation 也有显式权限守卫，不能通过 Enter 绕过。
- 保存成功后向统一 `OperationLogRepository` 追加字段级日志。

## Data model

权威模型位于 `features/operations-settings/model/operations-settings.ts`：

- `ProductionGroup`：稳定 ID、名称、简称、`productionSiteId`、启停、排序、备注和时间戳。
- `ProductionSite / ProductionCalendar`：实际生产地点、产前样提前期、每周工作模板和优先级更高的特殊日期。
- `SupplyHub / SupplyRoute / TransportMode`：供应枢纽、到生产地点的路线及自然日运输方式。
- `OutsourceFactory`：稳定 ID、名称、简称、启停、联系人、电话、备注和时间戳。
- `MonthlyProductionTarget`：稳定 ID、`YYYY-MM` 月份、可空总加工产值目标、可空内部加工产值目标、备注和时间戳。
- `ClosingSettings`：默认销售产值税率与月度目标数组。
- `OperationsSettingsState`：生产组、外发厂和关账设置的独立聚合。

共享值对象位于 `features/shared-domain/model/operations.ts`：`OrderType`、`ExecutionType` 和 `ClosingPeriodStatus`。这些类型只固定术语，不提供对应实体或 CRUD。

## Business rules

- 生产组和外发厂以 ID 作为身份，名称允许重复；历史引用应通过停用保留，不做物理删除。
- 月度目标同一月份只能有一条；金额单位统一为 RMB，空值不自动转成 0。
- 默认销售产值税率初始为 13%，只作为新 ClosingPeriod/ClosingAllocation 的默认来源；已保存关账使用自己的快照。
- 外发厂不保存订单/排单反向集合；未来外发执行关系应属于排单分配。

## Repository and persistence

- Repository：`features/operations-settings/repository/operations-settings-repository.ts`。
- 稳定记录：`zhixu.erp.local.operations-settings`，使用共享 `LocalDataStore` envelope。
- 全局浏览器 schema 当前为 v13；本模块继续使用既有稳定记录和向前兼容读取。历史 v8→v9 对缺失/空设置集合的安全默认与旧生产组地点关联仍保留，不覆盖现有基础资料。
- 数据管理备份自动包含该 raw record；旧备份无此记录时恢复后读取安全默认值。
- 当前没有 API、数据库表、Alembic 或 PostgreSQL migration；旧 `orders`、`schedules`、`audit_logs` 未修改。

## Frontend behavior

- 页面组件：`features/operations-settings/components/operations-settings-pages.tsx`。
- 路由：`/basic-settings/production-groups`、`/basic-settings/outsource-factories`、`/system-settings/closing-settings`、`/system-settings/production-infrastructure`。
- 页面复用 Foundation Page/Card/Table/Modal/Form/Button，不引入独立 UI 体系。
- 生产地点卡显示被生产组引用数量并禁止物理删除；集货仓卡显示服务路线；运输方案把 Hub、Site 与方式列表合并编辑，保存时仍调用原 Repository。页面帮助文案准确解释“预计到料 + 运输自然日 = 预计到厂；计划开工 - 产前准备 = 最晚到厂；选择最慢可行方式”，不暴露 TypeScript 实体名。

## Permissions and audit

- `settings.production_group.edit`、`settings.outsource_factory.edit`、`settings.closing.edit` 和 `settings.production_infrastructure.edit` 分别控制对应设置。
- `closing.target.manage` 单独控制月度目标；管理员默认拥有全部新增权限，报价员和查看员不自动获得。
- 设置日志使用统一 `OperationLog`，一次业务动作共享 `operationId`，保存稳定对象 ID 与字段级 `changes[]`。

## Important constraints

- 不得把本模块状态塞入 Quote、QuoteRevision 或 PriceVersion。
- 不得借本模块修改旧 PostgreSQL 订单/排单/审计表。
- 订单权限键由新订单中心消费，`schedule.view/create/edit/complete` 由排单中心消费，`closing.view/edit/confirm/lock/reopen` 由关账中心消费。
- 正式后端实现前仍需设计 API、事务和 migration；当前 owner 边界为 `SalesOrder → ScheduleAssignment[]`，以及 `ClosingAllocation.salesOrderId` 与可空稳定 `scheduleAssignmentId`。生产地点、生产日历、供应枢纽、路线与运输方式也保存在本模块。

## Tests

`tests/operations-infrastructure.test.mjs` 覆盖模型、稳定 ID、Repository 重载、旧版本向前迁移、v9 排单备份兼容、权限不扩张、字段级日志、生产地点/集货仓 CRUD、可读星期与特殊日期、组合运输方案、Configuration Health，以及正式物流推荐服务不变的契约。

## Known gaps

- 当前仍是单浏览器 localStorage mock，不具备多用户并发、服务端约束或不可篡改审计。
- `ClosingPeriod`、`ClosingAllocation`、关账计算、确认/锁定/重开流程已经由关账中心实现。
- 关账当前仍是浏览器 mock，不包含正式财务凭证、应收应付、发票、付款或总账报表。
