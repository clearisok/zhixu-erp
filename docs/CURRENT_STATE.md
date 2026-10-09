# 当前状态

> 2026-10-09；当前任务：用户已授权的 Windows 独立 Quote Trial 部署。历史证据见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)。

## 目标与工程基线

- 最新已核对合并基线：PR #81，`cc3c450562e692b696024558706954816227cb8a`；运维来源 `1e71d773c2d578029f42267b16999167b393c49f`。报价试用范围锁定（D-098），不增加业务功能。
- 已合并/隔离验收：基础资料、新报价与成本、Revision/PV、Estimate、确认、附件、客户 Excel/ZIP、内部汇总、只读日志。工程测试通过不等于已部署或人工业务验收。
- 延期且不是首轮试用前置：整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理、列表缩略图。

## 旧环境与新试用目标

- 旧 Windows 3001 为 PR #64 / Local Single-User，Q3 masters SERVER、旧 Quote BROWSER；本轮只读 metadata 确认旧 3001 healthy、`preparesystem-server-1` 停止、`zhixu-database` healthy。未连接旧 DB，不能以 main SHA 代替容器版本。
- COS real Node preflight 已 PASS（PR #73 用户证据），不等于 runtime/CAM/secret mount 已验收。
- 新目标固定为 `zhixu-quote-trial-win01`、`https://localhost:18443`、`D:\zhixu-local-trial\win01`；新 DB `quote_trial`、独立 `_data` 卷与 `_default` 网络。目录/证书/运维快照已建立，**尚未创建该目标 Docker 资源或初始化 DB**。
- 本机 Docker Desktop/Linux engine 与候选不可变 image ID 已核对。新环境授权不涉及旧 Ubuntu、3000/3001/3002、旧 DB/Browser 数据或旧 COS 对象。

## 本轮实际进度与下一步

- 既有准备阶段 A–D 与 PR81 已完成：规则/归档、候选 `zhixu-quote-trial:9ee254db89c6`（source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`）、空库/TLS/session/对象/独立恢复；历史镜像 smoke9/9、启动follow-up CLI11/11、配置/TLS/就绪10/10。精确运行身份/三服务healthy/HTTPS health+build-info才READY，restart拒绝漂移；详细历史见 [操作说明](../ops/quote-trial/README.md)，并非本次真实目标结果。AGENTS网络协议适用，fetch reset根因仍unresolved，不改共享配置。
- Windows 隐藏输入适配已准备：保护 ACL、独占写入、不回显、无网络/DB；定向包装 6/6、假凭据 Linux 1000:1000/0600/只读及 canonical offline loader 1/1，既有配置 6/6；lint/diff-check PASS。仅删除了这些测试自己持有的假值临时目录/卷，无真实数据清理。候选未重建。
- 当前 **WAITING_FOR_USER_INPUT**：运行新目录中的 `windows-setup.ps1`，一次确认仅 CurrentUser 的 localhost 证书信任并隐藏输入密钥/新账号密码；补充 CAM 绑定、私有 Bucket、无额外宽权限的非敏感确认。策略内容符合正式附件禁止删除的要求；账号详情不能代替绑定/公开访问证据。
- 此后继续同一目标 canonical check/init/start、真实新附件/重启/首备份，不再询问同义部署授权。当前无真实 COS 调用/DB 初始化；实际 CLI READY、真实挂载/账号/附件/备份均 **NOT RUN**；人工三卡 **NOT RUN**。不把离线 CHECK_ONLY 写成 READY。

## 永久边界

- D-096：全部业务数据从空开始，历史导入 **NOT REQUIRED**；不导入不是删除授权。
- D-097：默认 Browser 不变，显式 Server authority；不回退旧数据。新 Revision 历史不可变、权限/CAS/事务/审计继续生效。
- 试用范围锁定不是 migration freeze；不暂停旧环境编辑。远程必须 session/真实权限与 HTTPS，不使用 Local Single-User。
- 本轮真实部署已授权，仅上述新 Windows 目标及其新 DB-owned COS 对象；秘密不入 Git/聊天。用户后续试用数据不得自动清理，COS DELETE 禁止；停在缺少输入/信任/权限证据时保护现场。
