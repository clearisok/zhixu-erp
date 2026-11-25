# 接力：Issue174 v2 本地工程与隔离演练收口，Git交付待恢复

2026-11-25；branch `feat/issue174-storage-v2`；代码checkpoint **8dfe2fcf051ca0d22ef33204564ea189c9c8df45**。main再次由GitHub connector核实为 **10b9a7d827e1c09f152ead58c21f26712d49a619**。原文档worktree d3f5冻结在 `dee3d6800d718d67ac91494ec56c76b89ef11caf`；工程分支含其祖先，不覆盖它或其他worktree。

先读[报告](tasks/active/issue174-v2-phase12-results.md)与[实施恢复点](tasks/active/issue174-storage-implementation.md)。用户[D201批准](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)允许阶段一代码、阶段二真实备份隔离恢复与选择性迁移；不再重复规划或问阶段一/二许可。原则两张新表已遵守；正式业务/当前来源/绑定/引用/恢复/未解决/unknown/在途/幂等/附件保全。

本地事实：原样12.169GB→紧凑恢复406.18MB，635订单/13附件；145旧表、5序列、保留原hash、1731目录及另一新PG恢复通过。100次无变化旧/新增长31.88/1.85MB，业务run100/0，P95 2.332/2.101秒；降低94.19%而非95%，不冒称自然日稳态。完整源码1026、发布回归182、目录106、最终目录/删除恢复26、存储4、合成浏览器9全部通过；typecheck/lint/构建与main源码守卫通过。最新代码8d对新恢复库只读重核145表/全部来源/1731目录/5序列再次PASS，282.233秒；首次410.892秒证明分时保存。

敏感原件仅在 `D:\CodexPrivate\issue174-20261124-v2`，ACL私有，不进Git。两个专属internal网络PG容器/卷 `issue174-v2-pg-20261124`、`issue174-v2-recovery-20261125`，label task=issue174-v2，无外部网关/宿主端口。原配对备份20261124T023509Z-089bb129只读；原样库 `issue174_original`；选择目标work2、紧凑库、全新恢复库及bench克隆均保留。60GB预算，采样主集群/文件峰值25.11GB；不是Staging磁盘。只用合成密码运行离线重放，未启动真实源站Worker。

旧SQL本机checkout为CRLF，与原部署Git LF账本不同；演练用私有 `migration-runtime` 的精确Git blob，59个旧ledger checksum全部匹配、66个SQL文件（max67）。不允许改旧checksum/ledger或关闭校验；61–67显式LF。复制正式业务用PG原始JSON文本，避免JS decimal精度损失；转换选中证据保留原ID/时点/hash，临时NOLOGIN表示转换角色已撤销。完整原行核验用物化64字节SHA，禁止恢复旧宽行排序。

**REMOTE PENDING / NETWORK_DEGRADED**：一次已授权精确dee3 push不确定传输，独立核验文档远端分支不存在；本轮不自动重复同失败通道、不换认证/改共享Git配置、不用文件API伪造提交。依AGENTS提供现有 `scripts/git-delivery.ps1` 的精确一次性交付命令；只有DELIVERED_VERIFIED之后才创建文档/统一工程PR。PR暂不存在，Issue Open/In Progress；不能声称含PR完整交付或可直接执行切换。主代码/门禁结果已可靠本地commit，文档收口commit以最终 `git rev-parse HEAD` 为准。

**未授权且未执行**：真实Staging切换/删除/清理启用/Worker恢复/旧库及备份退役、Production、自动merge。原catalog_diagnostic_write_failed暂停不由本轮解除；普通维护局部退避不等于放宽身份/提交未知保护。未来切换必须组合保留PR172实际整改与PR173备份修复，停写后新一致备份，禁止用635单的旧演练库覆盖新写。新非owner应用角色/受管凭据DSN、维护窗口/资源、清理启用及Worker恢复需阶段三一次性明确授权。备份90天从未来正式迁移验收成功起算。

旧6087051历史详情解析限制仍在；当前7051物料/原页重建通过。没有真实Staging浏览器人工接受、两轮自然调度或24小时稳态观察；这些属阶段三。开放新写后不支持旧程序一键退回冻结旧库，须保全新写/附件并前向修复或兼容恢复。

[本轮脱敏证据](tasks/active/evidence/issue174-storage-v2-20261125/measurements.json) · [历史逐Gate原件](tasks/completed/2026-11-25-issue174-engineering-checkpoints/README.md) · [实施前原件](tasks/completed/2026-11-24-before-issue174-implementation/AI_HANDOFF.md)。完整日期/hash/失败及限制保留，不把旧pending描述覆盖成当时已通过。


2026-11-25 交付准备：用户已接受 Issue174 第一、二阶段，授权 Git 交付、保全 PR172/173 及第三阶段准备；运行操作仍未批准。PR172 精确 a0a9c78c6cccbadf5e635dbb60169f7f87944644 已纳入本组合，产品文件无冲突；状态摘要原件见 [归档](tasks/completed/2026-11-25-before-issue174-delivery/pr172-AI_HANDOFF.md)。本行仅为组合 checkpoint，最终准备结论另行收口。
