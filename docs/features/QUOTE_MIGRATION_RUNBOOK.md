# Q5 Historical Quote migration — guarded operational boundary

## Current state (Q5-B, 2026-10-07)

Q5-A 的 canonical Browser full-backup Quote projection 与 disposable PostgreSQL import/readback 已完成。Q5-B 增加 reviewed-source、source/freeze/rollback/rehearsal/Object Storage 证据契约、一次性数据库 advisory lock、COMMIT 不确定性与新连接 readback；`Invoke-Q5GuardedQuoteImport.ps1` **只有 VerifyOnly**，没有真实 Execute 参数或连接真实数据库写入的入口。合成证据能在 disposable PG16 覆盖同一前置验证模型。Q5-B 未捕获真实 Browser source，未配置 COS，未执行真实 0008、Quote import、部署或 authority switch。

当前真实目标缺 0008；Quote Center 尚无独立的 Quote-writer frozen/read-only build。Q3 `masterSettingsAuthority=frozen` 仅冻结 Q3 master/settings，**不**证明 Quote aggregate 停写。真实 Q5 Execute 仍为 `NOT AUTHORIZED / NOT READY`。现有真实 3001 的 Q3 master/settings 可继续 Server 编辑；旧 3002 不应被启动或因 Q5 任务重跑 Q3 import。

## Evidence contracts and source order

Q5 只消费现有标准 Browser full backup，不建立第二套备份格式或 Quote 归一化。`quote-history-source-identity.v1` 仅保存 file SHA-256、Q5 source/projection hash、origin、namespace、environment、schema/backup version、capture time、file mtime 与 reviewed commit；不保存 localRecords、Quote payload 或附件 blob。`quote-writer-freeze.v1` 绑定同一 origin/commit、build ID/runtime identity、用户确认关闭旧可写标签页、重开只读界面、Quote 写路径已禁用，以及 capture 后无 Quote mutation 证明。时间必须满足 freeze start ≤ old tabs closed ≤ frozen reopen ≤ frozen verification ≤ fresh capture ≤ source file mtime；文件名时间不作证明。

正确未来窗口顺序：Quote-specific Browser freeze → 关闭旧可写标签页 → 重开并验证 frozen/read-only Quote surface → fresh 标准备份 → canonical Preview / immutable SHA → disposable rehearsal proof → exact-target rollback backup → final VerifyOnly → 单独授权的 Execute Gate。DB competing Quote writers 的冻结是另一个证明，不可用 Browser freeze 或 Q3 frozen mode 代替。若冻结后的 build、origin、profile、source hash 或 writer inventory 改变，旧证据失效并重新开始安全检查。

`quote_import_disposable_rehearsal.v1` 必须是 `COMMITTED_PASS`、有 reviewed commit、source file/source/projection hash、完整 migration ledger/checksum、readback hash/counts 与 proof/artifact SHA；用户手写或不完整 JSON 拒绝。`zhixu-exact-target-backup.v1` 使用仓库现有 `Backup-Zhixu.ps1` custom-format dump + archive-list PASS + manifest、file/manifest SHA、精确 target fingerprint、post-freeze time；不自动 restore。Q5 证据小包未来只可包含身份/哈希/冻结/排练/manifest/COS 摘要与 D-091 execution evidence，**不**复制原始 Browser backup 或 `.dump` 本体；独立第二份保管机制仍须在真实窗口单独验证。

## Target and attempt safety

运维 read-only 入口复用 `database-target-guard.ps1`，必须由操作者显式指定 container、Compose project、PGDATA volume、database name 与 canonical fingerprint；`garment-erp-postgres` 无关且不可触碰。只读核验 migration ledger 与本地 SQL checksum；必须有 0005–0008 全部 current，0008 未应用即 `BLOCKED_PENDING_0008`。首次 import 仅要求八张 `quote_center_*` 和两张正式附件表为空、Quote sequence 未消费；已有 SalesOrder、Q3 master/settings、ConfirmedCommercialTerms 或其 OperationLogs 不构成空库阻塞。

内部 Q5 import 复用 Q1 aggregate transaction，不经 HTTP/runtime allocator/actor/OperationLog。`pg_try_advisory_xact_lock` 只允许一个 Q5 import；任一写入前失败可 rollback。COMMIT request 发出后的异常为 `COMMIT_OUTCOME_UNKNOWN`，销毁该连接，禁止称为 rollback 或自动重试；另用新连接执行只读 aggregate/count/sequence reconciliation。正常 COMMIT 后读回失败是 `COMMITTED_BUT_UNVERIFIED`，均须保留冻结并交由操作者处理。第二次执行因非空目标 fail closed。Q5 attempt evidence 包装仓库 D-091 `MigrationExecutionEvidence`，区分 `PRECHECK_FAILED`、`ROLLED_BACK`、`COMMIT_OUTCOME_UNKNOWN`、`COMMITTED_BUT_UNVERIFIED`、`COMMITTED_PASS`，不制造 runtime Quote CRUD log。

## Remaining real Gate blockers

- 实现并验收 Quote-specific frozen/read-only Browser build 与旧标签页关闭/连续性证明；Q3 master/settings frozen 不可代用。
- 真实生产 Object Storage private bucket、runtime config 与 PUT/HEAD/GET/delete preflight；本 Gate 不接 COS。
- 独立授权执行真实 0008，并验证真实 ledger current。
- fresh authoritative Browser backup、一次性排练 proof、exact-target post-freeze rollback dump/manifest 与独立 evidence custody。
- 设计并授权 Quote-only/受控 DB competing-writer freeze、最终 pre-execute freshness 与真实 Execute runner；当前脚本故意不暴露 Execute。
- 最终 Quote import、读回、生产 UI/authority cutover 均为后续独立 Gate；VerifyOnly PASS 不等于 Execute 授权。
