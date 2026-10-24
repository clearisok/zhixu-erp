# 当前 Server 订单物流上下文

2026-10-24，D054/D147 Gate6D后续。root唯一writer、既有server_convergence_review只读。上一Goal turn为progress：实际完成G6D基础资料0037、冻结07d/1b8，64f发布134/134、4f3最终精确守卫PASS96017ms及独立最终复审；不是空状态重复或等待。

## 起点及范围

独立API于2026-10-24T09:29:48.067Z核main e01a11952b648024c0bd6bf4259de429374981e2，本地对象存在。新分支codex/server-order-tracking-current自main创建后显式FF至clean 4f3fd6e20a2f9e0e848ff352ee73cfdf7610740f，三摘要字节/hash/完整前阶段回执见../completed/2026-10-24-order-tracking-input-state/。原e223→ffef只选14个server/SQL路径，13输入一致，仅production-resources/service.ts保留当前新旧容量保护。尚未写产品/新QA。

本阶段持久化物理SO明确选择的SupplyHub与备注，未记录null，不用唯一仓/路线默认；历史快照与当前主数据分开。同一production命令/回执/锁序，fresh order.view＋schedule.view＋schedule.edit写权，可信合同或已消费加工批次、有效未完成/取消SO；不要求负责人/报价金额，不推进计划或执行版本。0038只加空head/history，不改旧迁移/Browser。

## 验收和边界

先核实际SQL/API/测试，再受控前移。一次性PG验证无记录/null/no-op/首次并发/CAS、完整历史/发生时仓快照、停用/清空、同request跨endpoint/撤权/审计原子性、0037非空升级/计划产出保留、历史有效归属。类型、Node编译/实际import、lint和相关SQL/API/根/发布守卫按精确source执行。没有UI改动，原07d前端构建/43浏览器只作未变范围复用，不说成新source测试；客户端/UI在0039后续独立验收。

Git继承NETWORK_DEGRADED，G6B唯一push及独立API均TARGET_NOT_DELIVERED，不再逐Gate重推/触发CI；#1254f独立例外/三CI不借给新代码。Goal active，不自动merge/close/deploy、真实账号/业务库/卷/Source或凭据操作、绑定/激活/调度、50426切换或资产退役。0038→39→40→41后才0042交期写入，不重编号或重写已应用历史。
