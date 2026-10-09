# Historical — Windows trial deployment / UI / PR82 integration

Archived when UI convergence started; dated observations, not current operating instructions. No runtime inspection occurred in this UI task.

# AI 接力棒

## Active — PR #82 main integration / review closure (2026-10-09)

- 原分支 `ops/deploy-quote-trial-windows`，baseline `45ee50dd01f410b9ccfecc8c2bbeb99523593480` / clean。普通 merge 已验证 main `dd5fc62e6a4cdf5920528c71cfbd4dbae3c9013d`（PR #83）；只冲突 AI_HANDOFF / CURRENT_STATE / PROJECT_INDEX，Windows 工具及 UI 自动合并保留。
- Windows win01 此前真实部署 READY，用户已解决密码问题并打开页面；完整三张人工业务卡尚未确认通过。当前 18443 仍原 `9ee254d…` 镜像；#83 已合并，新 UI 候选 `zhixu-quote-trial-ui:878de323d618` 已构建未部署。下一步是另行授权现有环境应用更新，不重新 setup/init。
- 自动审查指向 windows-control 原生命令失败处理；被评论的 head 已有 Stop + PSNativeCommandUseErrorActionPreference=true，无需重复改脚本。PowerShell 7.6.6 临时目录/假原生命令 5/5：check、maintenance、objects-export、最后 start 非零均退出 1，不调用后续步骤、不输出 BACKUP_AND_RESUME_PASS；全成功才 PASS。未验证旧 PowerShell 版本，不宣称完整运维安全审查通过。绝不访问真实 root/Docker/DB/COS，历史 14/14 不冒充本次执行。
- 本次只整合仓库/补失败回归/审查回复，不代表完整 Windows 运维安全审查或真实更新获批。两边详细工程/部署证据见下方历史段，旧测试按原阶段引用。
- 不自动 merge；真实试用数据、配置、密钥和已部署运维快照保持不动。D-096 历史导入 NOT REQUIRED。

## Historical — Windows deployment evidence (PR #82; subsequent login success recorded above)

## Windows 独立 Quote Trial — READY / remote push recovered（2026-10-09）

