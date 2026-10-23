# 订单、排单与关账共用基础设施

## Purpose

为订单、排单和关账提供可复用的生产基础资料、关账默认设置、权限目录、追加式日志和非破坏持久化边界。本模块自身不承载业务流程；订单业务位于 `features/order-center/`，排单业务位于 `features/production-scheduling/`，关账业务位于 `features/closing-center/`。

## Server收敛进展（2026-10-20，Gate6）

下文聚合Repository仍属Browser owner。正式Server使用独立四资源后台（`server/production-resources/`、0034）：生产日历→地点→组及独立外发厂，稳定UUID、版本、停用保留历史、无默认Seed，不调用Browser聚合normalizer。6A已接线现有三个路由与共享表单，实际工程与远端状态以[Gate6](../tasks/active/server-convergence-gate6-2026-10-20.md)为准，不据此称排单/生产闭环。物流与关账不混入；Server关账目标按D147为CNY销售/USD工价，未实现，不修改下文Browser历史RMB字段。

### Server物流资料后台增量（2026-10-21，Gate6D）

本机后台切片新增0037空表和同一production-resources HTTP服务的hubs、transport-plans类型，当时保留原四资源客户端/页面。下文6A四类型说明保留其原范围；后续物流页面进展见下一节，不据工程接线称已部署或来源已激活。

- 集货仓与“路线＋完整方式列表”各有稳定UUID/父版本。新建只由服务端分配身份；更新包含全部已有方式（含停用），新增项modeId为null；移除、外来身份或跨方案搬移明确拒绝。方式列表保留提交顺序，sortOrder另存，运输天数为0–3650整数自然日，最多100项，不截断/四舍五入。
- 仓、生产地点均需显式UUID，不从首个/唯一选项或Browser默认值推断。启用方案要求仓、地点和日历均启用；停用父资料不级联修改已有方案。同一Hub/Site最多一个启用方案，停用历史可并存；同名仓、同名方案及同名方式不作身份去重。更改方案端点保留同一方案/方式身份及完整审计，后续执行必须采用冻结事实，不能动态重写历史。
- 沿用settings.production_infrastructure.edit；schedule.view可只读，生产组编辑权限不扩到物流。可信session/fresh DB身份、Origin/CSRF、相同actor/request互斥、原全资源写/冻结锁、父CAS、完整成员校验、资源/子项/审计/不可变回执共用一次事务，无新权限或第二writer。
- 列表沿用空格AND、启停、分页和5000候选上限，只给modeCount/enabledModeCount，不复制完整子列表；详情包含全部方式。更新不能从省略方式的列表拼空子集。新kind复用POST /api/v1/production-resources/commands及原回执GET；原请求hash口径保持，提交结果未知先读回执，不能盲目重建UUID或重发。
- HTTP输入和原不可变回执均保留1MiB限额。物流命令在SAVEPOINT内按PostgreSQL实际JSONB文本测量生成编号后的回执；若超限，回滚本次父子/审计改动，保存精简的422/logistics_result_too_large拒绝回执，不能因HTTP输入已合规就假定结果可保存。不截断字段，不扩大旧四资源的错误语义。
- SQL保留创建身份、逐次版本、原方案归属及资源/子方式，拒绝普通DML物理删除；可延后的位置唯一约束允许原子重排。0037只加空表并扩原回执kind检查，不回填订单、生产或Browser资料。缺0037时新kind503；旧四资源仍可按既有schema验证，正常启动仍verify-only。

当前实际纯契约/新旧PG/HTTP/0036升级首轮59/59通过，复审容量问题先红测500再修复，最终60/60（22905.2786ms）通过。升级前已有可信SO、排单和10.125实际产出，所有原业务表、权限、审计、资源、回执前后逐项不变。包括真实COMMIT后故意丢回执、父子锁、并发CAS、全局freeze、100项上限和后段子项/审计失败全回滚。最终质量检查及复审以[Gate6D任务](../tasks/active/server-convergence-gate6d-logistics-2026-10-21.md)为准；未升级现有体验/业务库，无新真实艾诺科读取或运输/出货/关账流水。

### Server物流资料页面（2026-10-21，Gate6D后续切片）

- 原“生产与运输”页面的02/03区域接入Server集货仓和运输方案，复用原卡片、字段和抽屉，不新增菜单、切换表格或挂载Browser设置。共用展示字段的Browser调用方继续使用原ID、Repository、默认及空值处理；Server不读取Browser账本。
- 六类型共用原客户端、规范化SHA、actor/kind临时命令、会话lease及原请求恢复；生产计划仍使用原四类型领域契约。新方案仓/地点必须通过可信分页选择，不自动采用首项或唯一项。编辑GET完整方式，含停用成员；新方式只带modeId=null，由Server分配正式身份。Server空天数/排序保留空并拒绝提交，不补零。
- 新方案派生标题采用现有200字符上限，长名称使用完整Unicode字符及省略号；完整父名称和UUID不裁剪、不回写。原请求重试不重新读取父名称或重建命令。新请求的父读取后再次检查会话owner，A→B→A旧响应不能继续POST或清除新会话缓存。
- 方案卡只对当前页读取完整方式，详情必须匹配列表父版本，避免新子项混进旧父行；引用缓存键为kind+UUID。集货仓服务路线数由全库启用方案聚合，不用当前页数量伪造。引用改名/停用显示当前事实，不改已有方案或执行历史。
- 成功回执核对完整方式数/顺序/业务值、保留的旧ID和唯一新ID；未知、裸422、摘要不符均保留原请求。限定且hash匹配的物流容量422才是已知拒绝。CAS拒绝后的最新读取按钮等待当前编辑授权/列表恢复，防止可点却静默无效。
- Server新物流抽屉单独恢复既有760px基础设施宽度，手机沿用Foundation全宽；不改变Browser及旧四资源宽度。六尺寸真实几何检查无字段横向裁剪，原布局及权限保留。

