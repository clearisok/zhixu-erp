# 接力：PR178 Staging已部署，等待用户评审

2026-11-28；实际main **396b03c443f2170255ea4927e05d5889bdcb4b96**，PR178 HEAD c04ef84eb0b980591369b11726bc7dc7c9f24824，三必要CI成功、Review P2解决、仅178已merge。原PR分支feat/order-workbench保留clean。独立分支codex/pr178-staging-integration，部署源码 **459005ad4a7a1be2297fbf2b9fddfaea3443de34**，精确远端交付已核实；后续仅文档/截图收口，不改变运行源码。

Staging https://staging.weaveops.top ，build staging-order-workbench-459005ad；保全原220及未合并176/172/173功能。app镜像bca822b4…、operator44943440…，原DB/对象/卷/权限保留。前后正式备份20261128T054910Z-bdd1189e、20261128T055721Z-296406bc及独立恢复通过，原9项恢复门禁和原Supervisor heartbeat_verified；cron/调度/清理/保留/网络未改，Production未操作。

首轮发布比较器因既有管理员ON CONFLICT初始化推进认证序列2步而停止，原失败完整保留；额外隔离恢复精确复现、业务行和业务序列不变后，受审续执行重新完成原正式门禁，未改DB数据或降低原Recovery Gate。详见[完整记录](tasks/active/pr178-staging-integration-20261127.md#实际部署及只读验收2026-11-28)。

实际6233主要UI/维护入口/物料跟进、报价8条/排单/关账12月、桌面及手机只读验收正常；15:46来源ready，16需求/15有采购记录/12有入库记录，完成16项未知、齐套率待核对。**剩余**：历史列表可读但单次详情503完整性失败；成衣出货来源未接通；整单变更时间线API缺失。真实价格历史为空，不写入造数；隔离51笔后页失败返回回归通过。工程与业务验收分开，不能称全部验收通过或用户已最终接受。

Issue177只进入Staging并保持开放。下一步用户体验/评审；历史详情完整性问题若要改涉及保留的来源/存储边界，另行明确范围，不能顺手改其他PR或真实数据。不得继续部署Production或再次部署文档提交。上一接力[逐字归档](tasks/completed/2026-11-28-pr178-before-deployment-closeout/AI_HANDOFF.md)，[实际截图](release/evidence/order-workbench-staging-20261128/README.md)。
