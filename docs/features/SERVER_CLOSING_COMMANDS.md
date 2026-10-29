# Server关账命令：Gate8B独立契约

2026-10-26，D-162/D-163，Gate8B本地候选。Gate8A只读依据继续保留，新增Server持久化与命令；**尚无Server关账UI、正式切换或完整业务闭环**。旧 [Browser 关账](CLOSING_CENTER.md) 的仓储、汇率、默认税率和数值计算不迁入本模块。

## 已批准目标

- 成衣销售产值采用实际订单 CNY 成交价；工价要求 USD，两个币种分开，不换汇或相加。加工订单只有工价，加工服务产值独立，不进入成衣销售。
- 成衣产值＝手工确认数量×实际采用成交单价÷（1＋期间税率）；创建期间时显式填写并确认税率，不提供旧值或13%的默认值。
- 月份、数量、颜色、执行方由用户确认；生产累计完成及成衣出货只供参考，不自动分月或确认收入。关账不回写订单、排单、完成量、Quote/PV/CCT。
- 实际CNY工价不能按USD关账，须经报价中心明确确认并采用新商业版本。现有旧采用API已退役，加工批次身份保护不放开；当前接口只说明阻断，不冒称该工价采用命令已实现。
- 未锁定记录的引用依据更正须复核，确认和锁定均原子重新校验；锁定快照不覆盖，仅提示后续更正。复核只确认最新生产依据，不改手工数量、月份、颜色、执行方和价格。

## 当前接口

`GET /api/v1/closing/orders/:id/basis`，仅可信Server会话，且当前数据库用户同时具备 `closing.view`、`order.view`、`schedule.view`。服务在 READ ONLY / REPEATABLE READ 中重新读取 active/非归档身份与权限；不信任调用方携带的permissions。现有鉴权会更新session心跳，业务读取事务不写数据。

- UUID规范为小写；历史alias拒绝 `closing_physical_order_required`，不静默改指另一张物理SO。
- 读取唯一可信合同类或已消费加工批次；订单已完成不妨碍读取历史依据。
- 只查询当前**已采用订单商业版本**，不解析当前Quote/CCT、不重算成本。每色保留稳定颜色ID、商业版本和精确PriceVersion。
- 实际USD工价可用；CNY原值保留并阻断，零价有效、null未确认。销售与工价查看权限独立，受限字段只返回restricted，不透出金额、币种和金额阻断原因。
- 加工完全不返回garmentSale，工作价归入`processing_service_usd`维度；桶名表示要求的统计口径，原值仍有实际币种和阻断状态，不能因桶名把CNY当USD。经销工作价维度为`distribution_labor_usd`，两者不再叠加成总额。
- `legacy_uniform`不伪造颜色价格。仅无颜色的加工单且该版本与原批次consumption精确对应时，承认为order_wide确认依据；历史合同统一价仍待核对。
- 新颜色、歧义颜色和已移除颜色保留明确阻断，不能拿第一行或平均价代替。
- 生产依据包括原assignment/executor/resource快照hash、计划版本和实际完成版本/数量/日期；取消排单的既有产出仍在。它是累计事实，不是逐日/月度事件账本。
- 最大1000颜色/价格行、500排单、1MiB响应，超限拒绝，不截断假装完整。无查询覆盖参数、POST或本地单用户降级路径。

`compareClosingExecutionReferences`只比较已明确引用的排单；新建无关排单不制造更正。首次登记完成、版本进展即使回到相同数值也须复核。Gate8B将该策略用于期间确认/锁定；不从完成日期自动选择期间。

## 持久化与命令

`0045_server_closing_snapshots.sql`只新增七张空表：commands、periods、period_versions、period_heads、allocations、allocation_versions、allocation_heads。期间月份唯一；记录永久引用原物理SO。版本与快照不可覆盖，heads仅前进；精确关联商业版本、稳定颜色、原计划和执行版本、操作人/请求回执。无Browser导入、seed、历史回填或旧schema改写。

- 一条手工归属只有一份数量，可选成衣销售、工价或两项。选择两项不把实物数量加两次；加工只能选工价，单列加工服务产值。
- 成衣金额按明确期间税率计算；工价为数量乘USD实际工价。BigInt分数保存精确分子/分母，汇总分数后才以half-up显示6位小数；不按每行显示舍入值再求和，不自动换汇、不把CNY与USD相加。
- 新建/修改归属采用当前已确认订单商业版本；无自由输入价格/币种、Quote/CCT修改或重新核价。非USD工价仅阻断工价渠道，不阻断有资格的CNY成衣销售。已保存快照不会随后续议价变化；明确修改归属的预览才采用当前版本。
- 归属固定期间与SO，不支持跨期搬移；需要时明确作废原记录后在目标期间新增。原记录、回执和审计保持。期间税率本切片创建后固定，尚无税率更正命令；错误税率不得通过直接SQL修正或静默重算旧快照。
- 可引用排单，冻结原执行方/资源hash；也可明确选择当前启用的组/外发厂，冻结其名称和版本。更名/停用不改变旧记录，也不阻止作废或重开。
- `open → confirmed → locked`；confirmed可取消确认，locked仅凭`closing.reopen`和原因重开。确认/锁定冻结完整归属版本清单；重开追加版本，原locked清单仍可按版本分页读取。复核和作废不依赖当前报价或当前资源资格。

