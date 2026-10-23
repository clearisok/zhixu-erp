# Server订单集货仓与备注

2026-10-21，D-054 / D-147 Gate6D。当前为后台工程切片，不表示页面接线或物流闭环；
精确源码、测试结果及未完成范围以[阶段任务](../tasks/active/server-convergence-gate6d-order-logistics-2026-10-21.md)为准。
源码checkpoint ffef7c174d4256adf5e1da4dcf0f7b8526dda72b已完成本地验收，完整测试时序及失败修正见[工程记录](../tasks/completed/2026-10-21-order-logistics-context-engineering.md)。无新CI/部署或UI接线。
原Browser跟进及唯一推荐算法见[生产排单](PRODUCTION_SCHEDULING.md)，不读取、导入或改写其存储。

## 正式事实与历史

- 复用OrderExecutionTracking职责，Server只保存物理SO明确选择的SupplyHub和备注。
  未记录就是null，不从首个、唯一启用仓或唯一路线推断。显式null清空仓库，空备注保留原输入空格。
- 首次空值且空备注不创建head；已有记录清空后保留原UUID与版本历史。无变化不增加版本/审计。
- 新建/更换仓必须引用启用的真实资料；已引用停用仓仍可查看、清空或仅改备注。
  每次真实变更保留发生时完整仓业务字段，当前仓资料单独返回；主数据变化不重写历史或旧回执。
- 0038独立head与逐事件history，不给订单推断初值、不seed/backfill、不修改0001–0037。
  SQL保护原SO/UUID/创建人时间、精确版本、发生时仓快照、每个中间历史事件及更新人。
  不物理删除、不搬归属，不将历史重复的仓继承/汇总到有效SO。
- 不保存物料日期、齐套、数量、计划、实际执行方、报价/金额、出货或关账。
  Source交期不是ExpectedArrivalBatch预计到集货仓日期；后续逐物料投影仍须真实batch持久化。

## 同一命令与权限边界

`set_order_tracking`严格输入为物理orderId、expectedVersion和完整data（supplyHubId/remark）。
无客户端actor、trackingId、日期、数量、金额或任意扩展字段；版本0只表示尚无head。
预览指纹绑定fresh actor、订单版本/生命周期/有效归属、原tracking与明确目标仓当下事实。
提交重新核实，冲突不可部分保存。

仍在production-scheduling唯一事务中执行：有效归属fence、fresh身份/授权、actor/request、
排单写锁、资源共享freeze、物理SO按UUID冻结，再读取并校验事实。跟踪版本独立，不推进SO、
计划集合、组队列或执行版本；两人同时首次保存只有一人成功。

原production_schedule_commands、成功SO桥接和OperationLog共用，不建立第二幂等系统。
已知404/409/422在SAVEPOINT回滚后保存rejected；SQL/审计等未知失败整体回滚。
同编号换内容或跨入口冲突；丢回执按原编号查询，pending/unknown不触发自动POST。
回执重新检查原命令权限，旧返回值是发生时快照，不用当前仓资料重造。

读取要求order.view和schedule.view；预览/提交另需schedule.edit，全部fresh验证，不新增grant。
写入要求可信艾诺科合同或已消费加工批次、当前有效SO且未完成/取消，无认领/商业采用前置。
历史、取消/完成订单仍可按原物理身份读取。来源丢失只阻断新写，不删除旧事实。
不因排单授权获得任何金额权限。

## API

均为可信session，POST沿用同源/CSRF与1MiB正文限制，无Browser回退。

| 方法/路径（前缀/api/v1/production-scheduling） | 用途 |
| --- | --- |
| POST /order-tracking/preview | 完整意图，返回前后差异和previewHash，无写入 |
| POST /order-tracking/commands | requestId、同一intent及previewHash，原命令事务 |
| GET /commands/:requestId | 共用known/pending/unknown、原结果与payloadHash |
| GET /order-tracking/orders/:orderId | 原物理订单、tracking、单独currentHub及canEdit |
| GET /order-tracking/history/:orderId?offset=0&asOfVersion=N | 每页25条完整记录，稳定版本锚点；空历史0，不伪造记录 |

完整结果有界，超界明确失败不截断。新schema缺失新能力503，旧计划/执行仍按其原schema运行。
归一盘点登记两张直接SO引用及完整head/history指纹，拒绝半套schema；不开放归一执行，外部
生产/财务覆盖仍unavailable。

本切片仅一次性合成PG/loopback HTTP，不升级现有体验入口，不读取真实艾诺科、绑定/激活、
持续调度或部署。后续复用原“物料与运输”弹窗再独立验收客户端与实际浏览器。

## 原页面Server接线（独立工程阶段）

[页面阶段](../tasks/active/server-convergence-gate6d-order-logistics-ui-2026-10-21.md)复用原排单队列更多、订单排单抽屉、
“物料与运输”Modal、差异表和历史抽屉。当前只承载明确集货仓/备注，不挂载Browser投影或伪造物流风险。
订单计划先显示；可选跟进资料独立加载，旧抽屉或旧会话迟到响应不更新当前对象，也不以旧401退出新会话。

仓选择复用原资料客户端的显式搜索/分页；无记录为未设置，停用原引用可保留。写入前重新读取/预览；
冲突保留输入，重新读取后必须再预览。当前只读时展示Server已保存事实，保留的草稿明确标为未应用。
历史每页25完整事件，固定asOfVersion；之后新增不挤动已打开页面，不以最新仓名覆盖发生时名称。

ProductionCommand向前扩展set_order_tracking，仍共用原transport、权限、会话lease、SHA256与
`zhixu.server.production-plan.pending.v1.<public-user-id>`的schema1单槽。旧计划/执行包装字节不变；
本槽任一命令未核对前不能保存第二条。原UUID/意图/hash持久读回后才POST，未知不自动重试，
仅同session明确GET=unknown后允许人工重试全部原内容。核对回执不冒充当前仓事实，当前内容另行读取。
不改变localStorage/IndexedDB/Browser namespace、Seed或长期数据；损坏/未来/撤权记录保留。

本阶段先完成纯客户端与真实HTTP契约验证，实际built Chromium、全门禁和精确源码证据仍按页面任务记录；
本节不表示部署、人工接受或完整到仓/物流闭环。
独立页面阶段现已在2a0cec28源码/build20261021-171525完成本地工程验收：41客户端、24真实HTTP/升级、37排单跟进built、23资源built、927项目与116发布回归通过，原失败和验证边界见[冻结记录](../tasks/completed/2026-10-21-order-logistics-ui-engineering.md)。未升级现有体验入口。
