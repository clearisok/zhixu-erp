# Server排单读取契约

2026-10-21前向扩展Gate6C执行读取；原Gate6B应用源码15295ecb265f91316476e4b010abc7b9083d2ac6
及工程证据保留于发布历史，不改原hash。本文件补充[原后台契约](SERVER_PRODUCTION_PLANNING.md)
与[独立执行契约](SERVER_PRODUCTION_EXECUTION.md)。计划页面已有D150接线，执行输入UI、物流、
成衣出货和关账仍未闭环。0036仅在一次性合成库验收，不升级现有环境，不涉及金额/Browser。

## 数据职责与可信资格

唯一owner仍为SalesOrder及production_schedule_assignments，不建立另一套计划模型。
正常订单池同时要求当前有效SO、未完成/未取消生命周期，以及与写命令相同的严格可信合同或已消费加工批次校验。
无认领、负责人或商业采用前置。共享business-verification-sql保持合同精确匹配数=1，以及加工创建来源、profile、
消费状态和三个报价标识一致。原validator显式判断加工表能力，旧阶段缺表时不生成其SQL；CASE不能免除缺表解析。

只按每张物理SO分别累计内部与外发：plannedQuantity是未取消原计划，completedQuantity含已取消
计划的真实产出，outstandingPlannedQuantity仅为未取消且未结束任务的max(计划-实际,0)，
accountedQuantity为实际完成＋仍待执行。剩余、超排和allocation筛选按accountedQuantity计算，
结束未完成部分释放，超产不截断。历史别名的计划/产出不搬到有效SO或与主单相加。
客户DeliveryPlan和颜色需求保持独立。所有数量为精确decimal字符串；需求未知null，零保持零。
来源当前有效持有单仅决定来源需求读取，不改变Assignment的sales_order_id。

## API

全部继续在/api/v1/production-scheduling，通过可信session，在同一个只读REPEATABLE READ事务刷新身份并检查
order.view + schedule.view；无新增grant，不因生产权限获得成本、销售价或工价。单次响应超过1MiB明确422。

| GET路径 | 行为 |
| --- | --- |
| /orders?search=&allocation=remaining&offset=0&limit=50 | 全部合格SO先聚合、筛选，再分页；返回items、真实total、hasMore |
| /groups?search=&status=relevant&offset=0&limit=50 | 按原生产组自然排序聚合；含停用但仍有计划的组，批量返回队首ordersById |
| /orders/:id | 保留order/assignments/resources/summary，批量增加executions；可信/归属/生命周期不可写时canCreate/canEdit/canComplete=false |
| /groups/:id | 保留完整有界队列及版本、同事务ordersById和批量executions；历史或冻结SO的既有计划仍可解释 |
| /assignments/:id?offset=0&asOfVersion=... | 保留当前Assignment、计划历史与当时资源摘要，独立execution缺失为null |
| /executions/:id?offset=0&asOfVersion=... | 独立执行历史、锚点及当前头，保留原始物理归属和每次采用的计划版本 |

## 筛选、排序与边界

订单allocation可为all、remaining、unassigned、partial、allocated、overassigned、unknown。
默认remaining只列已知正剩余量的unassigned/partial；未知不能冒充未排零值。当前需求为零且计划为零是allocated。
正常池不包含历史别名/冻结/不可信记录，但按ID详情与队列批量摘要保留其既有事实并标明eligible=false。

搜索白名单为订单号、合同号、款号/工厂款号、客户、品牌和客户参考；空格分词为且，%/_按文字。
不查询报价、CCT、批次确认JSON或金额。count与page使用同一事务快照，来源在两次查询之间改变不会造成总数/页错配。
每页1–100、offset最高100000；如果还有下一页但其offset会超窗，明确production_order_projection_limit，不承诺不可访问页。
生产组status可为relevant（默认）、enabled、disabled、all；搜索组/简称/说明/地点/日历。
为复用原自然排序，完整候选上限5000，超界明确production_group_projection_limit，不能截断再伪报总数。
组assignmentCount/总计划量保留全部未取消计划，pendingAssignmentCount、队首和尾日期只统计尚未
结束任务；completedQuantity含取消后的产出，outstandingPlannedQuantity为仍待执行量。
全部已结束时有历史计划但没有虚构队首；客户端按pendingAssignmentCount核验空队首，不拒绝
整个列表。队首不能冒称正在生产。新建能力仍受资源链、500行队列技术上限及版本保护。

## 稳定历史与资源解释

首次历史返回asOfVersion，后续携带同一值，将查询限制为version<=asOfVersion；新增版本不挤动原页。
每页读取51条判断hasMore，只返回50条。nextOffset超100000窗口时明确有界失败，不能宣称历史完整。
不接受未来/非正锚点；当前assignment版本可以高于锚定的历史上界。recorded_at可相同，不用于锚定。
history[].snapshot保留原SQL快照形状，resources按该页各历史resource_snapshot_hash批量读取并校验不可变哈希，
只增加当时组/地点/日历或外发厂名称及版本摘要，不拿当前master名称补造历史，不为每行返回完整日历。
执行头不存在时返回null/空映射，数量汇总的0不冒充已登记事实。物料物流尚未接线时不输出
“无风险”。旧来源哈希继续作为证据，不改变稳定颜色身份。计划和执行历史各自锚定，不混用版本。

## 验收与范围

实际合成PG/HTTP覆盖跨内部/外发精确数量、取消排除、分页前聚合、搜索、撤权、伪加工profile无消费、
历史别名7件不并入主单30件、冻结/停用队列可读、count→来源并发变更→page一致快照、
52版本历史第一页后追加53再取锚定第二页，以及主数据改名不污染历史名称。详见
[本批工程记录](../tasks/completed/2026-10-20-production-planning-reads-engineering.md)与[Gate6任务](../tasks/active/server-convergence-gate6-2026-10-20.md)。
测试、远端交付、CI、部署与人工接受分别记录；不升级既有环境，不访问真实账号/业务库或新艾诺科范围。
