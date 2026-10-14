# 加工下单批次（Gate3）

核实日期：2026-10-14。最近核实main：064e3afaf7d08b3cb62907d4402f97d9c292f1e5；本地分支feat/processing-order-batches继承未合并Gate1/2，未刷新远端、不代表main已有本能力。实现基点ced418f99fa52eef25ebf8b86aa683b10689efd1，后续检查记录见[阶段任务](../tasks/active/processing-order-batches.md)。

## 已批准规则

一次真实客户下单由稳定批次ID表示；Quote/Revision/PriceVersion是商业方案，不是订单唯一身份。同一报价可以有多个真实批次。合同类不能借加工入口创建；加工订单没有艾诺科合同，不产生伪来源。两个入口共用正式Server服务，Browser数据不参与。

## 当前本地实现

0016增加批次、不可变确认历史、唯一消费和请求回执。批次先draft，确认时绑定内容哈希和精确商业来源指纹，再消费为SO。创建SO、processing身份、独立商业版本、消费、审计与回执在同一事务提交。每个批次独立事务，批量允许部分成功。批次行锁与唯一消费防止不同请求、不同用户、两个入口重复创建；同批次重试返回原SO。请求键重用但载荷不同拒绝。

内容目前不可变：改变下单内容需取消未消费批次并重新登记；来源价格变化可重新预览确认。取消/消费终态不可回改。来源报价删除、版本改变、类型改变、确认工价缺失等均阻止新消费；已消费记录仍可返回原订单。确认工价为零合法，未知不替换零。

权限采用fresh DB grants：order.view、quote.view、commercial.labor.view，加order.processing.batch.manage用于登记/确认/取消，或order.processing.consume用于消费。两种权限均可读取候选与预览。新增目录权限不修改真实角色或账号；原报价权限不等于下单权限。初始订单待认领，后续认领须由可信消费记录证明身份，不能仅凭processing标签。

API：GET/POST /api/v1/processing-order-batches；POST /consume；POST /:id/preview、/confirm、/cancel。只接受可信session，写入执行mutation boundary，拒绝客户端价格、创建历史与订单身份注入。列表支持search、quoteId、offset及includeProcessed；每页扫描20条，来源重验后可能少于20条，必须按hasMore/nextOffset继续，不能把空页当查询结束。

订单中心导入与报价中心推送复用ProcessingBatchDialog。可搜索加工报价、选精确修订/PV、登记真实下单、预览工价、确认、多选消费和查看已有SO。默认隐藏已处理；请求结果未知时保留原请求重试，阻止继续编辑造成误提交。加工订单列表读消费批次快照，合同号为空，详情物料来源显示不适用。

## 证据与剩余工作

服务/HTTP/SQL合成测试、浏览器测试、源码门禁的逐次结果见阶段任务，不把分阶段通过冒充最终全Gate通过。实际代码：server/sales-orders/processing-batch-{model,service}.ts、database/migrations/0016_processing_order_batches.sql、features/order-center/components/processing-batch-dialog.tsx及server/integration/processing-batch*。

尚待收口：相似下单提醒（相同PO不得硬阻断）、友好报价版本标识、批量失败项重试体验、取消操作界面、最终权限/来源负向矩阵、精确提交门禁和复审。当前不能宣称Gate3完整交付或用户验收。G4历史归一和G5来源/页面任务独立，不因本模块实施获得真实数据执行授权。

所有数据库检查只在随机一次性合成库执行。无真实账号、业务数据库、Source调度、宁波或18443/18444变更；无自动合并、部署。本文件在schema、API、权限、UI、验收或交付状态变化时同步更新，GitHub为实时工程事实源。
