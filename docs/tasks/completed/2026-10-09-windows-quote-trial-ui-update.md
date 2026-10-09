# Windows Quote Trial UI 原地更新 — 2026-10-09

用户明确授权现有 win01 的更新前备份与 app/gateway 替换，保留 DB、账号、业务、附件、密钥和个人偏好。代码基线 `edc3598764266de087c0f669f8bcf5452c6d3fd2`（PR82/83 merged），分支 `ops/update-quote-trial-windows-ui`；安全工具 checkpoint `b27dc579fa25d9d34b71382cfce5427fa6e245c9`。本文仅含脱敏事实，不包含真实配置、凭据、dump、对象字节或报价内容。

## 精确运行身份

| 项目 | 实际值 |
| --- | --- |
| Docker context | 本机 desktop-linux / Docker Desktop npipe；不是 Ubuntu |
| Project / root | `zhixu-quote-trial-win01` / `D:\zhixu-local-trial\win01` |
| URL / DB / data volume | `https://localhost:18443` / `quote_trial` / `zhixu-quote-trial-win01_data` |
| 原镜像/source | `zhixu-quote-trial:9ee254db89c6` / `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23` |
| 原 image ID | `sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57` |
| 新镜像/source | `zhixu-quote-trial-ui:878de323d618` / `878de323d618b25fca1f51ccf3f024e932641742` |
| 新 image ID | `sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4` |
| 新 build ID / time | `quote-trial-ui-20261009` / `2026-10-09T07:20:46Z`（labels/编译文件/真实HTTPS一致） |
| 运行模式 | production / Quote server / master server / writable / session |
| 保持的 database container | `c047b9fe8ea7b9b922ec3c8184e442248948c77c9389da0199eb63c96f741bec` |
| 保持的 database image | `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229` |
| 更新后 app container | `56f77a139366067d099dbb73b7d4e6bcfa8f35749c08f97f102ec825134ee7fe` |
| 更新后 gateway container | `15a09f0cb71a09d4b1a53e69ceab88835c848cac9b3f5c7e41c2b501701b1edc` |

没有构建/重贴镜像标签。部署脚本仍原审查快照；本仓库新增纯函数仅做四字段投影与完整 resolved Compose 模型白名单比较，拒绝任何 DB/secret/端口/volume 漂移。

## 备份和执行证据

- 真实既有 `Invoke-Trial.ps1 -Action Backup` 完整 PASS：新 dump `zhixu-20261009T083516Z-2b5042a5.dump`，120482 bytes，SHA-256 `7e5e8c6e2c154b9e11476905cc35d6e5b7bffd54a0ce808e27b96998455f899b`；私有 `tools/backups` 保存 manifest/archive 校验。
- 对象 bundle `object-backups/20261009T083503Z-76bbff9b` 保存2个数据库引用对象，逐对象 bytes/SHA 与 manifest 一致。只读现有 COS 对象，无 PUT/DELETE。
- 原应用备份后恢复 READY。全表比较发现已有启动行为刷新2个 `app_roles.updated_at`；离线 `pg_restore --file=-` 读取备份（不是 DB restore），逐列证明仅该技术时间列变化，其余角色/权限/账号/业务完全相同。未将这项差异隐藏为全库字节不变。
- 不可覆盖的原配置/manifest 和更新证据保留于受限 root/ui-updates；仅四个非秘密镜像/build字段改变，target记录新旧身份。秘密未输出或提交，运维文件 hash 完整保持。
- 原/新 resolved Compose 比较仅允许 app/gateway 镜像与 app构建身份；database config hash 与运行容器一致。新旧 migration SQL 文件/checksum完全相同。
- canonical新候选 check → start（Compose up，仅app/gateway）→ COMMAND_SUBMITTED → **READY**；三服务 healthy，HTTPS DB-ready/build-info正确，TLS证书/端口/网络/数据库容器/镜像/卷保持。不 migration/init/restore/seed。
- 保存的业务表内容核对一致：Quote/Revision/PV 各2、附件/Revision附件各2、品牌/业务员/面料/辅料各1；accounts2、roles2、permission目录54、role permissions55保持。包含用户后来新录入的数据，不假设只有初始 DEPLOY-VERIFY 单。
- 首 dump `zhixu-20261009T053144Z-2e1cc761.dump` 的SHA `ca699208efc0feacd4cf747f75be5aa7c97ab8a123c19d81d6d08cc4588d62ca` 再核对一致；原3个dump及3个对象bundle保留，旧对象backup逐对象hash PASS。
- 日常 `Status` 实跑，三服务 running/healthy；Start/Status/Restart/Logs/Backup五个原入口保留且工具快照hash通过，配置/目标manifest已识别新候选。本次不额外执行 Restart 或重复Backup。