实际built Chromium对应用源f4c3aa06ffcd8adf4bed39ba99bc0e336dceb451验证23/23（33468.8431ms），包括新旧资源、明确分页、完整身份、丢回执/重试、权限撤回、会话ABA与六尺寸。新旧客户端21/21、Browser模型14/14、后台61/61；失败时序、精确构建及工程/远端区别见[页面任务](../tasks/active/server-convergence-gate6d-logistics-ui-2026-10-21.md)。本切片不包含订单SupplyHub写入、逐物料物流投影、成衣出货或Server关账，不升级既有体验环境。

### Server接口与事务边界（原Gate6A四资源）

- 仅正式session authority开放 `/api/v1/production-resources/{calendars|sites|groups|factories}` 列表及 `/{kind}/{uuid}` 详情；不存在local-single-user或Browser fallback。列表按显式启停过滤，搜索以空格分词为AND，limit≤100；完整候选超过5000时明确拒绝并要求细化搜索，不截断冒充分页。日历列表只给例外数量，完整日期从详情读，防止列表复制1000项例外。生产组复用既有自然排序函数；同名允许，不以名称去重。
- `POST /commands` 精确接收requestId/action/kind/resourceId/expectedVersion/data，创建不接受调用方ID，更新必须正版本；输入真实日期、非空唯一工作日、每天一个例外、最多1000例外/3650提前天数，伪actor/时间/价格字段拒绝。HTTP body上限1MiB。新启用地点/组要求父日历/地点启用，锁到事务提交；停用父资料不自动改子资料或历史。
- 沿用三个既有edit权限键，无新增grant。`schedule.view`可读；对应编辑者可读自身类型，生产组编辑者可只读地点/日历用于选项。写入从库中重读active身份和授权；锁序为用户→角色ID顺序→绑定/权限→资源，兼容角色管理的角色→权限顺序。过期调用方permissions/name不作为依据。
- actor/request有界互斥，规范化payload哈希防变内容；资源/例外/追加审计/不可变回执同事务，整条日历一次提交。CAS冲突或已知关联拒绝保存终态，重放不重新生效；未知异常全部回滚。`GET /commands/{requestId}` 仅同一actor及当前对应edit权限，返回known/pending/unknown，不能据unknown自动重POST。重放的resource是发生时版本，不冒称最新，需另读当前详情。
- 0034仅新增空表，不回填、不改既有迁移、不建排单、不改商业数据。普通DML不能删除资源、篡改创建身份或跳版本，回执不可更新/删除；资源停用仍可查。日历例外修改保留于审计及原回执；未来排单须冻结采用的资源事实，不动态重写历史日期。

后台25项纯契约/真实一次性PostgreSQL/HTTP验证覆盖空库、权限、版本、幂等、拒绝、关联、竞态及回滚；完整回归与远端证据以Gate6任务最新记录为准。新资源页面的工程验证单独记录，未升级真实目标，不冒充Server排单/完成/成衣出货/关账或人工验收。

### Server页面与恢复

- `production-resource-settings-page.tsx` 在挂载前选择authority；正式三路由从不挂载旧 `useOperationsSettings`。四个现有字段表单在 `production-resource-fields.tsx` 纯展示复用，Browser保存链及存储不变；Server组/外发仍用现有表格，基础设施仍同页卡片及原抽屉，不用切换表格或载入运输默认值。
- Server搜索以空格为AND，分页20条；地点/日历选择器明确分页，不把第一页当完整选项，且保留当前已停用值。新建不自动选择第一个地点或日历。编辑任何资料先GET详情，尤其日历不能从省略例外的列表拼空数组保存。关联搜索Enter只搜索，不保存整张表单；保存日历后仅通知同页地点重读关联事实，不清草稿/未决请求，不用本页行数伪造引用数量。
- 确认、拒绝和未知分别处理。客户端复用既有纯命令parser与SHA-256；POST及GET回执返回服务端已存payloadHash，核验原request/kind/hash及版本/资源结构后才确认。未知时锁住该类新提交；显式核对只GET，确认unknown后允许用户明确重试同一编号及原内容，不自动重发。成功后重读当前列表，不把发生时回执快照覆盖现版本。
- 原命令仅同用户/类型的sessionStorage临时缓存，存储失败不发送，损坏不清除，详见[生命周期](DATA_LIFECYCLE.md)。会话对象+资源类型lease在layout建立及失效；WebCrypto前后、网络前后、401处理与确认缓存前核对owner，含A→B→A；草稿、busy和unknown使用统一导航保护，回车提交同样校验权限。仅恢复临时命令不代表读写任何Browser业务账本。

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
