# Issue165：独立备份归档恢复修复

2026-11-24；main基线10b9a7d827e1c09f152ead58c21f26712d49a619。用户明确授权专项排查Staging backup_cleanup_unverified，证据充分时按既有流程恢复发布条件，禁止清保护/改业务数据/扩大UI PR。独立codex/ui165-staging-recovery，UI候选89f72452和PR172不混入此修复。

[专项证据与流程](tasks/active/ui165-staging-backup-recovery-2026-11-24.md)、[之前摘要](tasks/completed/2026-11-24-before-ui165-backup-recovery/CURRENT_STATE.md)。

实际数据库12.29GB。原450秒快照超时；在原300–600允许范围选择600后全量快照502.618秒通过，但默认压缩的完整pg_dump又超原600秒限，新失败17774e94保留，原22日失败也未改。没有强清恢复门禁或切版。

本批只给备份执行器加入严格可选zstd:1压缩，默认调用保持；完整归档增加pg_restore --file=/dev/null无DB连接解码，不降低时间/哈希/行数/清理/前后比较断言。原dump600秒、snapshot上限600秒不变。未知压缩参数在IO前拒绝。不改数据库/接口/业务/权限/Worker逻辑或UI。精确源码与Linux32/真实同镜像合成PG完整恢复结果见专项记录，CI和真实新备份另行核实，不预写部署成功。

02:31Z真实新备份70c0a21e BACKUP_VERIFIED（145表/13对象），全数据解码、前后完整快照与cleanup全部通过；02:32Z只读九Gate全true，旧失败字节保留。等待正常分钟tick新heartbeat后进入受控UI切版；尚未宣称Staging完成。六原PR及UIa0/Ops源码2ce三CI全成功，精确部署代码版本保持，不因本纯证据文档递增而重建UI候选。
