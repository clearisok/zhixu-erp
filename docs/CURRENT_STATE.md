# 当前状态：Gate1 PR109 CI修复待交付

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，分支feat/order-identity-and-contract-claim。def98f经用户备用交付和API精确核实，唯一[PR109](https://github.com/clearisok/zhixu-erp/pull/109)已创建并attach；无合并/部署。main尚未包含本Gate，后续G2–G4本地分支保留，不将其能力写成G1已完成。

合同SO唯一可信接纳、认领/转交/独立血统、合同前翻单准备不建SO、跟单角色定义已本地实现。保留身份、来源和执行历史，不回填未知类型，不修改真实账号。G1仍使用旧共享CCT，完整新流程上线前必须完成G2订单商业版本隔离及后续加工批次交付。

PR109初始baseline/team-access CI通过，Source失败13!=12；已定位旧迁移数量断言及旧样本误带0014。当前修复为旧库精确1–11及本分支1–12/14，保留账号原值和迁移幂等断言；补相邻详情identity/materials独立key及单份卡片断言，保持现有布局。

原def98本次完整PG261/261；修复Source21总数20PASS/1Linux条件SKIP（Windows），实际Python固定loopback通过；修复UI5/5、完整类型、改动lint和显式Server构建通过。修复候选门禁PASS、基线71/71，新head/最终CI仍待核实，未冒称可合并。前轮领域15/七角色22/来源19/根817为各自历史证据，不冒称全部本轮重复执行。[修复证据](tasks/active/evidence/order-identity/pr109-ci-followup.md)。

禁止真实DB/账号/Source范围与窗口、宁波/18443/18444操作，不自动合并部署。网络规则未删，用户备用某次送达不保证通道长期恢复。上一状态[归档](tasks/completed/2026-10-15-pr109-pre-ci-fix-current-state.md)。
