# Staging 备份失败与同步停止调查（2026-11-18）

用户授权只读调查及本机修复、测试和 PR；未授权合并、Staging 或 Production 部署。起点工作树干净、游离 HEAD b4fc85ed0ac09ad45db8959257a9b2d840abba26。通过宁波只读 Git 查询核实 main 为 a915c7a130ddada13118a1d245b41e7999b9d395，并以原始 Git 对象获取后建立 fix/staging-backup-sync-recovery。Windows 直连 Git 经本机代理连接失败，NETWORK_DEGRADED；未修改共享代理或认证。

## 已核实事故链

所有下述时间为北京时间。11/17 03:12:01 同步容器正常退出（exit 0），与计划备份窗口及最后 worker 心跳一致。03:30:01 配对备份开始，03:35:16 返回 FAILED / command_timeout_or_unavailable，原应用服务恢复；监管器进入 STOPPED_FAULT / backup_failed_requires_review。11/18 只读核实分钟 cron 和 cron 服务存在，worker 容器未运行，监管配置 enabled=true；数据库 enabled=true、paused_reason 空、catalog_failure_count=0，1 manual queued、无 running。0058 已应用；应用版本和监管 sourceSha 均为 b4fc85ed0ac09ad45db8959257a9b2d840abba26。没有执行真实来源读取、恢复或写操作。

仓库 scripts/ainuoke_sync_supervisor.py 的 perform_backup 捕获失败即保存 sticky fault；decision 对 STOPPED_FAULT 等待，而 BACKUP_QUIET 原本要求同日备份成功才启动。故一次备份失败会长期阻止同步；数据库 enabled 不代表进程存活。

## 失败子步骤证据的限制

失败包仅有 failure.json；没有 database-snapshot.json、database.dump 或对象归档。部署的私有 paired-backup.py 顺序是 validate、检查未完成附件、maintenance、no_clients、300 秒 snapshot、写 snapshot、600 秒 pg_dump、校验、对象导出和复核。失败包无快照说明未完成快照文件写入，不能区分 maintenance、连接检查或快照等先前步骤。03:30:01 至 03:35:16 约 315 秒与快照超时相符，但不是充分证明。该脚本 execute 将 TimeoutExpired 和 OSError 合并为相同错误，并丢弃 stderr；监管日志只有相同失败回执，无法从中恢复步骤、退出码或信号。数据库容器日志当时只有常规 checkpoint，未证明特定命令失败。

SSH 身份无法读取系统 journal、syslog 和 auth 日志（无 adm/systemd-journal 权限，sudo -n 不可用）；可见的用户 journal 与 Docker 历史事件没有对应细节。系统日志是否有足够证据仍未知，不宣称已经丢失或证明某个命令超时。已请求用户提供只读访问或脱敏历史日志。

## 工程边界及后续

备份执行器实际位于 Staging 私有 runtime，不在仓库中。仅修改仓库监管器无法补齐真实执行器的步骤日志、进程组清理或崩溃恢复；需要先梳理可版本化、无秘密的执行器及其部署绑定。自动恢复需证明旧备份进程及其子进程已结束、原服务已恢复、DB 可用和迁移一致、管理员未停用且安全暂停/未知提交仍受保护；不能只凭失败回执或 PID 不存在启动。Worker 的现行 advisory lock 与 running 任务 unknown 检查故意防止重复提交，未发现可证明远端结果的通用核验接口前不能自动重试未知结果。上述是设计约束，不是已实现承诺。

尚未修改产品代码、运行自动化测试、提交 PR、合并或部署；尚无两轮自然同步验收。所有失败备份及业务数据保留。

## 2026-11-18 后续：未完成工程检查点

用户明确要求实施。本机监管器已增加备份执行器级脱敏失败回执及中断后的 RECOVERY_BLOCKED 重复检查记录；它仍不验证子进程退出、数据库/迁移/管理员状态，不能自动恢复，也不构成最终修复。没有修改私有执行器、Worker 或真实环境；无任务租约及远端结果核验新实现。SSH 只读确认执行器可写、由 Python `paired-backup.py backup policy.json` 启动，精确 SHA256 为 2a4d0f89fcfcd08d75986906d887eeac4ead2c103afb79558e053c6bd13d0803。部署仍未获授权。
