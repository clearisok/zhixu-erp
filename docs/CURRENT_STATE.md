# 当前：PR178已合并并部署Staging，等待用户体验

2026-11-28；实际main合并SHA **396b03c443f2170255ea4927e05d5889bdcb4b96**，PR178最终HEAD **c04ef84eb0b980591369b11726bc7dc7c9f24824**，source/team-access/baseline三项必要CI全部SUCCESS，Review P2已解决。仅178普通merge到main，没有合并其他PR、启用自动合并或触发Production。

Staging实际运行 **459005ad4a7a1be2297fbf2b9fddfaea3443de34** / staging-order-workbench-459005ad。独立分支codex/pr178-staging-integration正常集成实际main与原Staging220完整祖先，保留未合并PR176/172/173及存储v2；运行SHA与main不同是有意保全，不修改其他PR分支。API、数据库、ops及Worker程序保持220精确代码。

正式发布前后配对备份及两次独立恢复通过；首次保全比较停止后，独立恢复证明原有两次启动仅推进管理员认证序列2步，业务行/业务序列/权限未变，未重置序列。受审续执行重新完成正式备份、独立恢复及原9项Recovery Gate，原Supervisor真实心跳恢复。DB/对象/卷保持，cron、调度、清理、保留及网络未改，真实业务测试写入0。完整失败及续执行证据保留，详见[发布与验收记录](tasks/active/pr178-staging-integration-20261127.md#实际部署及只读验收2026-11-28)。

HTTPS、版本、数据库健康、6233主数据/交付计划/颜色、物料摘要及跟进页、维护入口、报价/生产排单/关账页面只读正常；桌面1440及手机390布局正常。15:46来源ready：自购16项（面料3/辅料13）、有采购记录15项、有入库记录12项；完成状态16项未知，两个齐套率待核对，待入库已采购缺口10项，不跨单位相加或将记录当完成。

**验收部分通过，遗留限制明确保留**：物料历史列表可读，最新与最旧单次详情503 material_history_integrity_failed；成衣出货来源503未接通；完整整单变更时间线API缺失。真实调价历史0条，空态正常，多页失败回退由51笔隔离持久化浏览器回归证明，未造真实历史。后端历史失败未扩大修改其他PR；没有部署前详情成功证据，不能断言是既有线上故障。Issue177保持开放、Status Staging，等待用户评审，未记Done。

必要工程及精确版本边界见任务：主线type/lint/build/root1033/release182、最终Hosted三CI；候选补充真实UI49/49、实际main40路径守卫及release182/182通过。旧722冻结记录与能力状态不借此次部署升级。上一摘要[逐字归档](tasks/completed/2026-11-28-pr178-before-deployment-closeout/CURRENT_STATE.md)，[实际截图](release/evidence/order-workbench-staging-20261128/README.md)。
