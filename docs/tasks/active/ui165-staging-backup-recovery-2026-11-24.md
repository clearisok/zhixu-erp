# Issue165 Staging备份门禁专项恢复

2026-11-24。独立于38项UI整改，仅执行本次用户授权的既有备份/恢复流程；不改变UI PR范围、业务逻辑/数据/权限，不部署Production，不修改旧失败回执或直接清保护。

起始分支codex/ui165-staging-recovery，HEAD10b9a7d827e1c09f152ead58c21f26712d49a619，clean。原ecceb144以及所有UI任务工作树完整保留。相关流程docs/ops/ainuoke-catalog-sync-supervisor.md，代码scripts/ainuoke_sync_supervisor.py、ainuoke_paired_backup.py、ainuoke_recovery_gate.py，本次无这些源码改动。

## 已核实故障
有效runtime/catalog-sync-0752d64f；原app0752d64f309d68b6e52afbbd712d28e0d9db9c1e/image9d638f76，Worker原image d3015e58，Supervisor RECOVERY_BLOCKED/backup_cleanup_unverified，originalFault backup_failed_requires_review。旧失败run20261122T193001Z-6ab9e927，完整快照450秒超时，commandsCertain=false，cleanup=false；九项Gate中仅backup_children_exited=false，其余八项当次只读检查为true。无活动快照后代或docker exec不能补写旧cleanup证明。所有原policy文件pins吻合。

数据库12,286,622,743字节、145表，source_runs估计73898行/8.38GB；此前11月20日46640行完整快照313.626秒，现有450秒预算已不足的推断符合数据增长，但具体耗时以本次真实执行为准。enable_presorted_aggregate仍是此前已验收off，不改查询计划设置。

## 已执行的受控新备份
私密恢复目录releases/ui165-backup-recovery-20261124保留policy/status/原failure完整字节和hash；未提交秘密/备份/原始数据。只调整私密policy.snapshotTimeoutSeconds 450→600，执行器原代码允许300–600秒，不修改SQL、行hash算法、全表完整性、前后快照比较或清理断言，不扩大来源请求/业务写入。此为既有有界运行配置，不修改release冻结基线。

正式Supervisor backup-check正向BACKUP_WORKER_QUIET后，2026-11-24T01:34:06Z启动新run20261124T013406Z-17774e94。由原Supervisor持锁调用原执行器，未直接启动Worker或清除fault；结果尚待核实，不预写成功。后续必须独立核实完整manifest/所有文件/数据库与对象配对、旧失败原字节保留，以及全部恢复Gate与实际新心跳。恢复/切版不可用单独HTTP200代替。

## 当前交付边界
本阶段只记录专项证据；UI组合在codex/ui165-staging-acceptance，五原PR不合并。不将本地工程通过、CI、备份成功、门禁恢复、部署及人工验收混同；未知结果继续阻断。

## 归档瓶颈与独立最小修复
新17774e94的第一遍完整快照502618ms通过，默认压缩pg_dump在600103ms超时；原服务已恢复，cleanup=false必须继续阻断。只读pg_stat_activity核实没有残留pg_dump/COPY或快照；不凭此更改旧回执。

PostgreSQL16官方pg_dump文档支持custom归档的zstd压缩：https://www.postgresql.org/docs/16/app-pgdump.html 。实际同镜像16客户端zstd:1的schema-only兼容性探测成功。本批将archiveCompression做严格可选zstd:1白名单，原未配置调用不变；不接受任意参数，不排除任何表/列/数据，不改SQL或row-sha256-multiset-v2，不增加dump600秒或snapshot600秒上限。增加必需完整归档数据解码，保留原TOC检查，pg_restore --file=/dev/null不连接真实数据库，损坏数据即verify_failed。运行时host executor按既有独立hash pin绑定，不更改UI候选或来源Worker代码。

验证：Windows11项中10通过/1POSIX跳过，实际Linux32项全通过。真实归档恢复夹具首轮使用SQL保留字binary为字段名失败（非产品问题），修正为binary_payload，保留初次失败；fixture改正向TCP就绪检查避免临时初始化socket误报，未放宽任何恢复比较。默认与zstd完整合成恢复、截断拒绝的最终结果见本阶段真实运行回执；未触及实际业务DB。

真实隔离PostgreSQL镜像721873c3（与Staging相同）最终PASS：3表/1111合成行，默认归档与zstd归档分别完整恢复到独立新数据库，与源全表行hash及序列逐项精确相等，含重复行、NULL/空字符串、超JS精度小数、JSON、bytea和外键；源快照仍相同；截断zstd归档被完整解码拒绝。两格式51339/35296字节，0.547/0.517秒。该小夹具不推断12GB真实耗时，实际完整新备份必须单独通过。专有network none/tmpfs容器按随机label/镜像/挂载正向核实后清理。
