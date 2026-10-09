# 当前状态

> 2026-10-09；当前任务：用户已授权的 Windows 独立 Quote Trial 部署。历史证据见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)。

## 目标与工程基线

- 最新已核对合并基线：PR #81，`cc3c450562e692b696024558706954816227cb8a`；运维来源 `1e71d773c2d578029f42267b16999167b393c49f`。报价试用范围锁定（D-098），不增加业务功能。
- 已合并/隔离验收：基础资料、新报价与成本、Revision/PV、Estimate、确认、附件、客户 Excel/ZIP、内部汇总、只读日志。工程测试通过不等于已部署或人工业务验收。
- 延期且不是首轮试用前置：整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理、列表缩略图。

## 旧环境与新试用目标

- 旧 Windows 3001 为 PR #64 / Local Single-User，Q3 masters SERVER、旧 Quote BROWSER；本轮只读 metadata 确认旧 3001 healthy、`preparesystem-server-1` 停止、`zhixu-database` healthy。未连接旧 DB，不能以 main SHA 代替容器版本。
- COS real Node preflight 已 PASS（PR #73 用户证据），不等于 runtime/CAM/secret mount 已验收。
- 新试用目标 **READY**：`zhixu-quote-trial-win01`、`https://localhost:18443`、`D:\zhixu-local-trial\win01`；新 DB `quote_trial`、独立 `_data` 卷/`_default` 网络、分离 COS/TLS 私有卷。Quote/master SERVER、writer writable、identity session，三服务持续 healthy；不采用旧环境的数据或无认证模式。
- 本机 Docker Desktop/Linux engine 与候选不可变 image ID 已核对。新环境授权不涉及旧 Ubuntu、3000/3001/3002、旧 DB/Browser 数据或旧 COS 对象。

## 本轮实际进度与下一步

- 既有准备阶段 A–D 与 PR81 已完成：规则/归档、候选 `zhixu-quote-trial:9ee254db89c6`（source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`）、空库/TLS/session/对象/独立恢复；历史镜像 smoke9/9、启动follow-up CLI11/11、配置/TLS/就绪10/10。精确运行身份/三服务healthy/HTTPS health+build-info才READY，restart拒绝漂移；详细历史见 [操作说明](../ops/quote-trial/README.md)，并非本次真实目标结果。AGENTS网络协议适用，fetch reset根因仍unresolved，不改共享配置。
- 用户本机隐藏输入与 CurrentUser localhost 信任已完成；真实文件 1000:1000/0600/ro、offline loader PASS；用户提供 CAM 策略/直接绑定/私有 Bucket 与无额外宽策略证据，正式 attachments DELETE deny。本轮无 COS DELETE/旧对象接管。
- canonical 新空库 init 0001–0008、ledger current/pending0/integrity valid、start/restart READY 和 Windows HTTPS 正常信任 PASS。初始仅6张技术白名单（ledger、用户/角色/权限/关联）有记录，其余26表全0。显式新管理员 `trial-admin`、受限 `trial-viewer`（只有 quote.view）；密码仅在受限本机目录/用户记忆中，不入 Git/聊天。
- 少量真实新目标 API 验收 PASS：401、可信登录、viewer读取/禁止写入与Estimate隔离、保存读回、正式 COS上传/下载字节SHA、客户Excel/内部汇总解析、日志和静态页、重启/备份后持久化。保留1个 DEPLOY-VERIFY 品牌/业务员/Quote/附件，1 Revision/PV；全局设置/制造预设/面辅料/订单仍0。仅修本地汇总验收的一PV行数假设，未重复创建/上传。
- 首备份 `zhixu-20261009T053144Z-2e1cc761.dump`，117420 bytes，SHA256 `ca699208efc0feacd4cf747f75be5aa7c97ab8a123c19d81d6d08cc4588d62ca`；archive/hash和1个 DB-owned 对象备份 PASS。日常备份入口暴露的固定bundle路径已修为显式配置，失败产物保留并完成对应对象导出；最终日常 Backup/Start/Status/Restart/Logs 实际验证 PASS，恢复READY，无restore/数据清理。
- 本次适配定向14/14、lint/diff-check PASS；候选/应用未改，不重复旧全业务suite。独立Chrome控制因 request-header policy不可加载两次失败，自动浏览器验收未完成；人工三卡 **NOT RUN**。下一步用户访问新入口做 [三张卡](../ops/quote-trial/README.md)，不是新的历史迁移Gate。
- 运维快照与日常入口保存在新受限目录，电脑重启后先启动 Docker Desktop。Git checkpoint push Connection reset，本地部署与远端交付分开；本地提交继续保留，远端/PR交付待核实，不自动merge。

## 永久边界

- D-096：全部业务数据从空开始，历史导入 **NOT REQUIRED**；不导入不是删除授权。
- D-097：默认 Browser 不变，显式 Server authority；不回退旧数据。新 Revision 历史不可变、权限/CAS/事务/审计继续生效。
- 试用范围锁定不是 migration freeze；不暂停旧环境编辑。远程必须 session/真实权限与 HTTPS，不使用 Local Single-User。
- 本轮真实部署已授权，仅上述新 Windows 目标及其新 DB-owned COS 对象；秘密不入 Git/聊天。用户后续试用数据不得自动清理，COS DELETE 禁止；停在缺少输入/信任/权限证据时保护现场。
