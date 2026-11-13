# 艾诺科同步记录与暂停恢复：本机工程交付

2026-11-13。本轮只开发和自动验证，不部署staging/生产，不要求实机演示。分支 `feat/ainuoke-sync-audit`；起始main/源码证据基线 `c5133e9e9e7065dc4fe7672c0c88c75688e0c51f`；最终产品代码 `3d2a3737765d02eae5586e8edff40e27df166acf`（其后交付文档提交不改变产品）。先前开发过程及失败日志说明完整保留于[开发归档](../completed/2026-11-12-before-sync-audit/development-notes.md)。

## 已完成结果

- 新菜单：系统设置 → 艾诺科同步记录，路由 `/system-settings/ainuoke-sync-records`。按报表记录/批次查看，支持北京时间日期、名称/ID、状态、类型、批次、合同及已有工厂款号筛选、分页、表历史、详情与Excel三工作表导出。概览使用真实数据库记录；待补齐业务条数缺证据时保留未知，不以任务数替代。
- 原服务端会话、fresh RBAC要求 `ainuoke.view` + `audit_log.view`；匿名401、普通只读角色403，审计API仅GET。没有增加业务修改或删除审计入口。
- 新增迁移0058，仅4张审计表：`ainuoke_sync_audit_batches`、`ainuoke_sync_audit_tables`、`ainuoke_sync_audit_record_state`、`ainuoke_sync_audit_events`。分别保存批次、报表/合同子记录、稳定记录内容指纹、不可变事件。索引覆盖时间、状态、类型、报表和关联键。业务表、订单身份和数量规则不重建。
- 已接通现有目录、自动worker各档、手动、任务重试、绑定/新增接纳、单单/分组/有界刷新、历史物料发布、旧scheduler、货款与成衣出货路径。每次尝试独立，原任务事务内关联，业务COMMIT确认后才确认写入时点。回滚、丢失提交回执、未发布结果不会显示完整成功。
- 源端更新时间、真实请求读取时间和数据库提交确认时间分开；不能取得的字段为不可获取。新增/更新/未变化按稳定源记录与内容版本统计，目录绑定另按实际选定投影计数；不把不可变快照INSERT数、双遍行数、采购数量混为同一指标。
- 认证owner和跨单复用、R分档、人工暂停、原匹配/单位规则保持。新传输元数据白名单不含URL凭据、正文、JWT、Cookie或密码。
- 历史台账维护入口默认预览，最多100批/次、游标恢复；先有界选键再聚合证据，不扫描全部历史重型JSON。仅显式capture/request/publication关联，0源请求/0业务写入，重复补录幂等。真实库尚未执行补录。

## 完整来源清单

已登记11个真实报表ID：6086103销售合同，6086997旧颜色尺码，6087105分色分码，6087050旧物料联合报表，6087051物料申购统计-IT，6086405/6086408采购单位核对，6086875/6086354入库单位核对，6086941货款申请，6086979成衣出货。

6087051的需求、采购、入库、出库、物料出运属于同一联合源报表，不伪造五张独立源表。6080183为systemId；没有证据的独立海外应收/外协加工接口未加入。源站SQL物理表名不可获取。映射、字段、时间/计数语义、维护方式见[长期说明](../../features/AINUOKE_SYNC_AUDIT.md)。运行中新的已验证reportId会自动留记录，不能绕过原来源校验。

## 暂停根因及修复边界

只读既有staging失败capture `7d0169d0-e8cd-410d-b93e-5ee4262bbea6`：2026-11-11北京时间15:52:23.933–15:52:34.391，54请求全部complete，目录13页各两遍；621合同身份/范围相同，无新增/删除/身份变化，仅 `hsid` 变化。原复合码 `catalog_changed_or_over_limit` 触发全局暂停且retry_at为空。该证据没有证明密码、会话、网络或超限问题；hsid业务含义未知。

新错误分类区分超限、身份/范围与非身份内容变化；后者仅允许有限重新取得完整稳定双遍，绝不接受正在变化的数据。原1/5分钟总3次短退避后，按原30分钟目录周期冷却复核。旧hsid-only回执只有完整分页及严格身份/范围证据全部满足才可恢复。管理员enabled=false、认证、权限、证书、身份/范围及未知结果不自动解除。单合同/单表失败保留部分失败，独立任务可继续。原物料页提示按真实暂停类别和退避时间显示，不把临时冷却描述为永久停用。

本轮未清除真实staging暂停，未启用真实worker；因此“代码已修复并验证”不等于线上已恢复。

## 自动化验收

以下为不同测试组，存在覆盖重叠，不相加宣称唯一测试总数。所有结果均0失败/0跳过。

