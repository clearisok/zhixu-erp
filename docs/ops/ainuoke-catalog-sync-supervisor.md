# 宁波合同分档同步监管

## 2026-11-18 未完成的恢复候选

后续新增只读 `--sync-health` CLI：仍校验现有 target fingerprint 和完整 migration checksum，报告 PostgreSQL 是否处于恢复模式、0058、enabled/paused、运行中或未知任务及 capture。它只是恢复证据之一，不证明数据库无损坏、不持有 worker 锁，也不启动任何任务。`scripts/ainuoke_recovery_gate.py` 对每项缺失证据 fail closed；Docker exec 列表检查仅是一个必要条件，不能证明已退出 exec 产生的后台后代也已退出。模块尚未接入主管理器，故自动恢复仍未实现，不能部署或标为闭环。

后续仓库新增 `scripts/ainuoke_paired_backup.py` 候选，基于下列现场固定版本；新增命令步骤、耗时、退出和脱敏输出标记，以及 POSIX 子进程组超时终止。此候选未安装、未连接监管器，不能证明 Docker daemon 内 exec 子进程退出，不能作为 cleanup verified 放行。需完成数据库后端/容器 exec 状态核验、执行器中断恢复、监管器门禁及心跳和端到端回归，才能交付真实恢复；脚本中无私密 policy 或业务备份。目标现场原文件由 cron 引用，修改原路径即生效，按本轮禁止 Staging 部署的约束保持原状；部署须重新校验文件与备份 policy 的 pin 和回滚方案。

本机候选对新发备份失败写入独立脱敏 `weaveops-backup-attempt.v1` 回执，区分执行器启动失败、超时、非零退出及信号；不记录原始命令、stdout 或 stderr。备份中断或失败后标记 `RECOVERY_BLOCKED / backup_cleanup_unverified`，下次 tick 记录检查时间及次数，不启动 worker。现有成功备份流程保持。此状态仅提供安全阻塞，并未实现安全条件通过后的自动恢复、告警、重试、数据库核验或子进程回收；历史 `STOPPED_FAULT` 也不会自动解除。不得据此部署或宣称事故已修复。

实际 Staging 私有执行器路径为 `runtime/catalog-sync-b4fc85ed/paired-backup.py`，由主管理器以 Python 和私有 policy 调用；文件 SHA256 `2a4d0f89fcfcd08d75986906d887eeac4ead2c103afb79558e053c6bd13d0803`，现场用户具写权限，但用户未授权部署，未修改。其步骤级错误诊断和可靠子进程生命周期证明仍需在后续实现与发布中解决。未知远端结果继续保留原人工核对保护。

源码：`scripts/ainuoke_sync_supervisor.py`；审批及当前候选/真实结果见[执行报告](../tasks/active/ainuoke-sync-resilience-2026-11-04.md)。这是现有同步CLI的薄监管器，不新增采集、登录、订单或日志系统。默认不安装/激活；认证暂停未澄清时禁止上线。

## 私密配置与身份

配置、状态目录必须由运行用户拥有，目录700、文件600且非符号链接。配置schema为`weaveops-catalog-supervisor.v1`，包含`enabled`（初始false）、`sourceSha`、固定`image`完整sha256、`containerName`（weaveops-catalog-sync-<8位sha>）、`sourceKey`、`expectedTarget`、`project`、`network`、`stateRoot`、`collectorFile`、`environmentFile`、`identityFile`、`oldStatusFile`、`backupStatusFile`及固定`backupCommand`数组。

`identityFile`需与配置的sourceSha/image/sourceKey/expectedTarget逐项一致。worker运行UID/GID与文件所有者相同，使用同一Git源码的非root操作者镜像，已有Node CLI `--sync-run --batch-size=5`；只读根、无capability、私密env-file和只读collector挂载。不要把密码写入参数、Git、状态或日志；不打印Docker完整环境。worker命令、镜像、标签和collector挂载必须精确匹配，未知容器不操作。

## 生命周期与备份

2026-11-07 staging交付：显式egressNetwork仅允许同一project的`_ingress`，主network必须是该project的`_default`。新建worker前验证两网络的项目标签及internal属性；创建后连接ingress，再核对实际网络集合。数据库仍无公网端口，内部网络不改为外部网络，不改Docker守护进程或代理。未配置egressNetwork的旧禁用配置保持原行为。用于将本机已验收持续worker迁到长期staging，不授权其他环境。

每分钟调用tick即可。`activate`只是显式启动请求，数据库的CAS启用与未知回执恢复仍使用现有CLI；故障状态重新启动需审查原因，不能靠Restart=always或反复启动清掉数据库暂停。

- RUNNING：现有CLI持单worker租约；手动通知唤醒，四档自动调度不变。
- STOPPED_FAULT：意外退出/旧worker状态不明/无法安静，保持停止待核对；不自动重启。
- 03:12起TERM并等待当前工作完成，提前留出03:20安静窗口；不发SIGKILL。无法结束则报警并拒绝备份，不假报一致。
- BACKUP_QUIET：03:50后也必须看到同项目/同源码、当日03:12之后的新BACKUP_VERIFIED，且原服务已恢复，才自动启动。
- `backup`动作先确认worker已停止，整个既有配对备份期间持相同监管锁；备份失败进入故障，时钟不能在备份中途唤醒worker。`backup-check`仅供检查，不代替持锁备份动作。

安装时保留原cron与旧服务文件/回执，旧三合同worker保持PAUSED；不能同时跑两套采集。备份策略当前绑定旧应用/121表/旧容器身份。新应用升级后需创建新策略版本，按实际137业务表、新源码、实际服务身份和包括新服务私密配置的文件哈希重新冻结，完成备份/异机副本/独立恢复后再启用。不能修改旧备份或用旧PASS代表新版本。

## 验收与回退

先执行Python监管安全测试和宁波禁用态烟测（不发Source请求），再核实精确远端交付、必要CI、候选HTTP/build身份、当前数据配对备份和迁移预览。550/608的当前来源结果仍受登录拒绝阻断，不是全量PASS。

回退先将监管配置disabled并TERM等待，保留容器、镜像、队列、旧观察和卷；新迁移只前向，不down migration，不把旧应用直接连到它不支持的新账本。恢复旧库必须另行核对期间新增报价/附件，不能覆盖长期试用数据。该文档是运行契约，不是已安装或已启用证明。