## 验证与交接

- 本次配置白名单7/7 + Windows原生命令失败5/5 = 12/12；定向lint/diff-check PASS。原 UI Chromium61/61、auth67/67、SSR2/2、npm674/674等是PR83工程阶段证据，未重复运行，镜像应用源码不变。
- 管理员/受限用户真实session、Quote API、附件下载只读验收 **PASS**：用户在独立本机窗口隐藏输入当前管理员密码，单次管理员登录、单次受限账号登录，Secure/HttpOnly cookie仅在进程内，401/管理员权限/受限quote.view与403/Estimate裁剪核对通过；两会话正常注销。首次命令路径拼错发生于脚本执行前、未登录，修正路径后结果已从受限本机证据文件读回。**不使用部署配置旧密码**，不重设账号/密码，不读取浏览器Cookie。
- 列表准确total=2，全部已有Quote ID/version、2 Revision/2 PV读回；DEPLOY-VERIFY旧附件及用户后加附件共2个经正式metadata/download路径读回，字节数/SHA与数据库保存值逐一一致。只读API验收前后所有非session/login-attempt表内容一致，业务/账号/日志未额外写入，COS只GET、无PUT/DELETE。页面静态路径200不是用户浏览器验收PASS，不冒称执行了保存或新建UI动作。
- **真实 UI 人工验收 PENDING**：原URL登录后看列表工具区/列宽、新建加工/经销选择、详情首屏、面辅料成本字段及按钮、滚动/sticky。既有个人偏好保持；若需要九列新默认，由用户显式在列表页面设置恢复默认，不自动清理站点存储。
- 旧3000/3001/3002/Ubuntu/旧DB/Browser不变；不创建报价/附件/账号，不新初始化，不业务删除，不COS DELETE。D-096历史导入NOT REQUIRED；人工业务验收不由自动检查替代。Git PR不自动merge。

## Codex D integration — 2026-10-09 (no real environment operations)

- Independent worktree `D:\workspace\zhixu-pr84-integration`, branch `ops/update-quote-trial-windows-ui`; clean baseline `62af9d33fd1de9a981972405b0d1ef01b503d351`, normal merge of refreshed/GitHub-confirmed main `6e40b4318e59f8cc54adfe1aeb3d3e3d90a72613`.
- Manually reconciled AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX. Preserved D-099 and merged PR #85/#86, Source/Bridge repairs and 6087050 separate ownership gap; preserved this report, tools/tests, backup/deployment identity and durable data evidence. Retained historical archive links. Old 878de real deployment, PR86 engineering merge and PR88 candidate BUILT / NOT DEPLOYED remain separate.
- This run (distinct from original real operations): synthetic update whitelist7/7 + fake-native PowerShell5/5 =12/12; Python Bridge44/44; npm679/679, 0 skipped; typecheck/lint/frontend build41 routes PASS. Build has the existing non-failing chunk-size advisory. Conflict marker/unmerged path scans and staged diff-check PASS. No SQL/API/Quote/Material/Source business changes authored by this integration.
- No real Ainuoke request, credential access, database/COS/Browser/trial environment operation, backup, migration, deployment or PR merge. Normal push updates original PR #84 only; user merge review remains pending. The same physical directory will become a clean local neutral hub from latest origin/main after exact remote delivery verification; no unmerged PR84 code is carried into that hub.
