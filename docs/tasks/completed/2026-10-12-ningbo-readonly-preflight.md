# 宁波环境只读预检与 PR #97 合并记录

核实日期：2026-10-12 15:32–15:43（Asia/Shanghai）；main：5215ef75510e4b55ef69b1ae1508816b80fda110。仓库：clearisok/zhixu-erp。GitHub 是实时工程事实源；本文是有范围限制的现场快照。后续入口、镜像、schema、账号、备份或 Source 变化时，新增观察记录并更新 CURRENT_STATE，保留本文。

## 结论

PR #97 已按用户本轮明确指令合并；六角色功能已入 main，**宁波尚未上线该功能**。宁波主机可访问、现有两组容器健康且数据库隔离，但公网入口未验证成功，旧 Server 没有登录用户，schema 落后四个 migration。当前结论为 **只读预检完成，真实发布 NO-GO**。下一步是补齐可复验的宁波发布候选和隔离演练，不是继续扩大 ERP 功能或重设计 UI。

完整执行顺序、责任和回退见[上线方案](../../ops/ningbo-rollout-plan.md)。脱敏机器清单见[evidence JSON](../active/evidence/ningbo-readonly-preflight/observations.json)。

## 已确认事实：GitHub 与本次权限范围

- PR：https://github.com/clearisok/zhixu-erp/pull/97；交付 head 95eca129a666fd9ea22f27052340ba5f42730e30；原 base 01694d723cd7b65fcc20e3e79941fef0d57439fc。
- 合并前 release-baseline 与 team-access 两项 CI 均 SUCCESS、mergeable/clean；对应 workflow runs 38215740005、38215740124。GitHub merge 返回 merged=true，merge commit 5215ef75510e4b55ef69b1ae1508816b80fda110；本地 fetch 后核对同一对象与父提交。保留 merge ancestry，便于追溯冻结证据。
- 本次仅合并 #97；不授权后续 PR 自动合并。新文档分支 chore/ningbo-readonly-preflight 从此 main、clean baseline 建立。
- 用户允许 SSH 只读预检；未创建/重置真实账号，未执行 migration/bootstrap/seed/restore，未构建、拉取、重启或部署真实容器，未改 Tunnel/DNS/18443/18444。
- 只读 SQL 使用 BEGIN READ ONLY、5 秒 statement_timeout、SELECT 聚合与 ROLLBACK。未读取账号名称、密码 hash、session、业务正文或附件；未输出 env 秘密、Tunnel token 或凭据。
- 不启动最新应用来“试一下”：server/startup.ts 在检查 migration 后会同步权限目录，并可能 bootstrap 管理员，不能作为真实环境只读探针。

## 已确认事实：现有部署

| 项目 | 旧业务系统 | 旧 Server staging |
| --- | --- | --- |
| 容器 | zhixu-factory-system | zhixu-staging-server-1 |
| Compose project | zhixu-prod | zhixu-staging |
| 源码 SHA | f0c252b52b6a626037e8ba70cf51d0e976e45447 | 7cd43b6142800bb61827410395c4a2d7a9856bc5 |
| 镜像 tag | zhixu-factory-system:local | zhixu-server:staging-7cd43b614280 |
| 镜像 ID | sha256:582b584cb623531d5e9da565c9c0f8f950cec1166b561512d732667340e08f44 | sha256:b8559139d6ac7ae464c6970a0e93a1773f73d3cfd6526b1b98443337702f6578 |
| 本机端口 | 127.0.0.1:3000 | 127.0.0.1:3002 |
| 数据库 | zhixu-database / zhixu | zhixu-staging-database-1 / zhixu_staging |
| 持久卷 | zhixu-prod_zhixu_data | zhixu-staging_postgres_data |
| 网络 | zhixu-prod_default | zhixu-staging_backend、zhixu-staging_edge |
| 实测健康 | /api/health 200、database ready | /api/v1/health 200、database ready |
| 账号数（仅合计） | 1 | 0 |
| 报价/订单数（所列主表） | quotes=0、orders=0、schedules=0 | quote_center_quotes=0、sales_orders=0 |

两个 PostgreSQL 均为 16.15，未向宿主发布 5432；不同网络/卷说明本次观察的两个 DB 不共用持久化。表计数为零不证明所有业务数据为空，更不授权删除。旧业务应用另有一个挂载到 PGDATA 的匿名卷，其实际用途未验证，禁止顺手清理。

staging 的 compose 位于 /opt/zhixu/staging/compose.yml，私密配置位于 /etc/zhixu/staging/staging.env；source checkout HEAD 与镜像/build-info 的 7cd43b…一致。旧业务 compose 来自 actions-runner 工作目录，配置位于 /etc/zhixu/production.env。保留两套历史配置，不覆盖重用。

主机观察：Ubuntu 26.04.1 LTS、Docker 29.8.1、根盘可用约 195 GiB、内存可用约 13.3 GiB；资源暂未显示首批小团队的明显容量阻断。这不是压测或可用性保证。SSH 可连，sudo -n 不可用；后续需要提权的 Tunnel/系统文件变更必须采用单独授权的操作路径。

## 已确认事实：schema、权限和存储

staging 的 schema_migrations 为 0001–0007；逐项 filename/SHA256 与 main 中 Git blob 的 LF 字节一致。main 为 0001–0011，差额为：