命令接口仅可信Server会话：`POST /api/v1/closing/preview`与`POST /api/v1/closing/commands`。前者返回规范意图、差异、警告与预览hash；后者显式带requestId/hash/expected版本。支持create_period、create/update/review/void_allocation、confirm/unconfirm/lock/reopen_period。月份、税率与数量为严格文本/类型；不接受调用方身份、价格或未知字段。mutation需可信Origin和请求头，body最多16KiB。预览和执行另用真实PG `jsonb::text`字节数检查规范回执，超限在应用前422；NUL/未配对Unicode拒绝，不因compact JSON合限而在回执写入时500。

写事务READ COMMITTED：有效归属fence → fresh actor及请求锁 → 原生产全局锁 → 资源范围 → 期间 → 原物理订单。锁等待后重新读取事实并校验预览，不使用等待前RR视图。每次归属变更推进期间版本，确认与新增竞争只有一方成功。快照、head、原有OperationLog和回执同事务；稳定拒绝保留原回执；未知COMMIT只返回unverified，须读原requestId，不自动重复执行。

`GET /api/v1/closing/commands/:requestId`等待同一请求正在提交的锁，再fresh核对身份，返回最小原结果。重复同一请求只回放；同UUID不同意图拒绝。更新/作废/复核要求旧与新渠道权限并集，确认/锁定/取消/重开要求该期间全部有效渠道权限。不能删除隐藏工价渠道来绕过授权。

## 查询与保护

- `GET /api/v1/closing/periods`：year/status/offset/limit；详情`/periods/:id`可指定version、includeVoided，分页最大50。
- `/periods/:id/history`、`/allocations/:id/history`：按版本锚定历史。旧open版本没有冻结清单，不能冒充历史完整视图；confirmed/locked保存当时精确清单。
- 数量仅手工事实；summary单列成衣CNY、经销工价USD、加工服务USD与各渠道数量，不提供跨币种总金额。已作废记录不参与有效汇总。
- 销售价/工价权限分别过滤详情、汇总、历史、回执和自由备注/原因；缺一个渠道权限时不能从备注拿到该渠道金额。通用审计只保存对象、状态、数量等非金额摘要，不复制自由原因和金额到技术JSON。
- 单期间最多5000归属、1MiB读取/预览；超限拒绝，不截断。归一证据包括新表直接引用、heads、期间/locked历史、commands和相关审计的完整行摘要；历史锁定要求财务核对，但不开放归一执行或自动移动流水。

## 代码与验证

`server/closing/basis-model.ts`保留原依据策略；`contract.ts`严格输入与精确金额；`snapshot.ts`采用/投影；`repository.ts`持久版本；`service.ts`原子命令；`read-service.ts`查询与历史；`routes.ts`可信HTTP。原`server/app.ts`挂载点复用，未增加Browser降级或新页面。

模型16项通过，真实PostgreSQL/可信HTTP8个子场景及父测试通过，合计25项。覆盖双订单独立议价、逐色混合币种、加工批次、取消后产出、日期/数量更正、权限撤销/停用/归档、全业务表读取前后hash、UUID大小写及历史alias拒绝。测试只用新合成空库；认证心跳表单独排除并注明。

Gate8B已通过15模型、14命令PG/HTTP、7并发/恢复及70相关依据/归一回归。包括非空44→45升级逐表hash、请求竞争、真实锁等待后改价、首次产出/更正、未知COMMIT、审计失败回滚、停用执行方、最小权限和新owned空库完整dump/restore，逐表及sequence等价。一次备注测试错把另一条有权查看记录算作泄漏，断言改为目标记录后通过；预算红测一次误读HTTP错误封装，改为error.code后通过。失败不冒称产品缺陷。

后续根质量检查、精确源码与独立终审以当前阶段工程证明为准；本契约不借历史PASS。旧Gate8A ignored冲突TS、240秒超时和plain archive缺Git证据的失败原件保留。没有新UI/浏览器像素验收、真实Source读取、现有业务库迁移、切换、部署或Hosted CI。USD新工价采用、税率更正、关账UI与正式运行仍后续。


本契约为Gate8B当前入口。原SERVER_CLOSING.md与BUSINESS_RULES中Gate8A实现状态按原日期冻结保留；本阶段状态由D163、本契约与CURRENT_STATE接续。没有改变D162已批准业务口径。证据修订边界见[永久澄清](../tasks/completed/2026-10-27-closing-command-evidence-reconciliation.md)。
