# AI 接力棒

## Active — Quote Trial UI Usability Repair (2026-10-09)

- Branch `fix/quote-trial-ui-usability`，base `cc3c450562e692b696024558706954816227cb8a` / clean。独立于 PR #82 Windows 运维交付。
- 用户确认密码问题已解决、已登录并打开真实页面；完整三张业务卡仍未确认通过。真实 `https://localhost:18443` 继续运行原 `9ee254d…` 镜像，本任务不访问试用 DB/COS/credentials，不替换运行环境。
- 本轮修复：Server 列表紧凑工具区、9 列默认组合与显式恢复默认（已有偏好不清空）；可选 readable DataTable 像素下限、表内横向滚动及 sticky 操作列。默认共享表格保持 fit-first。
- 新建页紧凑类型面板；POST/类型初始化 PUT 与失败保留 ID 不变。详情正常技术说明移入诊断入口，真实错误/冻结/校验保留；成本不折叠。退出按钮脱离文档流，修复额外页面滚动；sticky observer 在资料就绪后绑定 workspace，并纠正 expanded sidebar 左边界。Server 未接通转订单仍禁用。
- 已执行业务 Chromium 61/61（合成 PG/tmpfs、临时 profile、memory storage；附件下载 bytes/SHA、加工/经销、CAS/成本同步/Revision/PV/Estimate 权限/导出保留）、auth/persistence 67/67、共享表格实际 SSR 2/2、npm test 674/674；typecheck/lint/Server build PASS。Server/default Browser frontend PASS，默认 build-info 为 browser/browser/writable/session。视觉 capture 1/1 PASS：40 组配对图、额外全列/Portal/数值成本图，已打开图片复核；document 无横向/重复页面滚动，1280 首屏基础输入可用，cleanup PASS。
- 同尺寸 before/after 合成截图与 DOM 在仓库外 `C:\Users\Administrator\.codex\tmp\quote-trial-ui-visual`；1920×1080、1440×900、1280×800、900×800，100% 缩放。默认 Browser 与真实旧环境不变；历史导入 NOT REQUIRED。
- 本地工程 commit `878de323d618b25fca1f51ccf3f024e932641742`。新候选 `zhixu-quote-trial-ui:878de323d618`，image ID `sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4`；build ID `quote-trial-ui-20261009`、full source SHA 为上述工程 commit、server/server/writable/session。实际 Dockerfile 构建及 network-none 临时容器 build-info/labels 核对 PASS；真实 18443 未部署更新。
- 该工程 checkpoint push 一次后 Connection reset；随后唯一只读 GitHub API 核实 branch 返回 404（Branch not found），REMOTE DELIVERY BLOCKED，未创建 PR、不冒称已送达。本地独立候选继续完成，随后 docs-only 记录不改变镜像内应用。恢复只需人工 `git push -u origin fix/quote-trial-ui-usability`，核对 local/remote/clean 后创建唯一 UI PR；再另行授权真实应用更新，不重复 setup/init、不接真实试用数据。

## Historical / superseded task — PR #81 startup follow-up

## Quote Trial Release Preparation — PR #81 startup follow-up (2026-10-09)

- 同一branch `feat/quote-trial-release-preparation`，本次baseline `244e5143ffc6eda15a031dfe8f90acbdbe5240d0` / clean；不重做A/B/C/D，不创建新PR。原base `d25aac7aa19a90ac1c1f573fbb60e420b7899e98`。
- 已完成阶段保留：A `d1ae6c3`、B `0659fa4`、C runtime `9ee254d`、C isolated `532b1c5`、D `244e514`。原历史归档见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)，本任务范围与三张卡见 [操作说明](../ops/quote-trial/README.md)。
- 镜像仍为 `zhixu-quote-trial:9ee254db89c6`，应用source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`，image ID `sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57`，server/server/writable/session。新ops commit不冒称镜像已重建；应用/Dockerfile/构建输入未变。
- 本次已修复：gateway覆盖错误local3000探针，可信8443 TLS+上游health；start/restart先COMMAND_SUBMITTED，精确容器镜像/私有配置指纹、三服务healthy、HTTPS DB-ready和build-info一致才READY。restart漂移在重启前拒绝，不自动升级；status仅安全运行事实。失败不迁移/恢复/清理/自动回滚。
- 本次最终验证：配置/TLS/就绪10/10；实际候选CLI与完整smoke/独立恢复11/11（未初始化拒绝、正常start/restart、配置/候选漂移、代理/TLS故障、有界非零安全输出、无额外业务写、持续网关health、Quote/history/Estimate/admin/附件字节保持）；cleanup、typecheck、lint、diff-check PASS。
- 此前工程结果（本次未重复）：原镜像smoke9/9、Git6/6、SDK8/8、credentials4/4、MinIO2/2、auth/frontend66/66、npm674/674、Server/两种frontend build PASS，默认browser/browser/writable。不得将其写成本次重跑。未重跑无关Chromium、历史迁移或真实COS。
- AGENTS新网络恢复协议继续适用；fetch reset根因unresolved，不修改共享Git/代理/TLS配置。交付以实际local/remote/PR head核对为准，不预写自身最终SHA。
- 真实Ubuntu/3000/3001/3002/DB/Browser/COS/keys未操作；真实部署NOT EXECUTED，人工业务验收NOT RUN，历史导入NOT REQUIRED。下一步仍是审查独立新目标、真实TLS/file mount/CAM，另行授权部署后人工三卡，不扩大报价范围。
- 恢复：AGENTS → PROJECT_INDEX → CURRENT_STATE → 本文件 → ops README；不得使用旧3002启动流程。合成资源/dump已清理，候选镜像保留；用户未来试用数据不属于可自动清理测试数据。
