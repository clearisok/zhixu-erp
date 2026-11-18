# 2026-11-18 恢复证据接线交接

分支 `fix/staging-backup-sync-recovery`。已核实main **a915c7a130ddada13118a1d245b41e7999b9d395**；起点24953ec47b523d65bb57094958c61a2a2179ef96。用户授权实现、隔离测试与Draft PR；不merge、不部署、不改真实Staging状态。Refs [Issue153](https://github.com/clearisok/zhixu-erp/issues/153)。

实际采集已替换空recovery_evidence，复用现有迁移/DB/source target检查及worker启动。新executor回执记录进程身份和正向清理证据；监管器持备份锁完成检查及启动。心跳验证与未知结果保护保留。详见[契约/一次性旧故障恢复](ops/ainuoke-catalog-sync-supervisor.md)。

真实隔离E2E已通过（非mock证据）：失败命令→真实清理→真实DB/migration/admin/lease→启动→新PG心跳→后续高频到期任务；包含拒绝恢复场景。执行命令：`pwsh -File scripts/tests/Invoke-AinuokeRecoveryRuntime.ps1 -SourceSha <candidate full SHA>`。测试镜像Source传输为合成SDK，无真实ERP请求。最终测试与交付回执随后补记；不要因Draft PR冒称Staging修复。

真实Staging只读核实仍旧fault，缺新executor pin/cleanup/process证明，现场未修改。需批准部署后进行一次新受控配对备份取得独立新证明，不能回填旧失败记录。超时/信号/未知后代仍fail closed。原始调查和历史接力完整保存在[归档](tasks/completed/2026-11-18-before-recovery-evidence/AI_HANDOFF.md)。

本轮工程结果：Python定向22项（Windows21通过/1 POSIX跳过）；Linux定向22/22通过，真实证据E2E在代码提交efb9b251523d00e1310edbf9d4f609a1df8600fe对应镜像通过（55.113秒），含失败回执保留、新worker心跳、后续到期任务及DB/admin/migration/lock/exec/unknown阻断；相关TS/PG/调度10项通过；typecheck、lint、前后端build、diff-check通过。首次源码基线仅因D195与同步契约文档冻结版本未前向登记而失败，待新commit blob登记后重验；182基线回归已启动，结果另记。Draft PR不代表部署。

已对D195与同步审计契约新增前向冻结记录，旧ID/blob/hash均保留。主机Staging仍原样；Git交付仅使用本机及宁波/tmp隔离Git目录，不属于应用部署。Windows交付预检曾在manifest待提交时拒绝dirty，0push；已核实只含本任务18行前向记录并收口后再交付，未清理或覆盖其他改动。
