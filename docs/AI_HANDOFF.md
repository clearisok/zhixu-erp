# 接力：Issue174 第三阶段已授权，维护入口权限阻塞

2026-11-26。先读[当前状态](CURRENT_STATE.md)、[阶段三执行检查点](tasks/active/issue174-staging-phase3-execution-20261126.md)、[执行单](tasks/active/issue174-staging-phase3-ready.md)及[用户“执行第三阶段”转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7179037950)。已有明确执行授权，不再次求批；维护权限解决前不得开始停写/迁移。

branch feat/issue174-storage-v2，起始clean HEAD fd84815dee273c0c65b4565961c8d4ffe3bfb764，main10b9a7d827e1c09f152ead58c21f26712d49a619；PR176精确fd三CI成功，PR172/a0a9与PR173/da1c未变/未合并且在祖先。之后本轮只记执行证据，**应用候选仍fd**，不能把运维文档新commit写成已构建/已部署应用。

原 Staging 五服务原ID/image正常，app a0a9/a033…；Worker已停，来源原pause保留，unknown/lease无。145表/max60/ledger59、636单/13对象、12,335,701,015 bytes，inventory28c6…和executor856c…/policy、backup-check均PASS。无新迁移备份，无旧库写入/清理/切换；不可用11/24旧635单恢复覆盖新写。

服务器私密新根 /data/issue174-phase3-20261126：candidate.json、prepared-target.json、preflight.json、paused-checkpoint.json及全部准备失败日志在 evidence；trial.conf/isolated.env/secrets等禁止输出/进Git。本机副本 D:\CodexPrivate\issue174-20261124-v2\phase3-*.json。精确app776effff…、operator6e0f4b2c…、build staging-i174-fd84815d已离线构建；未部署。新空PG project zhixu-quote-trial-i174-v2，container8b8bb05a…、target fingerprint a326d8d6f36e69cafa57318f88c73b947ae8404b6fe4d42174be623991d9f79c；同机隔离PG issue174-v2-pg-20261124/container69e63582…，internal/no ports，仅挂新/data目录。两新PG已停止，保留全部卷/身份，不能盲目重跑会拒绝现有资源的 prepare 脚本。

现有trial禁止 volume.driver_opts，已经保留门禁，最终目标用标准独立卷；/data仅承载重型隔离工作。/data约933GB，60GB隔离预算；root约38.49GB，低水位15GB，实际最新紧凑容量/新备份/WAL预算必须恢复前重新检查。默认Docker地址池已耗尽，新独立网络用现有subnet-policy分配经过Docker+host真实路由排除的/28，不修改daemon/旧网络。准备时一次仅本任务新建、空且未挂载的秘密卷失败后经正向证明重建；任何旧卷未删除。

**阻塞**：root systemd cloudflared.service 的 /config只路由Staging至3003/其他404；LAN也转3003。jackson无非交互sudo/Polkit，用户现有管理入口待回复。不借Docker提升宿主权限、不绕过服务恢复/未知结果门禁。正常备份自动恢复app/gateway，所以必须取得持续阻止公网写入的维护控制后才能进入窗口；目前未改入口/cron/旧policy，Staging无本次停机。

取得管理能力后重新核实目标/旧运行版本/未知结果/磁盘/空库，按检查点恢复两个新PG，保全原pause/failure；进入3.5h维护预算并持续owned调度hold、LAN维护及仅Staging公网hold，执行最新原始完整配对备份/新manifest和隔离原样验证，再现有CLI固定host/最新证据选择转换，最终PG/对象恢复及普通quote_trial非owner角色和全部业务/来源/附件/RBAC门禁。不要调用trial init；不要把POSTGRES_USER postgres用作app。新source policy147/旧145、精确工具/worker pins一致，Worker始终不启动。

现有Restore-Zhixu.ps1使用--no-owner --no-privileges，不能把其单独完成当维护SECURITY DEFINER owner/ACL恢复PASS；必须按精确紧凑包恢复并核对已验收maintenance owner/ACL、普通身份拒绝绕过，再开写。Linux执行身份与本机PowerShell DOCKER_HOST目标必须分别正向验证，禁止用默认桌面Docker误恢复。原迁移LF字节与全部旧ledger checksum继续严格匹配，不改账本。

所有断言PASS后才切入口/开写，记录实际T/来源epoch/首次真实同步分别；新source完整备份后保留恢复门禁。开放新写后禁止退冻结旧库丢数据。90天从正式迁移验收成功起算。Worker、清理、旧库备份退役、PR合并及Production继续禁止；不冒称新业务完整性/24h自然观察已通过。已有完整CI/前两阶段不重跑；本轮文档检查和精确Git回执写Issue。旧三摘要[完整归档](tasks/completed/2026-11-26-before-issue174-phase3/README.md)。