| 验证 | 结果 | 本机原始日志 |
|---|---|---|
|同步/认证传输/货款/成衣/回滚等回归|108/108 PASS|outputs/sync-audit-final-regression-25.log|
|目录/审计/绑定刷新与旧schema升级|41/41 PASS|outputs/sync-audit-final-core-22.log|
|旧分组及selected-source入口|33/33 PASS|outputs/sync-audit-old-entry-32.log|
|历史有界补录、持久化与实际HTTP服务重启|9/9 PASS|outputs/sync-audit-bounded-history-30.log|
|最终有界刷新入口回归|4/4 PASS|outputs/sync-audit-final-bounded-33.log|
|真实构建前端Chromium，1366/1920、筛选/详情/权限|3/3 PASS|outputs/sync-audit-browser-27.log|
|发布基线负向和响应式测试|182/182 PASS|outputs/sync-audit-baseline-tests-26.log|
|源码证据守卫，基线M|PASS，13页面/68能力/8 UI路径|outputs/sync-audit-final-baseline-34.log（检查文档候选b23923f5；本段回执补记不改产品或冻结证据）|
|Python请求诊断|13 PASS|outputs/sync-audit-python-diagnostics-01.log，代码后续未变|
|根TS、服务端编译、全量Lint|PASS|outputs/sync-audit-typecheck-32.log、sync-audit-server-build-32.log、sync-audit-lint-32.log|
|显式Server authority前端生产构建|PASS，UI产品a3b9f81c|outputs/sync-audit-build-27.log|

覆盖多表独立记录、真实读取/提交分离、HTTP200/isOk=false、部分成功、无效稳定身份未知计数、同批多次发布不重复统计、事务回滚、提交ACK丢失、中断恢复、独立重试、手动和自动任务、Excel解析、无越权及旧数据不变。浏览器使用自有临时PG和合成SDK传输，访问真实HTTP/session和构建页面；不冒称新源站采集实测。

初期失败/取消日志保留在outputs：旧fixture/复合错误码断言、测试Pool接口、SQL类型、关闭服务后旧keepalive连接及未冻结证据均已处理，以上后续对应组通过；不把初期失败日志重新标PASS。

## 真实记录示例

[只读真实历史成功/失败证据](ainuoke-sync-audit-real-example-2026-11-12.md)：目录请求 `b9156598-a466-4c16-bbb2-1e0d67c6f20d`，2026-11-11 15:37:41.989732–15:37:45.566850北京时间，13页双遍、620合同、实际1240读取行、26报表/0登录。旧库未记录精确提交确认时刻及逻辑增改计数，明确不可获取。不是本轮新增0058台账示例，不为补齐展示而重新采集。

## 运行、版本与部署条件

现有63054/63051业务进程及数据库未切换到本候选，617历史数据与人工记录未改。本轮没有新增艾诺科登录或报表，不部署、不合并。新菜单代码已完成，但不能声称当前旧演示地址已启用新台账。

本地工程门禁通过，可进入staging发布准备；尚须单独批准部署，先用staging自身备份/恢复准备，迁移0058，重建同一最终版本，核对单认证owner与任务位置，受控替换worker，验证真实新审计和恢复结果。缺0058时新采集fail closed且0源请求，不能跳迁移启用；不自动解除认证/人工停用。历史补录另走默认预览的维护入口，缺失旧时间/计数不补造。

main/staging最近只读核实仍为 `c5133e9e9e7065dc4fe7672c0c88c75688e0c51f`（PR145）；旧暂停/worker停用保留。远端候选送达及PR以最终交付回执为准，不能从本地测试推断。上一轮运行/备份/恢复位置见[旧发布记录](material-staging-release-2026-11-12.md)。

核心修改：server/ainuoke-source/sync-audit.ts、audit-query.ts、audit-routes.ts、audit-backfill.ts、audit-sources.ts、sync-recovery.ts及现有入口，Python安全诊断，database/migrations/0058，features/ainuoke-sync-audit和系统设置菜单。完整文件与提交由分支diff保留。

## 最终远端交付回执

2026-11-13仓库标准工具Dry Run：READY_DRY_RUN，Git只读预检exit128/uncertain_transport（2499ms），独立API通过（1685ms），networkMode=NETWORK_DEGRADED。实际pushes=0，没有创建PR/运行CI，没有重试该Git通道。所有产品代码与本地门禁保留；远端未送达不能写REMOTE PASS。最终文档补记仅记录此事实，不改已通过的产品/冻结证据。恢复时使用标准git-delivery工具和当时完整HEAD，不能换认证或强推；最终用户回执提供精确单条命令。
