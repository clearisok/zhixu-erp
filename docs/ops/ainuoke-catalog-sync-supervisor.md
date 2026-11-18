# 宁波合同分档同步监管与恢复证据

2026-11-18 工程候选；Refs [Issue153](https://github.com/clearisok/zhixu-erp/issues/153)。用户仅授权实现、隔离测试与 Draft PR，未授权合并、安装或恢复 Staging。原始事故及未完成阶段的日期、hash、限制保存在 [历史契约](../tasks/completed/2026-11-18-before-recovery-evidence/ainuoke-catalog-sync-supervisor.md) 和 [事故记录](../tasks/active/staging-backup-sync-investigation-2026-11-18.md)。

## 真实采集与状态转换

`scripts/ainuoke_sync_supervisor.py:recovery_evidence` 不再返回空字典。每次恢复 tick 在原 supervisor 锁内获取 executor 的 `.backup.lock` 并一直持有至本 tick 启动完成；运行失败、缺文件、错误身份或未知结果均返回明确的否定证据和封闭 `collectionError`。不缓存或复用上个 tick 的健康判断。

采集依次核实：

1. 私密配置与 identity 的 sourceSha、worker image 完整 digest、sourceKey、expectedTarget、backupExecutorSha256 一致；镜像 revision、executor 实际字节 hash 与 policy pin 一致。实际 worker 的环境在内存中与 image+env-file 比较，不输出秘密。
2. 备份 terminal receipt 的 source/project、完成时间及本轮开始时间匹配；已结束 executor 的 Linux boot ID/PID/start ticks；`weaveops-backup-cleanup.v1` 正向证明、命令进程组再次检查、服务容器 ID/image/project/存活状态、当前 Docker ExecIDs。
3. 所有 required 证据齐全才可通过：没有运行中备份、executor 及受控命令已退出、备份锁已由监管器取得、原应用已恢复。空 ExecIDs 或 exit 0 单独都不够。
4. 在同一不可变 worker image 中启动 DB-only `--sync-health`，仅加入 internal DB network，复用现有 target fingerprint、正常 actor/RBAC 和完整 migration checksum 校验。必须包含0058，不接受较新未知迁移或 pending/checksum mismatch。查询 PG 恢复状态、管理员 enabled/paused、任务/catalog/capture 的 running/unknown 与现有 advisory lease。只读检查不推进 heartbeat、任务或业务记录。
5. 探测响应的 sourceKey/targetFingerprint、应用采集时间和 DB 时钟匹配；探测容器只能按本次随机 label 清理。失败不打印原始 stdout/stderr/env。健康结果只能在本次 tick 使用。

`STOPPED_FAULT / backup_failed_requires_review`、中断备份及安全可恢复的 worker 停止可进入门禁。通过后复用原 Docker create/start 路径，先持久化失败意图，再进入 `RECOVERING`；后续 tick 必须看到新的真实 heartbeat 才进入 `RUNNING`。两分钟仍无心跳、退出或启动结果不确定则 `RECOVERY_FAILED`，不盲目重复启动。运行中 worker 的正常 in-flight 工作与已经 unknown 的结果分开检查，避免刚启动就把正常任务当成未知提交。已有健康实例不重复启动。

管理员停用、认证/身份/权限暂停及 running/unknown 的停机任务不自动清除。沿用数据库 worker advisory lock；本轮不新增任务 lease schema，不把 unknown 改成 failed 再 retry。备份失败回执及原始 fault 保留，恢复不把 FAILED 伪装成 SUCCESS。30分钟/每日02:00/周一03:00/月1日04:00北京规则不变。

## 配置与未来发布绑定

原 `weaveops-catalog-supervisor.v1` 字段保持，新增必需恢复字段：

- `backupPolicyFile`：本版本私密 policy 绝对路径。
- `backupExecutorSha256`：部署后的 executor 精确字节 hash；identity JSON 必须绑定同值；policy.files 必须 pin 同一 executor 路径和 hash。
- `backupCommand` 必须是原 Python、executor、`backup`、同一个 policy 路径。`backupStatusFile` 必须是 policy.backupRoot/status.json，且与 supervisor 的 stateRoot/status.json 分离。

目录700、文件600、同一运行 uid、不允许 symlink。worker image 必须含本次 `--sync-health` 和正确 revision 标签；监管器、gate 模块、executor、collector、env、policy 均作为配对发布资产固定。现有主/egress 网络归属检查、单 owner、只读根、cap-drop、私密 mount 和 DB 权限保持。不安装 Restart=always。

## 旧版 Staging 故障的一次性恢复流程（本轮未执行）

11/18 只读核实：Staging 仍 source b4fc85ed0ac09ad45db8959257a9b2d840abba26，STOPPED_FAULT/backup_failed_requires_review；旧备份20261116T193001Z-c6870e6d为FAILED，缺少 cleanup、executorProcess 和新 executor pin。旧 status SHA256：acee3b9c1cb1a2dc440771472f0a7ac19bfe8c3e7b75b2406603783d93ba4d9b。旧 executor SHA256：2a4d0f89fcfcd08d75986906d887eeac4ead2c103afb79558e053c6bd13d0803。缺失的历史证明不能补写为成功。

部署获批后，先保全旧配置、旧失败包、status精确hash和镜像；按既有 runbook 固定新 source/image/executor/module/policy，保持 worker 停止。先运行 `python3 <new-supervisor> --config <private-config> recovery-check`，只读输出全部 gate/checks 和缺失原因，不改控制或 fault。

旧回执缺证明时，保留旧失败包，进行一次另行审核的正常新配对备份：`python3 <new-supervisor> --config <private-config> --reason '<review reference>' backup`。只对已停 worker 的已知 backup fault开放此受锁操作；新备份正常产出独立run和新清理证明，绝不修写旧run。成功或普通失败但清理已验证后，重新 recovery-check；所有安全条件满足才由正常分钟 tick 完成恢复和心跳验证。数据库不健康、未知任务或清理未核实时保持阻断。不得 SQL 清暂停、改时间、补造成功或并行启动旧 owner。

## 当前限制与验收

超时、信号或不确定 Docker daemon 后代不会自动取得正向清理证明；保留阻断和人工核对。这是 Draft 中的已知限制，不假称所有故障都能自动恢复。DB健康检查不等于完整损坏检测或备份恢复验证；已有真实配对备份、恢复演练和数据身份保护仍属于发布检查。

真实证据 E2E：`pwsh -File scripts/tests/Invoke-AinuokeRecoveryRuntime.ps1 -SourceSha <full candidate SHA>`，使用新 internal Docker network、tmpfs PostgreSQL、正常迁移/权限/绑定、实际 recovery_evidence 与实际 worker持久化路径。测试镜像中的 Source IO 仅替换成已有内存SDK传输；不会向真实艾诺科请求。备份失败命令、清理采样、DB health、lease、Docker启动、PG心跳和后续到期任务均真实执行。Windows Python组中的POSIX项需由Linux运行覆盖。

本轮不执行真实安装。回退先停止新 owner、保留队列/回执和所有卷，再按旧匹配版本恢复配置及镜像；不恢复旧库覆盖期间新增业务。未来仍需用户批准合并/部署，并完成至少两轮自然30分钟及人工业务验收。
