# Server排单读取契约

2026-10-20；Gate6B非金额读取子模块。应用源码为15295ecb265f91316476e4b010abc7b9083d2ac6。
本文件补充[已冻结后台契约](SERVER_PRODUCTION_PLANNING.md)，不替换其写命令、公式、历史资源和权限规则。
未开放正式排单页面、实际完成、物流、成衣出货或关账。没有SQL迁移、价格字段或Browser回退。

## 数据职责与可信资格

唯一owner仍为SalesOrder及production_schedule_assignments，不建立另一套计划模型。
正常订单池同时要求当前有效SO、未完成/未取消生命周期，以及与写命令相同的严格可信合同或已消费加工批次校验。
无认领、负责人或商业采用前置。共享business-verification-sql保持合同精确匹配数=1，以及加工创建来源、profile、
消费状态和三个报价标识一致。原validator显式判断加工表能力，旧阶段缺表时不生成其SQL；CASE不能免除缺表解析。

只按每张物理SO累加未取消的内部与外发计划。历史别名计划不搬到有效SO，也不与主单执行量相加。
客户DeliveryPlan、颜色需求及未来实际完成不参与该合计。数量、剩余和超排均为精确decimal字符串；未知null，零保持零。
来源当前有效持有单仅决定来源需求读取，不改变Assignment的sales_order_id。

## API

全部继续在/api/v1/production-scheduling，通过可信session，在同一个只读REPEATABLE READ事务刷新身份并检查
order.view + schedule.view；无新增grant，不因生产权限获得成本、销售价或工价。单次响应超过1MiB明确422。

| GET路径 | 行为 |
| --- | --- |
| /orders?search=&allocation=remaining&offset=0&limit=50 | 全部合格SO先聚合、筛选，再分页；返回items、真实total、hasMore |
| /groups?search=&status=relevant&offset=0&limit=50 | 按原生产组自然排序聚合；含停用但仍有计划的组，批量返回队首ordersById |
| /orders/:id | 保留原order/assignments/resources，增加非金额summary；可信/归属/生命周期不可写时canCreate/canEdit=false |
| /groups/:id | 保留完整有界队列及版本，增加同事务批量ordersById；历史或冻结SO的既有计划仍可解释 |
| /assignments/:id?offset=0&asOfVersion=... | 保留原snapshot及当前Assignment，增加稳定历史锚点、hasMore/nextOffset与当时资源摘要 |

## 筛选、排序与边界

订单allocation可为all、remaining、unassigned、partial、allocated、overassigned、unknown。
默认remaining只列已知正剩余量的unassigned/partial；未知不能冒充未排零值。当前需求为零且计划为零是allocated。
正常池不包含历史别名/冻结/不可信记录，但按ID详情与队列批量摘要保留其既有事实并标明eligible=false。

搜索白名单为订单号、合同号、款号/工厂款号、客户、品牌和客户参考；空格分词为且，%/_按文字。
不查询报价、CCT、批次确认JSON或金额。count与page使用同一事务快照，来源在两次查询之间改变不会造成总数/页错配。
每页1–100、offset最高100000；如果还有下一页但其offset会超窗，明确production_order_projection_limit，不承诺不可访问页。
生产组status可为relevant（默认）、enabled、disabled、all；搜索组/简称/说明/地点/日历。
为复用原自然排序，完整候选上限5000，超界明确production_group_projection_limit，不能截断再伪报总数。
组总计划量与尾日期包含该组所有未取消计划；队首仅为计划顺序，不能叫正在生产。新建能力要求当前资源链启用及队列容量/版本可用。

## 稳定历史与资源解释

首次历史返回asOfVersion，后续携带同一值，将查询限制为version<=asOfVersion；新增版本不挤动原页。
每页读取51条判断hasMore，只返回50条。nextOffset超100000窗口时明确有界失败，不能宣称历史完整。
不接受未来/非正锚点；当前assignment版本可以高于锚定的历史上界。recorded_at可相同，不用于锚定。
history[].snapshot保留原SQL快照形状，resources按该页各历史resource_snapshot_hash批量读取并校验不可变哈希，
只增加当时组/地点/日历或外发厂名称及版本摘要，不拿当前master名称补造历史，不为每行返回完整日历。
实际完成、物料物流尚未接线时不输出零或“无风险”。旧来源哈希继续作为证据，不改变稳定颜色身份。

## 验收与范围

实际合成PG/HTTP覆盖跨内部/外发精确数量、取消排除、分页前聚合、搜索、撤权、伪加工profile无消费、
历史别名7件不并入主单30件、冻结/停用队列可读、count→来源并发变更→page一致快照、
52版本历史第一页后追加53再取锚定第二页，以及主数据改名不污染历史名称。详见
[本批工程记录](../tasks/completed/2026-10-20-production-planning-reads-engineering.md)与[Gate6任务](../tasks/active/server-convergence-gate6-2026-10-20.md)。
测试、远端交付、CI、部署与人工接受分别记录；不升级既有环境，不访问真实账号/业务库或新艾诺科范围。