- 0008_quote_attachments.sql
- 0009_sales_order_delivery_plans.sql
- 0010_quote_creation_receipts.sql
- 0011_quote_creation_defaults.sql

这证明已应用部分未发生已知 checksum 漂移；不是对旧库全部约束、扩展或数据一致性的证明。没有执行迁移。旧 legacy 数据库没有这个 migration ledger，不可把其表模型当作新版 Quote Center。

staging 的 app_users=0、app_roles=0、app_permissions=54；不存在可供六角色使用的登录账号。权限与角色目录须由新版本按受控流程初始化，不能复制旧账号或直接改表造角色。PR97 无新增 migration；其账号功能仍依赖新运行镜像、完整 schema 和可信 session。

staging 应用没有对象存储 credential 文件挂载；只观察到旧 DB/Origin/Cookie/构建环境键，未发现当前显式 Quote/master authority、identity、附件 storage 配置。旧前端 authority 未逐字节确认，不把键缺失推断成确定的 Browser/Server 模式。当前镜像及缺少 0008 的 schema 足以证明它不是最新附件/六角色发布候选。

## 已确认事实与待确认：公网入口

Cloudflared 服务 active/running；本机未见 Nginx/Caddy，服务使用 token-file 模式，/etc/cloudflared/token 为 0600，未读取内容。本机没有发现本地 ingress config。读取现有 journal 未找到可提取的最新远程 ingress 记录，不能由此声称远程配置不存在。

2026-10-12 07:39–07:41 UTC：
- 宁波发起正常 HTTPS 和进程内无代理 HTTPS 对 staging.weaveops.top/build-info.json，均得到 Cloudflare 响应头的 403；/api/v1/health、/api/v1/auth/me 亦为 403。
- Windows 独立请求 build-info.json 得到 Cloudflare 502。
- TLS 验证保持开启，无证书错误；未单独盘点证书到期日。
- localhost 两套 build-info 与 health 正常，新 Server auth/me 未登录为 401。

因此可以确认公网路径不能通过本次自动请求完成验收；**不能确认域名实际映射 3000 还是 3002，也不能确认 403/502 的根因**。候选原因包括远程 ingress、Tunnel origin 连通性或访问策略；不同探测结果不可合并写成单一已知原因。下一步只读核对 Cloudflare Public Hostname 的 service/Origin 设置、Access/WAF 请求事件和 Tunnel 健康，不关闭策略来消除错误，不要求导出 token。Origin 环境键等于域名，不是路由正确的证据。

## 已确认事实与限制：备份、部署流程

zhixu-staging-backup.timer 每日调度；最近执行 2026-10-11 19:15:04 UTC，service Result=success、exit=0。脚本 /usr/local/sbin/zhixu-staging-backup 使用 pg_dump、自定义格式目录检查（pg_restore --list）和 SHA256。/data/backups/zhixu-staging 最新 dump 为 zhixu_staging_20261011T191504Z.dump，102960 bytes、0600，并有 .sha256/.meta.txt；本次仅看元数据，没有复制/读取 dump，也没有重新执行备份或恢复。

这不是独立恢复成功证据，也未验证异地副本、保留策略、告警送达、附件对象备份。旧 DB 的备份任务不会自动保护新项目/新卷/新附件。

main 的 .github/workflows/deploy-production.yml 仅 workflow_dispatch，仍针对 zhixu-prod + 根 Dockerfile/docker-compose.yml + legacy /api/health。它不能当作 Dockerfile.server 的新版六角色发布流程。merge PR97 没有执行此部署。

## 用户决定、AI 建议、待确认问题

**用户决定**：宁波外网首批六角色；授权艾诺科来源团队全可见、织序金额分角色；由管理员私下创建真实账号；18443/18444 内容不要求保留迁移，但此次没有删除；遵循 D-096/D-098 空新账本和 Quote-first。保持 UI，不开放 Order/Material/Production/Closing 生产路由。

**AI 建议**：新建独立 Ningbo release candidate，优先收口公网入口、正确镜像/authority、独立账本/私密管理员、附件及恢复演练。现有空主表并不足以授权原地改旧 staging。新候选通过后单独授权切入口；旧服务和数据保留。

**待确认**：Cloudflare 实际路由/策略；宁波旧数据保留周期；新对象存储隔离与最小权限配置；首次启用窗口、管理员私密配置及负责人。真实名单不是工程前置，Source 密码不在聊天/GitHub 提供。

## 证据路径和复验方法

现场：docker ps/inspect allowlist、build-info/health 匿名 GET、ss -ltn、os-release/df/free、systemctl show/list-timers、受限 SQL 元数据与 COUNT、备份 stat。代码：Dockerfile.server、docker-compose.yml、.github/workflows/deploy-production.yml、server/startup.ts、server/db/migration-runner.ts、server/config.ts、server/attachments/storage-config-loader.ts、ops/quote-trial/compose.yml、ops/quote-trial/trial.mjs、database/migrations/。

迁移 hash 对比取 git show 5215ef7…:database/migrations/<file> 的原始字节，未使用 Windows CRLF 工作副本冒充 canonical checksum。本机现场输出仅形成下方脱敏 JSON，不提交 token/env/backup/raw trace。后续重新观察必须记录新的时间、目标和结果。
