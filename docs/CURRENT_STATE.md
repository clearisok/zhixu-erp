# 当前状态：PR140已合并，staging交付验收进行中

2026-11-08。用户已批准完整交付及仅staging升级/数据接入/后台切换；生产不在范围。PR140已merge commit到main **390569c4cfa56cd56261674c3f2110bd306d3ff7**，候选f2b7e8cda69845f9701b5a036cec6381df7e7d79的source、baseline、team-access三CI全部通过。实际staging按同main构建运行，build staging-material-390569c4；137表，旧数据/卷/附件/账号保留，无本机DEMO模式。没有触发生产workflow。

最新617完整真实来源已按合同通过正式服务接纳发布617/617，失败0，285247ms，0新源请求。实际617 HTTP核对全部通过、4完整空结果，614历史可读/3原失败标记保留；不是本轮全部刷新完成。来源时间UTC2026-11-07T02:22:40.094176Z–17:30:41.098947Z。D1992的staging UUID **25285166-1585-449f-a8fd-81cbd7c98084**，30自购8厂供、20采购8入库5出运5出库逐笔来源→HTTP对齐；20单位事实按合同重新校验、18缺口已知，真实未知不填0。

原23报价/设置等业务表、原2账号权限、原3订单身份hash一致。匿名API401、无业务数据的身份恢复shell不创建会话；专用只读QA GET200/刷新403并已归档。正常Jackson公网会话看到617订单；详情动态资源曾Cloudflare520，公网完整浏览器验收尚未完成，不能仅凭gateway通过宣称交付。新配对备份首轮发现遗漏原对象备份工具挂载，已补回原运维挂载并恢复应用，业务代码/数据未改；137表新备份及独立恢复仍待最终回执。

本机63051网页/数据/原watchdog保留；2026-11-07T17:30:52.671Z正式staging_handoff暂停采集，service.syncEnabled=false，6 queued保留、0 running、认证owner0。最新证据80,664,465字节，SHA256 80db9ecabe6025bcac1f3c99db160d8fceefc487af605d3639e7bd55b3b9084c。旧宁波3合同collector PAUSED。新cron已安装但监管器DISABLED；未开启新的staging源请求，禁止同时恢复本机采集。

下一步：新配对备份/离机校验和独立恢复、公网D1992及代表场景、确认本机0owner后激活staging自然cron，验证真实手动/自动采集发布及认证复用、积压和维护窗口。档位257高频/120日/196周/44月，R分档和03:30配对备份沿原批准，维护窗口03:12–03:50北京。尚未以实际源请求证明staging持续执行。

[当前任务与完整时间线](tasks/active/material-staging-delivery-2026-11-07.md)；[本机已验收业务/UI](tasks/active/material-business-view-2026-11-07.md)；[本次前旧状态归档](tasks/completed/2026-11-08-before-staging-actual/CURRENT_STATE.md)。实际受保护回执：D:/WeaveOps-Local/staging-delivery-20261107及宁波/home/jackson/weaveops-staging-preview/releases/material-delivery-20261107。不得把旧历史PR号、旧本机UUID或旧“尚未合并”段落当当前结果。
