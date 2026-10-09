# AI 接力棒

## Windows 独立 Quote Trial — WAITING_FOR_USER_INPUT（2026-10-09）

- 用户已授权真实新本机部署，见当前任务附件与 [操作说明](../ops/quote-trial/README.md)。branch `ops/deploy-quote-trial-windows`，起始 clean HEAD/main `cc3c450562e692b696024558706954816227cb8a`（PR81 merged）。本次 fetch 成功；不重做 PR81、不再询问部署/新库初始化授权。
- app source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`，镜像 `zhixu-quote-trial:9ee254db89c6` / `sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57`，build `quote-trial-20261009` / `2026-10-09T03:00:00Z`；ops source `1e71d773c2d578029f42267b16999167b393c49f`。均已核对；不重贴标签。PR81 原 10/10、11/11 及早期业务证据是历史结果，不是此次重跑；此前阶段 A `d1ae6c3`、B `0659fa4`、C `9ee254d`/`532b1c5`、D `244e514` 保留在 Git 与操作说明。
- 唯一 target 清单 `D:\zhixu-local-trial\win01\target.json`：project `zhixu-quote-trial-win01`、HTTPS18443/localhost、DB quote_trial、独立 `_data`/`_default`/`_secrets`/`_tls`。Docker context desktop-linux 本机 npipe 已核对；新目标原不存在。受限目录、固定 ops/Backup/guard 快照及文件 SHA、仅 localhost 证书已生成；**未创建新 Docker 卷/网络/容器，未初始化 DB，未调用 COS**。
- 待用户唯一秘密/信任步骤：本机 `pwsh -NoProfile -File D:\zhixu-local-trial\win01\tools\ops\quote-trial\windows-setup.ps1`。显示公开证书 SHA256/到期日，仅明确输入 `TRUST LOCALHOST` 后添加 CurrentUser Root，不动 LocalMachine；之后 SecretId/Key、全新 trial-admin/trial-viewer 密码隐藏输入。不读取生成的 trial.conf/秘密到模型；只核对 inputs-ready.json 与文件存在/ACL。失败不覆盖，保护现场。
- CAM JSON 内容已给定（既有 Hong Kong bucket；attachments PUT/HEAD/GET allow、DELETE deny，preflight 范围另有权限但本轮从不 DELETE）。用户仅提供 weaveops-cos 账号详情；仍待确认实际策略绑定、Bucket 无公开/匿名读、账号无额外宽权限。不得假报 CAM PASS，不扫描 Bucket、不跑带 DELETE 的 preflight。
- 此次实测：Windows 包装/ACL/不覆盖/无回显/证书 6/6；假值独立 Linux 卷/1000:1000/0600/只读/canonical offline loader 1/1，清理自己测试资源 PASS；既有配置 6/6；固定 ops 使用假值配置 CHECK_ONLY PASS；lint/diff-check PASS。未跑旧 integration harness，未改应用/镜像，未重跑无关业务 suite。
- 用户完成后原目标续做：复核输入 receipt/ACL/公开证书信任和 target 快照；仅指定新文件导入两个自有 Linux-owned 卷，actual canonical offline checker（network none）、非 root1000/0600/ro，gateway 不可读取 COS；canonical CLI check→显式 init 新空schema0001–0008→start READY→status；先记录6张技术白名单/其余26表0，再参数化新 restricted quote.view 账号、少量 DEPLOY-VERIFY 正式 API/新附件 COS字节SHA/客户与内部文件/日志→CLI restart保持→精确目标首备份+DB引用对象备份→恢复READY并保留。不得 down/restore/cleanup 新真实目标，不自动重试不确定写入。
- 旧 metadata：3001 `zhixu-q3-local-single-user-ui-20261004t160656z` healthy，3002 `preparesystem-server-1` stopped，`zhixu-database` healthy。从未连接旧 DB/旧 Browser/Ubuntu/COS；后续只做必要只读对照。新用户试用数据是真实数据，不是可清理 fixture。人工三卡 NOT RUN，历史导入 NOT REQUIRED。
- Git：保存本次适配和恢复点 checkpoint/push；最终部署后再收口一个 PR，不提前宣称 READY。遵守 AGENTS 网络协议，不 force/rebase/改共享设置。
