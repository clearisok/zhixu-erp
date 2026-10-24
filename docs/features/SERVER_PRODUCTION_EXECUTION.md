# Server 生产实际执行与完成

2026-10-24，D147/G6C当前候选，直接SalesOrder→Assignment；实际阶段/精确源码见[当前任务](../tasks/active/server-production-execution-current-2026-10-24.md)。
本文是当前[0035计划契约](SERVER_PRODUCTION_PLANNING.md)的显式执行扩展。原计划文档/Git blob与其“实际完成尚未纳入”的阶段证据保持，不能从旧阶段文字推断当前候选状态。冻结9c2的313相关API/升级、根811、48浏览器及类型/Node/lint/双构建已通过，见[工程证明](../tasks/completed/2026-10-24-production-execution-current-engineering.md)。发布/最终main守卫另记，未合并、部署、目标升级或人工业务接受。

## 已确认职责

- 仅登记当前排单需order.view、schedule.view、schedule.complete；明确同时重排后续还需schedule.edit，即使本次没有日期差异也不豁免。预览、提交及原请求回执都fresh校验，不以按钮代替鉴权。
- 实际数量、计划数量、订单需求/客户交付、金额、出货及关账独立。没有实际记录为null/尚未登记，不能用计划或今天补实际日期。超计划完成保留真实值并警告，不截断或改需求。
- 已产出始终归原Assignment/物理SO/原执行方/颜色及采用资源；已有执行更正到0仍不解锁归属。取消只停止剩余计划，或更换执行方时新建余量排单，不搬原产出。
- 首次正常登记/进展/结束不强加更正原因；减少累计完成、修改已记录日期、重开结束记录或取消后更正必须原因。历史追加保存，不覆盖旧事实。

## 模型与前向SQL

0036独立execution head/history与每Assignment预先存在的技术epoch，不改变0035计划planned/cancelled状态。已有计划只初始化技术0栅栏，不补造实际0、日期或完成记录；不修改0034/0035/旧迁移、不迁入Browser或授予权限。
执行保存精确十进制字符串、进行中/已结束、独立实际起止日期与版本。已结束必须明确结束日期；进行中不能带结束日期。身份/执行方/颜色/价格/币种/actor/审计时间不能由执行输入修改。
执行版本保留当时准确计划版本、原归属、actor/request/operation和原因；SQL禁止删除、搬归属、漏中间版本或补造过去版本。计划→epoch锁序和首次执行的epoch推进，使提前取得RR快照的旧原始SQL不能漏看第一份执行后改归属；不是只查询可能不存在的head。
既有执行后普通计划编辑也须原因，自动日期不移动。单纯主资料停用/更名不否认旧真实完成，不回算采用资源。

## 同一命令与事务

沿用production_schedule_commands及command_orders；同actor/request在计划与执行endpoint间共用身份，换内容/接口不能绕过幂等。runProductionCommand复用fresh身份/稳定授权、有效归属fence、排单全局写锁、资源scope与稳定物理SO锁序。
完成与用户明确的后续重排一起提交或回滚。预览冻结完整执行、计划/订单/队列版本、采用事实、权限及前后差异；提交重算指纹。404/409/明确422在SAVEPOINT回滚本次变化后保存小型rejected回执；提交前SQL/审计失败回滚。连接或COMMIT结果未知保留原请求核对精确回执，不宣称未应用、不自动POST。
G6A资源结果与G6B完整ResourceFacts的PG真实字节预算拒绝继续保留，不扩大1MiB或截断资料。

## 预览与数量投影

联动以明确实际结束日期为锚，复用当前精确工作周/例外/ceil及同日交接公式。前序仍约束队列；只调整本单之后可写、未开始的auto_queue任务。固定、有执行、冻结/历史只读SO保持，不能刷新其资源；外发或已取消排单不能内部队列联动。
本单登记不额外要求整组查询/重排或主资料仍启用。联动失败保留表单，不自动降级成另一次登记命令。已记录结束日期不覆盖计划结束日期；旧计划保护读取真实执行事实。
同物理SO分别汇总completedQuantity、plannedQuantity、outstandingPlannedQuantity及accountedQuantity（实际完成+仍待执行）。取消未执行不占用，但取消后的产出仍计入；结束未做部分释放余量，超产不造负待执行。不跨历史重复SO汇总，不冒称产值、出货或已付款。
remaining/overassigned/allocation以accountedQuantity聚合后筛选分页，未知需求null不当零。组的总计划数保留；待执行数/队首/尾日期只反映未结束任务，全结束时空队首，不伪造。

## API、查询与权限

继续唯一/api/v1/production-scheduling：新增POST /execution/preview、POST /execution/commands；GET /commands/:requestId按原命令重新校验对应完成/编辑组合。GET /executions/:assignmentId独立执行历史，50条分页、offset≤100000、asOfVersion锚点；追加不挤动原页，空历史锚点0，非空不能指定0或未来版本。
原订单/组/单条查询增加精确执行映射及当前canComplete，保留计划版本和资源历史。读取仍需order.view+schedule.view；DTO无售价、工价、成本、币种或源凭据。对象归属按物理SO及不可变快照解释，不拿当前master名称伪造过去。
执行schema/head/history/epoch分组完整性0或3，与0035独立7表组分开；归一只读引用盘点纳入执行指纹，外部生产/财务覆盖仍unavailable，不恢复公开归一写入口。

## 既有界面与缓存

沿用同一路由/session/AppShell、MasterDetail、队列/订单池、结束弹窗、前后差异和历史抽屉，不新增导航或V2/V3密度设计。增加登记进度/结束/更正及独立执行历史；首次数量为空、日期不默认，归属字段锁定。
第二步清楚显示修改项目/前/后与明确后续款号/日期差异。完成联动按钮在手机底部可换行，前后对照保留表头；复用原294/27b窄修，不把新日期套旧截图。
原sessionStorage键zhixu.server.production-plan.pending.v1.<public-user-id>与schemaVersion=1四字段包装保持，仅前向允许record_execution。计划/执行共享每actor/tab一条未决槽；未知、损坏或未来命令阻断，不覆盖/静默删。旧计划原字节可读，旧客户端不认识新执行会明确阻断；不换Browser key/Seed或读写其业务localStorage/IndexedDB。
缓存只存用户主动原命令，不存密码/token/金额/来源原文；最多1MiB、完整写入并读回成功才POST，缺存储不冒充恢复。完整session lease绑定preview/hash/POST/GET/解码，A→B→A旧200/401不能确认新缓存或退出新会话。
结果未知先查询；同session明确unknown后才能人工重试原ID/全部原内容。known严格匹配request/hash/身份/事实/版本/HTTP状态后才清原槽。成功后另GET当前投影，旧回执不当最新事实。未保存/处理中/未知继续原导航保护。

## 本轮验收与安全边界

当前30路径受控前移，2处三方差异保留；新的before使用精确旧C规划构建和一条合成计划观察无执行入口/零实际写入，after只能新当前构建。源、SQL、测试、截图和文档结果按本轮checkpoint另记，不借原27b或G6B验收。
新增npm execution仅四个新文件，原planning已含outbox/升级不重复；现有PR CI只新增一条执行命令，不增加事件/任务、削门槛或重跑旧付费CI。
所有升级/运行验证仅自建一次性合成PG/HTTP/私有Chromium，保留现有3001/50426/59069/62426和真实账号/业务库/卷/备份。没有真实Source/凭据读取、绑定/激活/调度、自动merge/close/deploy或退役。4C/物流/出货/Server关账另有Gate及未决业务前置，不能由本次执行工程通过推定完成。
