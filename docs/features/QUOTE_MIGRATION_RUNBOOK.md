# Q5 Historical Quote migration — guarded operational boundary

## Current state (Q4C-B / Q5-C, 2026-10-08)

**Q4C-B REAL COS PREFLIGHT PASS** 已由用户提供 reviewed `a979d4b4...` 官方 Node 输出与原证据 checksum（不是本轮远程获取/重算，详见 ATTACHMENTS）。原 probe 全阶段、hash、cleanup PASS，不重测。Persistent credential loader/setup/offline check 本轮只工程交付，真实 host secrets installation NOT EXECUTED、production runtime storage NOT ACTIVATED。Q4C-B PASS 仍不证明 private policy/CAM `attachments/*` Delete deny 或 runtimeConfigReviewed；Q5 final storage readiness 不得自动置 true。真实 0008、Quote import、Q5 Execute 仍 NOT EXECUTED/NOT AUTHORIZED，Quote/附件 BROWSER，Q3 SERVER。下段 NOT RUN 是 original tooling Gate 的历史，不覆盖此次 closure。

Q4C-B 已提供独立 Node/S3 preflight 工具与 `zhixu-object-storage-preflight.v1` evidence；仅 disposable MinIO 验证，正式真实 Node run **NOT RUN**。USER CONFIRMED：COS 私有 `weaveops-prod-1501437430` / ap-hongkong 已建立，宁波 Python PUT PASS，直接复用该 bucket，无命名依赖。Q5-B 的 `quote-object-storage-readiness.v1` 仍要求单独核验 private bucket 与正式 runtime config；不得将 Q4C-B evidence 自动当作 `runtimeConfigReviewed=true` 或 Q5 final PASS。真实 0008/Quote migration/部署仍 NO，Q5 Execute NOT AUTHORIZED。下段“未配置 COS”是原 Q5-B Gate 的历史工程边界，不代表当前 bucket 不存在。

Q5-A 的 canonical Browser full-backup Quote projection 与 disposable PostgreSQL import/readback 已完成。Q5-B 增加 reviewed-source、source/freeze/rollback/rehearsal/Object Storage 证据契约、一次性数据库 advisory lock、COMMIT 不确定性与新连接 readback；`Invoke-Q5GuardedQuoteImport.ps1` **只有 VerifyOnly**，没有真实 Execute 参数或连接真实数据库写入的入口。合成证据能在 disposable PG16 覆盖同一前置验证模型。Q5-B 未捕获真实 Browser source，未配置 COS，未执行真实 0008、Quote import、部署或 authority switch。

当前真实目标缺 0008；Q5-C 已实现独立 Quote-writer frozen/read-only candidate，尚未真实部署。Q3 `masterSettingsAuthority=frozen` 仅冻结 Q3 master/settings，**不**证明 Quote aggregate 停写。真实 Q5 Execute 仍为 `NOT AUTHORIZED / NOT READY`。现有真实 3001 的 Q3 master/settings 可继续 Server 编辑；旧 3002 不应被启动或因 Q5 任务重跑 Q3 import。

## Evidence contracts and source order

### Q5-C engineering freeze boundary (not deployed)

`NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE` defaults to `writable`; only `writable|frozen` are accepted. Vite build-info, Docker build/runtime env and `io.zhixu.quote-writer-mode` label bind this value. Server startup rejects compiled/runtime mismatch. Q3 authority and identity are independent; the future combination is `server` / `frozen` / `local-single-user`, not static maintenance mode.

| Browser Quote write path | Frozen enforcement |
| --- | --- |
| list/detail / canonical source / legacy compatibility | Pure current-v13 envelope validation; bypass initialize/cache/normalization/seed/legacy merge/remove; invalid source shows 报价冻结源不可安全读取 |
| save / delete / createDraft / copy | First-line repository `assertBrowserQuoteWrite`; `/new` and copy modal stop before defaults/IDs |
| base info / costs / status / Revision / PriceVersion / Estimate | Read-only props, hidden mutation actions, handler guards and repository guard; navigation/search/preferences/export remain |
| customer confirmation / Server current terms from Quote | Quote UI confirmation action hidden and handler guarded; independent Server domain unchanged |
| Quote → Order | Frozen modal never mounts; submit guard; unrelated Order domain unchanged |
| upload / rename / unlink / style / pending blob delete | Browser Quote controller and Quote-specific deletion guard; shared IndexedDB repository stays usable by unrelated domains |
| bootstrap / standard backup | Pure frozen source validation; skip Quote initialization; full backup checks identical Quote raw string before/after |
| restore / reset | Explicit Quote guard in service and disabled UI, independent of Q3 authority |

Attachment preview/download still reads existing IndexedDB/legacy references; D-094 clearing does not run in Browser. Existing schema migration must finish in a writable build before a future frozen deployment; frozen code cannot repair source.

`npx tsx scripts/verify-q5-frozen-build.ts --origin <same-origin> --commit <full-40-char-sha> --build-id <id> --build-time <ISO-8601> --identity-mode local-single-user` only performs a GET of build-info, requiring exact identity, Quote frozen and Q3 server. It does not close tabs, capture backup or grant readiness. Redirects/wrong origin/build/writable identity reject.

Future Q5 frozen builds must inject the full reviewed 40-character Git commit; build-info `buildTime` accepts the repository's ISO-8601 timezone-offset convention (including `+08:00`) as well as UTC `Z`. The Q5-B freeze/source evidence timestamps retain their stricter UTC `Z` contract.

