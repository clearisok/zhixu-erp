# 当前：Issue177 正式订单工作台 Demo / PR评审候选

2026-11-27；本轮开始fetch及交付前只读复核main **10b9a7d827e1c09f152ead58c21f26712d49a619**；独立分支 `feat/order-workbench`，起点clean。用户批准真实页面、本地Demo、提交/推送/PR；不合并、不部署、不改服务器配置、schema或真实业务数据。[批准](tasks/active/order-workbench-approval-2026-11-27.md)、[任务](tasks/active/order-workbench-2026-11-27.md)，Issue177 / Review；[PR178](https://github.com/clearisok/zhixu-erp/pull/178)已创建，目标main，等待用户体验。

实际Server详情已改为工作台：紧凑身份与来源数量/交期、现有提醒、前置织序交付计划、物料/生产/成衣出货/关账、颜色摘要及按原规则分组的尺码矩阵、次级价格历史和技术详情。原来源/交期维护、未知请求、权限及归属保护保留；未新增计算、总进度、同步或数据库规则。

[本机真实只读Demo及运行步骤](tasks/active/order-workbench-demo-2026-11-27.md)已提供；UI实际构建11053c106dd8f97c8bd52ba1482070daa63b4928，6233-937和另一真实订单各42项通过。业务提交/采集在本地403，保存功能用独立合成库验证。出货现有503如实展示；完整整单变更时间线没有接口。截图期间独立Worker更新来源，不能算本Demo采集或部署。

[工程及前后截图](release/evidence/order-workbench-20261127/engineering.md)：typecheck、零警告lint、前/后端build通过；隔离Linux root1026/1026、release182/182，工作台9/9、原交期重跑14/14、来源详情9/9，以及原连续页面/出货/来源/调价/加工浏览器最终均通过。Windows退出/EBUSY、首次Linux回环网络及driver失败均保留记录，不冒称通过。最终698条证据候选的全量1026/1026与精确8路径守卫通过；最终独立release182/182也通过；远端GitHub CI仍在运行，不能记作通过，人工接受仍待用户。

PR171/172/176共享部分文件，后续合并顺序有冲突风险，本轮不改其他分支或既有字段/视图/自动化。2026-11-20的0752部署只是历史，不作为当前线上源码。旧三个共享摘要[逐字归档](tasks/completed/2026-11-27-before-order-workbench/CURRENT_STATE.md)保留日期/hash/限制。最终代码与冻结证据已提交并核验远端；下一步只等用户体验和评审，保留现有CI结果观察；无合并或部署授权。
