# 宁波合同分档同步监管

源码：`scripts/ainuoke_sync_supervisor.py`；审批及当前候选/真实结果见[执行报告](../tasks/active/ainuoke-sync-resilience-2026-11-04.md)。这是现有同步CLI的薄监管器，不新增采集、登录、订单或日志系统。默认不安装/激活；认证暂停未澄清时禁止上线。

## 私密配置与身份

配置、状态目录必须由运行用户拥有，目录700、文件600且非符号链接。配置schema为`weaveops-catalog-supervisor.v1`，包含`enabled`（初始false）、`sourceSha`、固定`image`完整sha256、`containerName`（weaveops-catalog-sync-<8位sha>）、`sourceKey`、`expectedTarget`、`project`、`network`、`stateRoot`、`collectorFile`、`environmentFile`、`identityFile`、`oldStatusFile`、`backupStatusFile`及固定`backupCommand`数组。

`identityFile`需与配置的sourceSha/image/sourceKey/expectedTarget逐项一致。worker运行UID/GID与文件所有者相同，使用同一Git源码的非root操作者镜像，已有Node CLI `--sync-run --batch-size=5`；只读根、无capability、私密env-file和只读collector挂载。不要把密码写入参数、Git、状态或日志；不打印Docker完整环境。worker命令、镜像、标签和collector挂载必须精确匹配，未知容器不操作。

## 生命周期与备份

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
