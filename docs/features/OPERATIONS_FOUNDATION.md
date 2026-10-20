# 订单、排单与关账共用基础设施

## Purpose

为订单、排单和关账提供可复用的生产基础资料、关账默认设置、权限目录、追加式日志和非破坏持久化边界。本模块自身不承载业务流程；订单业务位于 `features/order-center/`，排单业务位于 `features/production-scheduling/`，关账业务位于 `features/closing-center/`。

## Server收敛进展（2026-10-20，Gate6）

现有下文页面和聚合Repository仍属Browser owner。Server现有独立四资源后台（`server/production-resources/`、0034）：生产日历→地点→组及独立外发厂，稳定UUID、版本、停用保留历史、无默认Seed，不调用Browser聚合normalizer。后台不表示资源UI或排单已接通；当前只是6A后台小阶段。物流与关账不混入；Server关账目标按D147为CNY销售/USD工价，未实现，不修改下文Browser历史RMB字段。精确阶段证据见[Gate6](../tasks/active/server-convergence-gate6-2026-10-20.md)。

### Server接口与事务边界

- 仅正式session authority开放 `/api/v1/production-resources/{calendars|sites|groups|factories}` 列表及 `/{kind}/{uuid}` 详情；不存在local-single-user或Browser fallback。列表按显式启停过滤，搜索以空格分词为AND，limit≤100；完整候选超过5000时明确拒绝并要求细化搜索，不截断冒充分页。日历列表只给例外数量，完整日期从详情读，防止列表复制1000项例外。生产组复用既有自然排序函数；同名允许，不以名称去重。
- `POST /commands` 精确接收requestId/action/kind/resourceId/expectedVersion/data，创建不接受调用方ID，更新必须正版本；输入真实日期、非空唯一工作日、每天一个例外、最多1000例外/3650提前天数，伪actor/时间/价格字段拒绝。HTTP body上限1MiB。新启用地点/组要求父日历/地点启用，锁到事务提交；停用父资料不自动改子资料或历史。
- 沿用三个既有edit权限键，无新增grant。`schedule.view`可读；对应编辑者可读自身类型，生产组编辑者可只读地点/日历用于选项。写入从库中重读active身份和授权；锁序为用户→角色ID顺序→绑定/权限→资源，兼容角色管理的角色→权限顺序。过期调用方permissions/name不作为依据。
- actor/request有界互斥，规范化payload哈希防变内容；资源/例外/追加审计/不可变回执同事务，整条日历一次提交。CAS冲突或已知关联拒绝保存终态，重放不重新生效；未知异常全部回滚。`GET /commands/{requestId}` 仅同一actor及当前对应edit权限，返回known/pending/unknown，不能据unknown自动重POST。重放的resource是发生时版本，不冒称最新，需另读当前详情。
- 0034仅新增空表，不回填、不改既有迁移、不建排单、不改商业数据。普通DML不能删除资源、篡改创建身份或跳版本，回执不可更新/删除；资源停用仍可查。日历例外修改保留于审计及原回执；未来排单须冻结采用的资源事实，不动态重写历史日期。

当前25项纯契约/真实一次性PostgreSQL/HTTP验证覆盖空库、权限、版本、幂等、拒绝、关联、竞态及回滚；完整回归与远端证据以Gate6任务最新记录为准。尚无资源页面/Server排单/完成/成衣出货/关账验收或真实目标升级。

## Current behavior

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
