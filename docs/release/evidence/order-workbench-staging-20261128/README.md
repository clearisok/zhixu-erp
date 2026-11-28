# 2026-11-28 Staging实际验收截图

环境：https://staging.weaveops.top 。真实6233-937，运行源码 **459005ad4a7a1be2297fbf2b9fddfaea3443de34** / staging-order-workbench-459005ad；main合并SHA **396b03c443f2170255ea4927e05d5889bdcb4b96**。只读访问，没有写订单、调价、计划或手动刷新来源。正常登录仅沿用既有权限。

这些是本次真实运行证据，不覆盖旧冻结ID/截图，不自动升级历史能力标签，不替代用户最终业务验收。旧220、候选Demo及本次截图各自保留来源和时间。

| 截图 | 实际内容和限制 |
| --- | --- |
| [桌面1440](after-desktop-1440.jpg) | 13:59后验收时点：紧凑关注、交付计划、颜色和物料摘要；当时来源stale，旧数明确历史，当前率待核对 |
| [手机390](after-mobile-390.jpg) | 同轮实际手机布局，关注自然换行；页签均实点验证，无页面横向溢出 |
| [颜色桌面](colors-1440.jpg)、[颜色手机](colors-mobile-390.jpg) | 三色横向尺码矩阵，14个未知格不补0 |
| [真实价格历史空态](empty-price-history-1440.jpg) | Staging没有实际调价历史，未制造业务数据；多页失败回退是51笔隔离持久化回归，不是此截图的实际业务历史 |
| [物料历史列表](material-history-1440.jpg) | 12条记录、历史起点及必要旧快照保留；列表可读不代表详情可读 |
| [历史详情失败](history-detail-error-1440.jpg) | 15:46再次实点最新采集，显示实际不可读；API为503 material_history_integrity_failed，最旧详情亦503 |
| [15:46桌面物料](final-ready-desktop-1440.jpg)、[15:46手机](final-ready-mobile-390.jpg) | 原Worker正常恢复后的来源ready：16自购、15有采购记录、12有入库记录；16项完成状态未知，两个率待核对；已采购待入库缺口10项 |

业务验收**部分通过**。成衣出货来源未接通、整单变更时间线API缺失、历史单次详情完整性错误仍明确保留。截图中角落PROD是既有构建模式标签，站点为Staging、buildId以staging开头；本轮没有部署Production。

完整版本/备份/测试/原功能保全见[执行记录](../../../tasks/active/pr178-staging-integration-20261127.md#实际部署及只读验收2026-11-28)。