- 用户已授权真实新本机部署，见当前任务附件与 [操作说明](../../../ops/quote-trial/README.md)。branch `ops/deploy-quote-trial-windows`，起始 clean HEAD/main `cc3c450562e692b696024558706954816227cb8a`（PR81 merged）。本次 fetch 成功；不重做 PR81、不再询问部署/新库初始化授权。
- app source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`，镜像 `zhixu-quote-trial:9ee254db89c6` / `sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57`，build `quote-trial-20261009` / `2026-10-09T03:00:00Z`；ops source `1e71d773c2d578029f42267b16999167b393c49f`。均已核对；不重贴标签。PR81 原 10/10、11/11 及早期业务证据是历史结果，不是此次重跑；此前阶段 A `d1ae6c3`、B `0659fa4`、C `9ee254d`/`532b1c5`、D `244e514` 保留在 Git 与操作说明。
- 唯一 target `D:\zhixu-local-trial\win01\target.json`：project `zhixu-quote-trial-win01`、HTTPS localhost18443、DB quote_trial、独立 `_data`/`_default`/`_secrets`/`_tls`；本机 Docker desktop-linux npipe。新目录/固定快照/受限ACL、CurrentUser证书已完成，用户隐藏输入已完成，**不得重做setup/init/账号/验收数据**。实际文件1000:1000/0600/ro，app/gateway密钥分开；Windows/CLI TLS PASS（证书2026-11-08 UTC到期，不动LocalMachine）。秘密仅私有文件/进程，不读入模型，不要求聊天密码。
- 用户提供 CAM 原JSON及直接绑定/唯一策略列表/私有读写、Bucket Policy `{}` 和子账号绑定 evidence：weaveops-cos 的 attachments PUT/HEAD/GET allow、DELETE deny；本轮从不 DELETE/扫描/接管旧对象。formal API runtime新对象读写已通过，未重跑带DELETE preflight。
- 实际 canonical check→init 新空schema0001–0008→start/restart READY，三服务healthy、ledger pending0/current/integrity valid；初始6技术表有记录，其余26表全0（`initial-state.json`）。新 `trial-admin`；参数化事务配置 `trial-viewer`仅quote.view。新目标API401/登录/403/Estimate隔离/保存读回/客户Excel/内部summary解析/日志与静态页 PASS。
- 仅保留1个 DEPLOY-VERIFY brand、salesperson、Quote `a1f8e54a-fb5f-45be-a7b2-754feace53a6` / `QT-2026-1009-001`、1 Revision/PV、1 PNG附件 `a6eba969-dd51-4a36-bcd0-7761b4a05db1`。COS `attachments/<该UUID>/original`，68bytes，SHA256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`；正式下载/重启/备份后readback PASS。公司defaults/面辅料/制造预设/订单仍0。验收中只修本地一PV汇总行数断言，没有重复创建/上传。
- 首dump `zhixu-20261009T053144Z-2e1cc761.dump` /117420bytes/SHA `ca699208efc0feacd4cf747f75be5aa7c97ab8a123c19d81d6d08cc4588d62ca`，位于私有root/tools/backups，manifest/archive/hash PASS；object-backup仅1个DB-owned对象。日常Backup发现硬编码bundle源导致fail-closed，现Windows override改为显式变量，第二bundle续导出PASS，最终完整日常Backup再验证PASS/READY（dump `zhixu-20261009T053900Z-dfd90e42.dump`、bundle `object-backups/20261009T053851Z-bb88ae72`）；全部产物保留，无restore/删除真实数据。失败经过不掩盖为首轮一次通过。
- `Invoke-Trial.ps1`及Start/Status/Restart/Logs/Backup.cmd已在私有root，实际全部验证；入口snapshot guard，日常不init，失败不自动restore/删除/恢复编辑。源 `ops/quote-trial/windows-control.ps1` 与已部署入口SHA一致；canonical ops源仍1e71、应用仍9ee，Windows适配另有本分支提交。不重新打镜像标签。
- 此次定向14/14、lint/diff-check PASS；未改应用/SQL/Dockerfile、不重跑旧业务/历史导入suite。Chrome独立会话两次request-header policy加载失败，自动浏览器验收未完成；人工三卡NOT RUN。下一步用户用新密码访问新URL做卡1，再卡2/3；不要再制造迁移Gate。首次card与日常入口见私有root/README、仓库ops README。
- 旧 3001容器ID `2af703487293` healthy，3002 `0d95a18ef3dd`仍stopped，旧DB `419dce9da0da` healthy，端口/ID未变；只读metadata，不连接旧DB/Browser/Ubuntu。当前新目标database/app/gateway保持running/healthy；禁止down/cleanup/prune/COS DELETE。新用户数据是真实持久数据，历史导入NOT REQUIRED。
- Git历史：checkpoint `8fd7e8f` push失败Connection reset，按用户授权继续部署；最终部署提交 `70953a6ca85d7478750809dc8c61484e322038e1` 的只读远端核实亦超时。现用户已人工 push 恢复，本轮本地核对 HEAD=origin/ops/deploy-quote-trial-windows、working tree clean。仅追加必要交付状态文档并创建/复用唯一PR；本次不重跑工程/部署测试，不操作运行环境或受限部署快照。PR交付不代表合并审查通过，不自动merge。

## Historical — UI implementation / delivery evidence (PR #83 now merged)

## Active — Quote Trial UI Usability Repair (2026-10-09)

