# 接力：Issue177 订单工作台 Demo

2026-11-27；分支`feat/order-workbench`。本轮main完整SHA **10b9a7d827e1c09f152ead58c21f26712d49a619** 已fetch并交付前只读复核；起点clean。用户仅授权实施/本地Demo/测试/提交/推送/PR，禁止合并、部署、真实业务写入或服务器配置/schema修改。

[批准](tasks/active/order-workbench-approval-2026-11-27.md) · [完整任务及checkpoint](tasks/active/order-workbench-2026-11-27.md) · [Demo入口/重启/体验](tasks/active/order-workbench-demo-2026-11-27.md) · [工程和截图](release/evidence/order-workbench-20261127/engineering.md)。当前UI构建11053c106dd8f97c8bd52ba1482070daa63b4928；后续只测试/文档/证据，8个UI路径保持。原客户端/权限/归属/保存保护保留。

本机5177真实只读API Demo运行，样例UUID 02b75c2f-8dc1-414a-bfc5-3411bc636072。6233和另一真实订单各42项浏览器PASS；业务写入本机403，无采集。现有出货503，完整变更时间线未提供。既有Worker独立更新不是本Demo触发，不把PROD构建页脚当部署。

类型/lint零警告/前后端build、隔离Linux root1026/1026、release182/182通过；工作台9/9、交期14/14、来源详情9/9及原连续/出货/来源维护/调价/加工浏览器最终通过。Windows退出/EBUSY和Linux首次回环失败、两次driver导航/前置GET时序失败保留在任务，不冒称PASS；未改业务断言。Linux专用临时容器TCP转接只解决Docker Desktop loopback，不改主机/服务器/产品。

635cef81117c2ff16969a3118ef7a8d466fe989f已一次push并精确核实DELIVERED_VERIFIED。e638此前push时并行新增本任务截图触发STOP_LOCAL_CHANGED，独立只读ls-remote核实精确e638，未重推；后续交付必须等待脚本完成再编辑。使用官方scripts/git-delivery.ps1及完整ExpectedHead；代理仅进程限定7888，不改共享设置。PR171/172/176共享文件风险保留，不擅自合入。[PR178](https://github.com/clearisok/zhixu-erp/pull/178)已创建（main，非draft，无auto-merge），Issue177已到Review并保持开放。等待用户体验，不合并或部署。旧接力原件保留在tasks/completed/2026-11-27-before-order-workbench。


最终候选698条证据已全量1026/1026与精确8路径守卫PASS（main10b9），最终独立release182/182也已通过；清单SHA256/失败诊断见任务。隔离Git副本需匹配原系统core.autocrlf=true，否则Windows归档CRLF被误判482文件，不扩大路径清单/改历史hash。e0a2e5ce工程checkpoint已独立push并核实，当前仅冻结清单/共享摘要增量，UI11053c10不变。a2e02c599d4e1a69fb964bcdfe1e6a590ae3f6be已独立push并精确核实；仅此后的结果/PR链接回写增量，UI不变。远端CI当前执行中，不假报PASS。
