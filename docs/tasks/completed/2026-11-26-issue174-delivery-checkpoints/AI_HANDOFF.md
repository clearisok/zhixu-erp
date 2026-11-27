# 接力：Issue174 组合候选交付，第三阶段等待批准

2026-11-25；branch **feat/issue174-storage-v2**；初次组合基线 **6d7dbc9c089f9dfa6c0ac72aa3edbd37aa13da85**；main **10b9a7d827e1c09f152ead58c21f26712d49a619**。最终文档收口HEAD、工程PR和远端核验看[Issue174](https://github.com/clearisok/zhixu-erp/issues/174)本轮交付评论，不从本文件猜最新SHA。用户已接受一/二阶段，本轮授权只含Git/PR交付、保全PR172/173和第三阶段准备。[决定转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7157916062)。

先读[当前状态](CURRENT_STATE.md)、[第三阶段执行单](tasks/active/issue174-staging-phase3-ready.md)、[阶段一/二结果](tasks/active/issue174-v2-phase12-results.md)及[交付证据](tasks/active/evidence/issue174-storage-v2-20261125/delivery.json)。旧文档/feature冻结输入保持原blob；其早期未完成文字由新结果前向补充，不重写ID/截图/哈希。

PR172精确a0a9c78c6cccbadf5e635dbb60169f7f87944644、PR173精确da1c2653ae6c53a1527bcee60dbdec734cc36553以及原工程747fda5620eb805a64a1cdb7f2f6be6be96718d1均已作为祖先纳入，所有产品文件全blob一致；不需要重新开发这些修复。两个merge checkpoint为0c5065d9、6d7dbc9c，仅4份共享文档冲突，原件[归档](tasks/completed/2026-11-25-before-issue174-delivery/README.md)。原d3f5文档worktree仍冻结dee3，现已送达[PR175](https://github.com/clearisok/zhixu-erp/pull/175)。所有PR仍不得自动合并。

网络：默认代理路径三种TLS/HTTP读取失败，进程级http.proxy及github URL代理置空后两种Git读取/fetch/文档安全push均通过，未改共享配置、认证或TLS验证。后续安全交付沿用git-delivery.ps1，明确Worktree/Branch/ExpectedHead；如默认代理仍失败可复用本轮已验证的仅进程级设置，不把代理内部原因当已查明，不输出配置秘密。每个可靠Gate一次push、独立精确验证，不force/reset/clean或文件API造commit。

本轮组合182发布回归、44UI源码、11历史/内容测试、类型/lint/前后端build、40UI路径守卫PASS；备份10pass/1Windows跳过。完整1026/106/26/4/9及真实隔离恢复的原证据保留，未冒充在新组合上全部重跑。两份冻结文档追加触发过守卫失败，自己的追加撤回后PASS；没有更新冻结hash来掩盖失败。

私密原件在 D:\CodexPrivate\issue174-20261124-v2，不进Git。两个原PG容器/卷issue174-v2-pg-20261124及issue174-v2-recovery-20261125仍停止，本轮没有重启它们或触碰真实Staging。12.169GB→406.18MB、635单/13对象只属旧备份；最新切换必须停写重取完整配对备份，禁止覆盖后续新写。只新增两表，旧SQL/ledger不能改checksum；Git LF migration-runtime、普通非owner角色及私有证据闭包规则继续有效。

下一步只等用户第三阶段执行批准。预计约3小时、预约3.5小时；需将新旧Staging精确指纹、空闲端口、磁盘/60GB工作预算及镜像digest填实，再按执行单维护、最新备份、副本选择/转换、独立新PG/对象恢复、普通quote_trial角色、完整验证、切入口。隔离CLI固定host白名单不放宽，新manifest/证明不能复用旧文件；原线上超级用户连接不照搬。新source policy表数147，旧145；backupTool/pins保持PR173完整解码安全约束。

未经明确批准：不切换、删真实历史、启用清理、恢复Worker、退役旧库或备份，不操作Production。Supervisor owned调度保持维护hold，其他cron/整改不覆盖。开放新写前可取消；开放后先保全新写/附件，以v2兼容恢复或前向修复。90天从正式迁移验收成功起算。两轮自然同步/24h容量验收须另有Worker恢复授权，不能靠离线重放冒充。


2026-11-25 CI收口：统一工程 [PR176](https://github.com/clearisok/zhixu-erp/pull/176) 已建立，初次HEAD04e74cfbbaf54fa29b0843bfd8525f007fc44312已精确送达且最终守卫PASS（40UI路径）。Source CI 45644446792发现完整目录不含任何绑定合同的旧路径会回滚，后续SQL证据读取测试连带404；仅修 shared-publication.ts，记录必要缺失context而不造物料快照，重复缺失复用事件，重新出现正常恢复。原断言保留并增加零快照/无重复/恢复读取断言。来源20pass/1Windows skip、存储/目录/删除恢复19pass、server build/typecheck通过；lint已通过；最终CI结果以Issue最新回执为准。PR172/173全部产品blob仍原样；仅Issue174一处publisher和原来源测试发生必要兼容修复，不扩展功能、schema或迁移工具。最终候选取PR176精确HEAD，6d和04是保留的历史检查点。文档PR175三项CI均SUCCESS。Staging、Worker、清理和Production仍未操作。


2026-11-25 后续CI门禁：cfe09fdd已送达，Release/Team成功；Source CI45646483744的来源兼容已通过，随后关账升级夹具把0066新增两个NULL证据列纳入旧行JSON摘要而失败。仅原closing-commands测试沿用既有“比较全部旧列”的方式排除两个新字段，并新增老操作的两个新引用必须全NULL断言；关账14/14及定向lint通过。不改关账逻辑、SQL、迁移工具或PR172/173。当前最终候选仍以PR176精确HEAD及Issue送达/CI回执为准，禁止据旧cfe失败或旧基线宣称最终成功。


2026-11-26 00:00交付核验：代码/测试候选3ef5d004e76cd850b453439c376b8246f8e976b8已由OpenSSL进程级安全交付及Git/REST ref分别核实远端完全相同；Schannel前一次不确定失败保留，未重复该路径或修改共享配置/认证/TLS校验。但GitHub PR176仍返回旧head cfe09fdd，最新3ef没有workflow runs，手动触发既有来源回归一次HTTP500、未观察到新run。最终3ef本地40路径守卫PASS，来源20pass/1Windows skip、存储19/19、关账升级14/14、类型/lint/build已通过，Release/Team旧cfe成功不能冒充最新head全CI成功。当前外部PR/CI同步未闭环，**尚不具备Staging切换批准条件**。不通过close/reopen/重复PR/force push绕过；先只读核对新head/CI，再处理必要门禁。三阶段执行单已备好，预计约3h/预约3.5h，但本轮未切库/启用清理/恢复Worker/操作Production。此后若有纯交付文档checkpoint，以PR/Issue精确回执区分源码候选和交付HEAD。