- Branch `fix/quote-trial-ui-usability`，base `cc3c450562e692b696024558706954816227cb8a` / clean。独立于 PR #82 Windows 运维交付。
- 用户确认密码问题已解决、已登录并打开真实页面；完整三张业务卡仍未确认通过。真实 `https://localhost:18443` 继续运行原 `9ee254d…` 镜像，本任务不访问试用 DB/COS/credentials，不替换运行环境。
- 本轮修复：Server 列表紧凑工具区、9 列默认组合与显式恢复默认（已有偏好不清空）；可选 readable DataTable 像素下限、表内横向滚动及 sticky 操作列。默认共享表格保持 fit-first。
- 新建页紧凑类型面板；POST/类型初始化 PUT 与失败保留 ID 不变。详情正常技术说明移入诊断入口，真实错误/冻结/校验保留；成本不折叠。退出按钮脱离文档流，修复额外页面滚动；sticky observer 在资料就绪后绑定 workspace，并纠正 expanded sidebar 左边界。Server 未接通转订单仍禁用。
- 已执行业务 Chromium 61/61（合成 PG/tmpfs、临时 profile、memory storage；附件下载 bytes/SHA、加工/经销、CAS/成本同步/Revision/PV/Estimate 权限/导出保留）、auth/persistence 67/67、共享表格实际 SSR 2/2、npm test 674/674；typecheck/lint/Server build PASS。Server/default Browser frontend PASS，默认 build-info 为 browser/browser/writable/session。视觉 capture 1/1 PASS：40 组配对图、额外全列/Portal/数值成本图，已打开图片复核；document 无横向/重复页面滚动，1280 首屏基础输入可用，cleanup PASS。
- 同尺寸 before/after 合成截图与 DOM 在仓库外 `C:\Users\Administrator\.codex\tmp\quote-trial-ui-visual`；1920×1080、1440×900、1280×800、900×800，100% 缩放。默认 Browser 与真实旧环境不变；历史导入 NOT REQUIRED。
- 本地工程 commit `878de323d618b25fca1f51ccf3f024e932641742`。新候选 `zhixu-quote-trial-ui:878de323d618`，image ID `sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4`；build ID `quote-trial-ui-20261009`、full source SHA 为上述工程 commit、server/server/writable/session。实际 Dockerfile 构建及 network-none 临时容器 build-info/labels 核对 PASS；真实 18443 未部署更新。
- 历史交付故障：工程 checkpoint push Connection reset，随后只读 API 返回 branch 404；用户现已人工推送恢复。恢复 baseline 为 `c35462a222744c1d6fa7f2340f77aae777b67ceb`，local HEAD = origin 分支，clean。本轮只更新交付状态及收录已有合成对比图，再创建唯一 OPEN UI PR，等待合并审查；不重跑工程测试/截图/构建。代表图见 `docs/assets/quote-trial-ui/`，完整本机证据目录如上，不是公开图片 URL。

## Historical / superseded task — PR #81 startup follow-up

## Quote Trial Release Preparation — PR #81 startup follow-up (2026-10-09)

- 同一branch `feat/quote-trial-release-preparation`，本次baseline `244e5143ffc6eda15a031dfe8f90acbdbe5240d0` / clean；不重做A/B/C/D，不创建新PR。原base `d25aac7aa19a90ac1c1f573fbb60e420b7899e98`。
- 已完成阶段保留：A `d1ae6c3`、B `0659fa4`、C runtime `9ee254d`、C isolated `532b1c5`、D `244e514`。原历史归档见 [归档](completed/2026-10-09-pre-trial-state-history.md)，本任务范围与三张卡见 [操作说明](../../../ops/quote-trial/README.md)。
- 镜像仍为 `zhixu-quote-trial:9ee254db89c6`，应用source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`，image ID `sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57`，server/server/writable/session。新ops commit不冒称镜像已重建；应用/Dockerfile/构建输入未变。
- 本次已修复：gateway覆盖错误local3000探针，可信8443 TLS+上游health；start/restart先COMMAND_SUBMITTED，精确容器镜像/私有配置指纹、三服务healthy、HTTPS DB-ready和build-info一致才READY。restart漂移在重启前拒绝，不自动升级；status仅安全运行事实。失败不迁移/恢复/清理/自动回滚。
- 本次最终验证：配置/TLS/就绪10/10；实际候选CLI与完整smoke/独立恢复11/11（未初始化拒绝、正常start/restart、配置/候选漂移、代理/TLS故障、有界非零安全输出、无额外业务写、持续网关health、Quote/history/Estimate/admin/附件字节保持）；cleanup、typecheck、lint、diff-check PASS。
- 此前工程结果（本次未重复）：原镜像smoke9/9、Git6/6、SDK8/8、credentials4/4、MinIO2/2、auth/frontend66/66、npm674/674、Server/两种frontend build PASS，默认browser/browser/writable。不得将其写成本次重跑。未重跑无关Chromium、历史迁移或真实COS。
- AGENTS新网络恢复协议继续适用；fetch reset根因unresolved，不修改共享Git/代理/TLS配置。交付以实际local/remote/PR head核对为准，不预写自身最终SHA。
- 真实Ubuntu/3000/3001/3002/DB/Browser/COS/keys未操作；真实部署NOT EXECUTED，人工业务验收NOT RUN，历史导入NOT REQUIRED。下一步仍是审查独立新目标、真实TLS/file mount/CAM，另行授权部署后人工三卡，不扩大报价范围。
- 恢复：AGENTS → PROJECT_INDEX → CURRENT_STATE → 本文件 → ops README；不得使用旧3002启动流程。合成资源/dump已清理，候选镜像保留；用户未来试用数据不属于可自动清理测试数据。