`prepareQuoteFreezeEvidence` requires explicit operator old-tabs attestation and emits `quote-writer-freeze-preparation.v1`, without `noMutationAfterCapture`. Only `finalizeQuoteFreezeEvidence`, after capture, with explicit no-mutation attestation, equal before/after raw-source SHA-256 and ordered timestamps can emit the existing Q5-B `quote-writer-freeze.v1`; the Q5-B parser remains unchanged. Preparation alone is never accepted as final proof. These helpers do not create real operational evidence in this engineering Gate.

Validation uses synthetic current Browser records and temporary IndexedDB. The isolated Chromium harness uses a fresh temporary profile, ephemeral loopback port and a synthetic route backed by production repositories/controller/export; it closes only its own test tabs and verifies same-origin writable → frozen list/detail/export raw-byte continuity. It is not real 3001 UI acceptance. Production UI restrictions are additionally checked by source-contract regression. No real profile/backup/DB/COS is read.

Q5 只消费现有标准 Browser full backup，不建立第二套备份格式或 Quote 归一化。`quote-history-source-identity.v1` 仅保存 file SHA-256、Q5 source/projection hash、origin、namespace、environment、schema/backup version、capture time、file mtime 与 reviewed commit；不保存 localRecords、Quote payload 或附件 blob。`quote-writer-freeze.v1` 绑定同一 origin/commit、build ID/runtime identity、用户确认关闭旧可写标签页、重开只读界面、Quote 写路径已禁用，以及 capture 后无 Quote mutation 证明。时间必须满足 freeze start ≤ old tabs closed ≤ frozen reopen ≤ frozen verification ≤ fresh capture ≤ source file mtime；文件名时间不作证明。

正确未来窗口顺序：Quote-specific Browser freeze → 关闭旧可写标签页 → 重开并验证 frozen/read-only Quote surface → fresh 标准备份 → canonical Preview / immutable SHA → disposable rehearsal proof → exact-target rollback backup → final VerifyOnly → 单独授权的 Execute Gate。DB competing Quote writers 的冻结是另一个证明，不可用 Browser freeze 或 Q3 frozen mode 代替。若冻结后的 build、origin、profile、source hash 或 writer inventory 改变，旧证据失效并重新开始安全检查。

`quote_import_disposable_rehearsal.v1` 必须是 `COMMITTED_PASS`、有 reviewed commit、source file/source/projection hash、完整 migration ledger/checksum、readback hash/counts 与 proof/artifact SHA；用户手写或不完整 JSON 拒绝。`zhixu-exact-target-backup.v1` 使用仓库现有 `Backup-Zhixu.ps1` custom-format dump + archive-list PASS + manifest、file/manifest SHA、精确 target fingerprint、post-freeze time；不自动 restore。Q5 证据小包未来只可包含身份/哈希/冻结/排练/manifest/COS 摘要与 D-091 execution evidence，**不**复制原始 Browser backup 或 `.dump` 本体；独立第二份保管机制仍须在真实窗口单独验证。

## Target and attempt safety

运维 read-only 入口复用 `database-target-guard.ps1`，必须由操作者显式指定 container、Compose project、PGDATA volume、database name 与 canonical fingerprint；`garment-erp-postgres` 无关且不可触碰。只读核验 migration ledger 与本地 SQL checksum；必须有 0005–0008 全部 current，0008 未应用即 `BLOCKED_PENDING_0008`。首次 import 仅要求八张 `quote_center_*` 和两张正式附件表为空、Quote sequence 未消费；已有 SalesOrder、Q3 master/settings、ConfirmedCommercialTerms 或其 OperationLogs 不构成空库阻塞。

内部 Q5 import 复用 Q1 aggregate transaction，不经 HTTP/runtime allocator/actor/OperationLog。`pg_try_advisory_xact_lock` 只允许一个 Q5 import；任一写入前失败可 rollback。COMMIT request 发出后的异常为 `COMMIT_OUTCOME_UNKNOWN`，销毁该连接，禁止称为 rollback 或自动重试；另用新连接执行只读 aggregate/count/sequence reconciliation。正常 COMMIT 后读回失败是 `COMMITTED_BUT_UNVERIFIED`，均须保留冻结并交由操作者处理。第二次执行因非空目标 fail closed。Q5 attempt evidence 包装仓库 D-091 `MigrationExecutionEvidence`，区分 `PRECHECK_FAILED`、`ROLLED_BACK`、`COMMIT_OUTCOME_UNKNOWN`、`COMMITTED_BUT_UNVERIFIED`、`COMMITTED_PASS`，不制造 runtime Quote CRUD log。

## Remaining real Gate blockers

- 独立授权部署已实现的 Quote-specific frozen/read-only candidate，验收真实旧标签页关闭/同源连续性；Q3 master/settings frozen 不可代用。
- 正式 Node Q4C-B PUT/HEAD/GET/delete/absence 已由用户执行 PASS，不要求重复。仍需 private/CAM policy（尤其正式附件 Delete deny）、实际 runtime identity/ro mount/config review 与公网逐操作 bounded timeout activation 核验；本轮不安装 secrets、不接 COS、不部署。Q4C-B evidence 不能自动生成 Q5 final storage proof，见 `ATTACHMENTS.md`。
- 独立授权执行真实 0008，并验证真实 ledger current。
- fresh authoritative Browser backup、一次性排练 proof、exact-target post-freeze rollback dump/manifest 与独立 evidence custody。
- 设计并授权 Quote-only/受控 DB competing-writer freeze、最终 pre-execute freshness 与真实 Execute runner；当前脚本故意不暴露 Execute。
- 最终 Quote import、读回、生产 UI/authority cutover 均为后续独立 Gate；VerifyOnly PASS 不等于 Execute 授权。
