# Server 生产执行与完成

2026-10-21，D-151 / Server收敛Gate6C。纯规则已在b891冻结并送达，三项CI通过；本切片
前向实现0036执行表、实际完成HTTP与原计划写入保护，只在一次性合成PG/loopback HTTP验证。
现有页面尚未接执行输入；不能称可体验或生产闭环。Browser仓库、历史完成量、关账和长期
namespace保持，0035计划身份/状态/快照不改。精确源码及验证范围见当前任务记录。

## 已批准规则

- 仅登记当前排单执行需要 `order.view`、`schedule.view`、`schedule.complete`。
  同时应用后续订单重排还必须有 `schedule.edit`；即使本次预览恰好没有日期差异也不豁免。
  后续服务提交、原请求回执查询均重新核实同一权限组合，不能只在按钮层判断。
- 已完成数量保留在原Assignment、原订单、原生产组/外发厂及颜色归属。取消剩余或换执行方
  不搬产出；剩余任务创建新的Assignment。已有执行事实后，即使更正为零仍锁住原归属。
- 实际完成、计划数量、客户交期及商业金额独立。超计划完成提示，不截断或改订单需求。
  未记录实际开工日期保持未知，不以计划日期或“今天”补造。

## 当前纯契约

`record_execution` 输入只包含物理SO/Assignment身份、精确Assignment/执行/订单计划集合版本、
累计完成数量、执行状态、实际日期、原因，以及可空的明确重排队列版本。
数量沿用Server十进制字符串，禁止数值/科学计数/负值/非有限值；版本和真实日期严格校验。
输入不接收actor、执行方、颜色、计划变更、单价、币种、审计时间或服务端版本。

状态为进行中或已结束；已结束必须明确结束日期，进行中没有结束日期。新记录及正常进展/
首次结束不强加更正原因；减量、改动已记录日期、重新打开已结束记录须说明原因。
相同事实是无变化预览，不增加执行版本。取消计划不能新增第一份执行事实；已有事实的
明确更正仍保留原身份和旧版本；服务同时校验订单冻结与不可变历史边界。

`previewExecutionChange` 对比Assignment、执行和订单集合版本。重排以本次明确结束日期为
锚点，复用现有 `previewInternalQueue` 工作周、例外日期和同日交接公式。前序排单保持且
继续约束队列，只调整目标之后未开工自动排期；固定、已有执行及本次结束记录保持。
返回可采用新资源的精确后续ID，写服务不给受保护或前序记录刷新资源快照。
外发或已取消的排单不接受内部队列联动；记录结束本身不要求当前主资料仍启用。

## 数量投影

同一物理SO内分别提供：实际完成总数、未取消计划总数、尚未执行的有效计划量，以及
“已完成＋仍待执行”的占用量。取消的未执行计划不占用，但已完成数量继续计入；已结束
记录未做的部分不继续作为待执行任务。超产不会形成负待执行量。不得跨历史重复SO汇总，
也不将这一实物占用投影冒称客户需求、财务产值、成衣出货或已付款。

## 执行读取与原计划接口兼容

本节是0036对[0035原阶段读取契约](SERVER_PRODUCTION_PLANNING_READS.md)的明确扩展；原文件及
70cb8 Git blob保持当时证据。新执行规则不能从旧阶段“实际完成尚未接线”的说明推断当前状态。
订单列表/详情新增精确completedQuantity、outstandingPlannedQuantity和accountedQuantity；
plannedQuantity仍指未取消原计划。remaining/overassigned/allocation改按accountedQuantity
先聚合、筛选再分页；未知需求null、零和实际未登记保持不同。历史别名仍按物理SO分别投影。

订单/组详情批量增加executions，原Assignment状态继续planned/cancelled；缺失执行是空映射，
单Assignment详情的execution为null。canComplete与原canCreate/canEdit按fresh权限、可信
业务、有效归属和生命周期投影。无成本、成衣价、工价或币种，不经JS number汇总数量。

生产组assignmentCount/总计划量包含全部未取消计划，pendingAssignmentCount、队首和尾日期
仅指尚未结束任务；completedQuantity包含取消后的产出，outstandingPlannedQuantity是仍待
执行的精确量。全结束组保留历史计划数、空队首和空尾日期；旧客户端新增该明确校验，不能
伪造队首或因完成后count不为0拒绝整个列表。500行技术上限仍明确，不静默截断。
计划和执行历史各自按稳定版本锚定，追加新事件不挤动既有分页；资源名称采用历史快照。

## 执行服务与计划保护

`production_schedule_executions`保存独立head，`production_schedule_execution_versions`逐事件
追加精确SQL快照、当时计划版本、原执行方/颜色/资源归属、actor/request/operation与原因。
无执行记录是null，不伪造零事实或实际日期；计划版本仍独立。SQL不允许删除、搬归属、漏记
中间版本或补造过去版本；更正与取消后调整须留下原因。普通有执行的计划编辑同样须原因。
每条Assignment预先具备独立技术epoch；首次及后续执行推进它，计划写入先锁定读取。
旧REPEATABLE READ事务看不到首次执行时会因epoch并发变化中止，不依靠不存在行的查询
判断安全。0036只为既有Assignment初始化技术0版本，不补造执行事实或改动旧业务行。

在原`/api/v1/production-scheduling`下新增`POST /execution/preview`、`POST /execution/commands`。
共用原`GET /commands/:requestId`，按保存的原命令重新检查fresh完成/编辑权限；同一actor/request
跨计划与执行共用身份，换endpoint或请求内容不能绕过。新增`GET /executions/:assignmentId`按
`offset/asOfVersion`读取50条一页的独立执行历史；空历史锚点为0，已存在时不能指定0/未来版本。

`command-transaction`复用现有session、fresh grants、有效归属fence、排单全局写锁、资源冻结、
物理SO冻结、预览指纹、CAS、同事务审计和原命令表。完成与明确后续重排一起成功或回滚。
404/409/422领域失败在SAVEPOINT回滚后保留精确rejected回执；SQL/审计/传输失败整体回滚，
不能伪造已知拒绝。成功但回执丢失核对原编号即可；不实现自动重发。

旧计划重排读取真实执行，保护已开工/结束/固定及只读物理SO；不能刷新其采用资源。
旧update不能换执行归属或自动移动已有实际事实的日期；取消不移除产出。新排单衔接采用
已知实际完成日期，否则使用原计划结束日期；结束未做部分释放余量，原订单需求不变。
执行变化同时提升订单/组集合版本并使旧预览失效。新SO引用纳入独立执行schema完整性组（
head/history/技术epoch，0或3表；与0035的7表组分开）和完整
历史指纹，外部生产/财务覆盖仍unavailable，不因此开放归一写。

下一切片才复用现有结束弹窗，补齐执行客户端/原请求隔离及Chromium验收。当前后台测试
不能代替该页面接线、体验环境升级、正式部署或人工业务接受。

结果见[持久化任务](../tasks/active/server-convergence-gate6c-persistence-2026-10-21.md)；原纯规则
及红测/修复记录见[前阶段任务](../tasks/active/server-convergence-gate6c-2026-10-21.md)。未实施的
页面、物流/出货、Server关账和真实激活不因后台工程通过而标记完成。
