# 当前：Issue177 订单工作台 P1–P4 局部优化 / PR178

2026-11-27；feat/order-workbench，阶段起点0787ae72815384a19779b5e4ae90e7d24db4fc8e clean；再次fetch main10b9a7d827e1c09f152ead58c21f26712d49a619。[用户批准v2](tasks/active/order-workbench-refinement-approval-2026-11-27.md)、[当前任务](tasks/active/order-workbench-refinement-2026-11-27.md)，沿[PR178](https://github.com/clearisok/zhixu-erp/pull/178)；Issue177仅Status Review→In Progress。

本轮只优化紧凑关注、删除指定辅助说明/计划重复对照、原物料摘要变为真实需求项/采购记录/入库记录/待入库明细。原精确计划、差异提示/作废历史、维护/重新读取/来源追溯保留。没有改API、schema、权限、关联、同步和业务规则。

真实6233-937接口已读取16自购需求（面3/辅13），15项有采购记录、12项有入库记录、10项已采购未入库缺口；16项完成状态未知，不能展示可靠齐套率。数据不可用显示待核对，记录不冒充完成，厂供/其他供料保留于原详情。

本轮实际构建c856f35f1caa073c829976c829513f6e941d44df，6233真实浏览器51/51及手机锚点复核通过；1ba产品四套UI44/44、精度/角色/未知/历史及清理通过。12dd根1032/1032与release182/182及9路径守卫通过，后续新增历史保护7/7纯统计通过；最终新冻结清单的根/发布检查待执行，Typecheck与完整Lint最终复核中。新[运行指南](tasks/active/order-workbench-refinement-demo-2026-11-27.md)、[工程和7张对比截图](release/evidence/order-workbench-refinement-20261127/engineering.md)已整理。过期来源只作为明确标识的历史事实，不能冒称当前采购完成。

旧共享摘要[逐字保留](tasks/completed/2026-11-27-before-order-workbench-refinement/CURRENT_STATE.md)，原工程/截图冻结不覆盖。尚未合并或部署、没有真实写入；当前新增量待代码checkpoint、构建、验证及同PR交付。PR171/172/176共享文件合并风险不随局部优化消失。
