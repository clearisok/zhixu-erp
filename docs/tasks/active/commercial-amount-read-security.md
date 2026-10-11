# 商业金额读取安全修复 — 2026-10-11

## 最终价格展示权限收口（2026-10-11）

本轮 clean local/origin/PR93 基线 `5185d776e54bdd3b328d1611d8283f00e16fcd92`，main `fcf36e5eab6c78254f808c1cba38f3a63a66d4f8`；PR92 仍 `03b1078e99ff44ceb875dd0b01a1e22358f4dab6`。用户已正式将测算销售单价与系统最终报价归入 sale.view，以下历史“待确认”不再是当前 blocker。原 PR93 保持 Draft，不修改或合入 PR92。

- QuoteEditor 使用可信 Server Session 的 sale.view，将同一展示授权传给摘要、PV卡片、历史概览；sticky、确认弹窗的系统销售价、最终报价构成同步保护。无权展示“无权查看”，实际数值不进入隐藏 DOM/展示模型；合法内部成本、参数及运算保持，不能声称阻止成本用户自行计算。Browser 消费者默认展示未改，未重排 UI。
- 实际 API 旁路：内部汇总 estimateDifference 原为销售价减估算成本，只校验成本/Estimate。本轮先复现成本-only 收到 XLSX **200**，再补 sale.view；现 **403**，无构建文件或误写审计。普通 estimateTotal 及有权 estimateDifference **200** 保留。列表 garmentPrice 仍 cost.view + sale.view。日志增加已知派生销售字段投影，数据库事实不改写。
- 本轮先复现原 Chromium **8/13 PASS、5 FAIL**（成本-only 派生销售 DOM），修复后最终 Chromium 结果见下；不将先前13/13冒充新政策通过。新增 SSR 首次误命中合法加成工价小数前缀、零格式与实际既有格式不符，抽屉探针误命中合法汇率子串；改为金额完整边界，保留全部安全否定。旧列表SSR确认工价偏好用例补唯一需要的 labor.view，另验证撤权必须过滤；不把所有身份变成管理员。
- 本轮完整 PostgreSQL/HTTP **261/261 PASS，0 skipped**，含四键16组合、CAS/事务回滚、原创建/历史/附件/汇总/文件回归；`npm test` **680/680 PASS**；auth/frontend **90/90 PASS**。额外最终 SSR/列表/布局/HTTP 与 Chromium、质量结果由最终收口补记，不复用历史数字。
- 合成浏览器使用全新 profile、disposable PG、MemoryAttachmentStorage，实际 Quote 构建和原 Order 组件；Order 仍是测试专属 Vite 宿主，未开放生产路由、未验证 #92 合并结果。截图仅本地 `outputs/commercial-security/`。无 schema/migration、真实数据、18443/18444、COS或部署操作。
- 旧完整 unlinked confirmation.save 仍需两套金额 view+edit；linked 单工价 PATCH 正常。Server 角色管理 UI/API 尚未实施；这两项既有边界未借本次展示修复放宽。整体 PR93 与 PR92 仍五处历史交集，后续逐 hunk 整合 executionOnly/P6/物料/UUID 与金额投影/部分PATCH；本轮运行代码/测试增量不碰这五处。

## 最终合并前定向验收（2026-10-11，历史恢复点）

从原工作树 `D:/workspace/zhixu-quote-two-step`、原分支 clean `91d000ffa45f3af0ca7034b67f5a3921fc3b4ab4` 开始；GitHub PR93 与远端同 SHA，OPEN/Draft。main/base `fcf36e5eab6c78254f808c1cba38f3a63a66d4f8`；PR92 最新 `03b1078e99ff44ceb875dd0b01a1e22358f4dab6`，没有合并/修改其分支、工作树或已验收布局。

本次唯一运行代码增量：Order effect cleanup 捕获同一个 epoch ref 对象，继续递增 current 取消陈旧加载，不捕获旧数值、不改变请求时序；消除原 React ref lint 提示。新增实际 Chromium 测试及隔离入口，复用原 QuoteEditor、Order detail、Session/RBAC provider 与 CSS。Quote 使用显式 Server 的正式构建；Order 用测试专属 Vite 路由装载真实组件（Quote-first 正式路由仍关闭），不把测试入口当作生产接线或 #92 executionOnly 验收。

### 本次实际执行的安全/浏览器证据

- 完整 `npm run test:postgres` **260/260 PASS**；`npm test` **679/679 PASS**；auth/frontend **90/90 PASS**，均为本轮重新执行，不沿用上轮结果。
- 最终 Chromium/商业 HTTP/读取面/Quote 成本联合定向 **48/48 PASS**；typecheck、lint（0 errors/0 warnings）、Server build、串行 Server/default Browser frontend build、diff-check PASS。最终默认 build-info 为 browser/browser/writable/session；基于91d000f加本轮增量的普通工作树构建，不是新的不可变候选镜像；既有大于500kB chunk提示保留。
- `npx tsx --test --test-concurrency=1 server/integration/commercial-browser-security.integration.test.mjs` **13/13 PASS**：七种合成 Session 身份（无商业/成本、仅成本、仅 sale、仅 labor、两者、sale 无成本、labor 无成本），DOM/实际 HTTP 响应/浏览器存储精确金额探针、历史只读、字段禁用与实际单字段保存、账号切换/注销、撤权后刷新、1920/1280/390 布局及无页面溢出/未捕获异常。保存提交原值，不改变合成商业金额；只产生隔离库合法版本/审计记录。
- 加工报价实际 HTTP：仅 labor.view+edit 的 linked CCT PATCH **200**，未授权销售价 restricted，旧 Quote 快照保持；旧完整 `confirmation.save` **403** 且无误写审计。
- 初期测试失败如实保留：夹具在持久化后改历史、unlinked PATCH 被保护拒绝；Quote-first 订单路由阻断；字符串探针误命中合法小数；七角色扩展夹具大小写账号导致401。修正隔离夹具/断言/测试入口与规范化账号，未提权负向身份、未跳过安全断言。附件仅注入 MemoryAttachmentStorage，不连接 COS；假图片引用不伪装成可用附件。
- 合成截图由脚本生成至本地 `outputs/commercial-security/`（不包含真实数据，不冒称公开链接）；包括 viewer/cost/sale/labor/both/saleNoCost/laborNoCost 的 Quote 与 Order。只证明本分支现有布局未明显回退，不代表用户人工 UI 验收或 #92 整合后通过。

### 需要确认的展示口径（不擅自更改 D-103）

真实代码及成本用户 Chromium 证实：详情“测算销售单价”和摘要“成衣销售价格”是内部成本/参数推导的 `garmentSellingPrice`，不是客户确认成交价或 CCT current。成本查看者仍能看这一计算值；历史确认销售价/工价、CCT current 已按四键隔离。列表同一 `garmentPrice` 目前同时要求 sale.view 和 cost.view，存在展示口径差异。

待用户确认：把该测算值归入内部成本查看范围，统一列表；或归入 sale.view 保护范围，统一详情/卡片/确认弹窗及派生输入。本轮不自行扩张/缩减政策，也不将其误称为已确认成交价泄露；不能给出无条件“全部商业金额语义已定稿”。PR93 保持 Draft，合并前应确定这一项。

旧 `confirmation.save` 是完整快照，连加工报价也写入测算 quotedGarmentPrice 及确认工价，故现要求两套商业 view+edit。linked CCT PATCH 的单工价途径已通过，不能以放宽 PATCH 权限解决旧命令限制。如需工价用户在未关联 Quote 首次确认，也须先明确完整确认的业务授权或设计仅写允许字段的命令；本轮保留原确认语义，不伪装已支持。

### 后续 #92 整合策略（本轮未执行）

五处交集：`docs/AI_HANDOFF.md`、`docs/CURRENT_STATE.md`、`server/app.ts`、`server/integration/confirmed-commercial-terms.integration.test.ts`、`features/order-center/components/server-sales-order-detail-page.tsx`。

1. app.ts 保留 #92 可选物料 read ports/只读路由 fail-closed/no-store，以及 #93 CCT/日志字段投影与 PATCH；不激活未批准路由。
2. Order 组件保留 #92 executionOnly 不发 CCT 请求、不显示商业编辑，P6/物料摘要/Control Tower/UUID 返回；商业模式采用 #93 envelope、分字段输入和部分 PATCH。合并加载取消时只用一套 generation ref，不整文件 ours/theirs。
3. CCT 测试保留 #92 0011 ledger 断言与 #93 新权限/负向身份；文档人工合并两边事实及历史证据。整合后必须重新验证 executionOnly 与商业模式、字段隔离/撤权/延迟响应，不把当前分支测试当作两 PR 合并测试。

无 schema/migration、真实数据库/账号/COS/18443/18444/部署操作；Server 角色管理 UI/API 仍未实施。**CCT HTTP SECURITY PASS / CHROMIUM DIRECTED ACCEPTANCE PASS；商业测算值口径待确认，Draft 保留，不自动 ready/merge。** 最终增量 SHA/推送状态以 PR93 和最终交付报告为准。

## 2026-10-11 用户批准权限后的首次实施收口（历史）

四键 commercial.sale.view/edit、commercial.labor.view/edit 已按 D-103 实施。可信 Server 管理员 bootstrap/catalog synchronization 幂等授予；其他角色不继承。复用现有 RBAC 表，无 migration。正式 Server 角色管理 UI/API 尚未实现，Browser mock 不能作为授权入口；生产按角色配置仍需后续可信管理能力/受控运维批准，本轮未修改真实角色。

两个 CCT GET/PATCH 返回 commercial-terms-read.v1 独立 allowed/restricted 投影；PATCH 只检查实际提交字段的 view+edit，遗漏值保留事务锁定当前值，null/0、两套 CAS、币种所有权和审计回滚均保留。旧全量请求若含无权字段明确403，旧原始响应被新版客户端拒绝。Quote/Order 只做现有协议适配，未新增第二套当前条款。unlinked Quote confirmation.save 仍是完整快照命令，要求两套商业写权限，不冒充部分 PATCH。

历史 Quote confirmation、列表/内部汇总字段、客户 Excel/ZIP、日志读取均检查新增权限；Quote 内部成本仍由原权限保护。受限基础资料保存从 CAS 基线恢复隐藏切片，不清空金额、附件或历史。客户端账号切换清理和异步响应隔离，缓存不作为授权来源。源数据库审计保留完整事实，读取时投影。

### 本轮最终实跑
- npm run test:postgres：**260/260 PASS，0 skipped**。完整原有 suite 加入四键16组合实际 Session HTTP、跨读取面负向、Quote 成本、linked CCT、内部汇总与导出回归；disposable PG/模拟对象存储，含事务故障注入与回滚。
- auth/frontend：**90/90 PASS**；CCT client/projection：**8/8 PASS**。
- npm test：**679/679 PASS**；typecheck PASS；lint 0 errors、1个 React cleanup ref 警告（Order 加载 epoch 用于取消陈旧结果，不是 DOM ref）。
- Server build → Server frontend → default Browser frontend 串行 PASS；41 routes。默认 build-info browser/browser/writable/session。构建基于720de05加本次工作树代码，不是该旧 SHA 的不可变候选；未构建或部署生产镜像。
- git diff --check PASS；无历史 SQL/migration 改动。
- Chromium：本轮 NOT RUN，不能沿用旧视觉结果；本 Gate 要求的真实 Server HTTP 负向验收已执行。
- 早期失败保留：首轮 PG159/178（19含父测试失败）、附加集24/41、auth89/90，原因是旧 full-reader/editor fixture 未显式授新键和投影预期。仅修正合法身份夹具/响应契约；负向用户未提权、未跳过或删除断言。最终完整260/260覆盖修正。

### PR92 交集与限制
GitHub PR92 head03b1078e99ff44ceb875dd0b01a1e22358f4dab6与本地引用一致。交集为 docs/AI_HANDOFF.md、docs/CURRENT_STATE.md、server/app.ts、server/integration/confirmed-commercial-terms.integration.test.ts、features/order-center/components/server-sales-order-detail-page.tsx。最后一项只适配商业金额 DTO、分字段编辑权限及身份缓存，不改已验收布局/CSS/物料采购展示；没有进入或修改 B 工作树。合并时须保留双方增量，不能整文件覆盖。

CCT SECURITY GATE PASS / 工程验证 PASS，PR93 保持 Draft 等待审查。没有真实 DB/账号/COS/18443/18444 操作，无部署/自动合并。独立 Server 角色管理缺口和实际 Chromium 未运行不能被该结论掩盖。

### 本轮中间接力历史（保留）
## Active — PR93 commercial RBAC continuation (2026-10-11)

Gate4 integration in progress: historical Quote confirmation projection and CAS-preserving omitted-field save, customer exports, independent list fields and audit projection are implemented. CCT clients use an explicit allowed/restricted adapter, reject legacy responses, and submit only editable fields. Minimal Order detail amount protocol adaptation is an additional PR92 changed-file intersection (no B worktree/layout/CSS changes). HTTP read surfaces + existing Quote cost regression **13/13 PASS**; client/projection **8/8 PASS**; npm **679/679 PASS**. First full PostgreSQL run **159/178 PASS, 19 failures** (including parent failures), identifying old full-permission fixtures and projection expectations; corrections are being verified, not declared PASS. Auth/frontend first run **89/90**, list full-reader fixture now explicitly grants new read keys. typecheck/lint PASS before final integration; final reruns pending. No deployment or real data access.

Gate2/3 Server checkpoint: both actual CCT GET/PATCH responses now use the existing independent allowed/restricted projection. Partial PATCH requires submitted fields' view+edit; omitted values come from the locked current row, null/zero and linked currency/CAS/audit rollback preserved. Actual session HTTP matrix **20/20**, prior exposure assertions converted to negative protection plus projection **7/7 PASS**. Client adaptation and aggregate/history/export/log protections remain in progress, so whole CCT SECURITY GATE is not yet declared PASS. Gate1 local97a3f21 push failed with Schannel missing-close-notify; one GitHub read confirmed remote remainsed91bc1. Reliable local work continues under network protocol; no repeated push or shared TLS configuration change.

User-approved four independent commercial sale/labor view/edit permissions. Resumed clean `fix/commercial-amount-read-security` / local and GitHub `ed91bc18596202641ea8497068d4a180f2f200a5`; prior REMOTE PENDING is recovered by the user's push, historical record below retained. Gate1 adds the catalog and idempotent grants to the existing trusted `role-server-admin` during catalog synchronization; new bootstrap already grants the catalog. No other role inherits commercial access. Disposable PG/actual session permission refresh and guarded RBAC regressions **10/10 PASS**. No schema/migration or actual role/database changes. Server role-management UI/API remains absent; Browser management is not an authorization interface. CCT endpoint projection/PATCH and whole read-surface protection are the next gates; not yet SECURITY PASS. Same Draft PR93, no PR92/UI or runtime operations.

## Active — 独立商业金额安全修复 / PR93 Draft / REMOTE PENDING（2026-10-11）

LOCAL ENGINEERING PASS：源码195f6b73e99935b7823c723c8032dfa03c8c139c；TLS两种进程级传输push失败且停止重试，exact remote3b8f3836b2d77f8a20e6c085403c659f41c4cee9。[唯一PR93](https://github.com/clearisok/zhixu-erp/pull/93)已创建Draft，Gate2/3未送达、不建议合并；恢复四条命令见任务报告。A 原工作树干净，从最新 main fcf36e5eab6c78254f808c1cba38f3a63a66d4f8 建立 fix/commercial-amount-read-security。Gate0实际合成 session HTTP4/4复现三路径；现 Quote成本 allowlist+metadata-only保存/日志/no-store已修复，最终定向43/43、PG179/179、npm679/679及typecheck/lint/串行构建通过（CCT投影3项仅独立测试；两条HTTP泄露断言仍证明问题存在），按既有 quote.cost.view，销售价/工价四键（commercial.sale.view/edit、commercial.labor.view/edit）及管理员拥有/其他默认无、独立 PATCH 方案已记录，独立可注入投影默认deny且3/3通过；新权限与角色尚待用户批准，CCT SECURITY PENDING。用户明确 PR92 订单 UI 已人工验收 PASS，仍 Draft；本任务不修改 B 工作树/UI，不合并其代码。真实环境/凭据/数据库/0010/0011不操作。[安全任务报告](commercial-amount-read-security.md)。

## Gate0 baseline 与复现

用户授权独立 Server 安全任务，不合并 PR92、不修改 B 工作树或其认可 UI。原 A 工作树 D:/workspace/zhixu-quote-two-step 的 feat/quote-two-step-creation / HEAD19043f8457c458d60568e479d8238fb1d520bc58 干净，仅落后远端一个提交，无分歧；保留原分支，正常 switch 新分支 fix/commercial-amount-read-security，基线为最新 origin/main fcf36e5eab6c78254f808c1cba38f3a63a66d4f8。

PR91 MERGED，head cf57074185412e323e2f3308bddc2fd3f73be063；PR92 OPEN/Draft，最新 head03b1078e99ff44ceb875dd0b01a1e22358f4dab6。用户本轮明确确认 PR92 订单 UI 于2026-10-11人工验收 PASS；这是用户确认，未重新访问业务环境。PR92 的成本审计只通过 git show 参考，没有合并或改动其文件。

实际 app/service/response/Session/RBAC、Quote Editor/客户端/导出/日志和 D-084/D-087 已审查。现有 projectQuoteResponse 只按 estimate.view 省略 Estimate；缺 quote.cost.view 仍读所有 Revision/PV 成本。两个 CCT GET 只检查 order.view / quote.view。CCT 当前值独立 identity、共享 context、精确 decimal strings/null/zero、版本CAS、可信事务审计不应因安全投影改变。

首次执行 `npx tsx --test --test-concurrency=1 server/integration/commercial-amount-exposure-audit.integration.test.ts`：4/4、0 skipped，实际合成 session HTTP 复现：

| 实际路径 | 已证实问题 | 本轮边界 |
| --- | --- | --- |
| GET /api/v1/quotes/:id | quote.view-only 读取内部工价98765及历史成本 | 依现有 quote.cost.view 修复响应，安全保存缺失保护切片 |
| GET /api/v1/sales-orders/:id/confirmed-commercial-terms | order.view 读销售价12345/工价67890 | 新独立权限政策待批准，SECURITY PENDING |
| GET /api/v1/quotes/:id/revisions/:rid/price-versions/:pid/confirmed-commercial-terms | quote.view 读同一共享金额 | 同上，保留共享事实与原写入契约 |

只有随机 PostgreSQL16/tmpfs/动态 loopback 和合成用户/数据；finally 清理。未读取真实配置、凭据、COS/业务库，不触及18443/18444。
## Gate1 — 既有 Quote 成本权限修复

Quote aggregate 的集中响应使用 allowlist 型 `CostRestrictedQuote`：所有 Revision/PV 仅保留身份、业务基础资料、数量、版本/附件引用及定性确认摘要；完整成本行、工价、费用、制作参数、历史确认金额、派生/未知字段均不返回。顶层 `costVisibility: restricted` / `estimateVisibility: restricted` 明确区分无授权与业务 null/0。有 quote.cost.view 才保持完整 Quote 成本；Estimate 数值还需 estimate.view，不能单靠 Estimate 权限读取内部成本。

普通受限 PUT 使用 metadata-only 契约。Server 先检查可信 quote.edit 与 expectedVersion，然后按当前 DB aggregate 恢复隐藏成本/参数/历史确认/Estimate；normalize/validate、细粒度变更授权、immutable history、repository CAS 与同事务可信审计保持。未知字段、被隐藏成本注入（包括 null/[]）、权限标记、行删除/重排拒绝；缺失字段不作为清空命令。成本编辑权限不隐含成本读取权限。

原完整 Editor 不接收残缺成本 DTO；受限身份只挂载复用 Foundation 的基础资料消费者，支持款号/款名/备注的合法保存，不加载成本计算器/Estimate 或业务缓存。保留原完整授权 Editor 外观；没有改 PR92/UI/CSS。正式加载缓存按 UUID+可信用户+权限集合核对，切换身份/撤权不渲染旧完整记录。服务和客户端均 no-store。

现有列表/客户 Excel/ZIP/内部汇总的权限保持；新增负向 HTTP 覆盖其成本绕过。Quote/Estimate 日志响应对无成本权限者裁剪保护字段，Estimate 事件在 count/paging 前排除；历史审计在 DB 中原样保留。CCT 专用读写/日志政策没有借用 quote.cost.view 重新定义，仍 SECURITY PENDING。

定向统一执行：**42/42，0 skipped**（Quote cost/保存/导出/日志/CAS、实际暴露审计、原 Quote API/日志回归、两组客户端投影，以及独立 CCT 投影3项）。纯核心安全与相关回归39项；CCT3项仅针对未接入端点的投影。首次旧回归失败暴露了完整 fixture 未授既有成本读权限，以及创建-only 旧断言错误预期完整成本；已分别改为有权 full actor 和 restricted/DB-only 保存验证，不给真实角色或普通查看者增加权限。保留原权限否定、历史/CAS/回滚断言。

无 schema/migration/权限目录/默认角色变化，0010/0011未修改；无真实环境操作。Gate3继续执行完整质量及相关 PostgreSQL 回归。
## Gate2 — 待用户批准的最小独立销售价/工价方案

以下是方案，不是 Active 新权限政策。未新增目录键、角色默认授权、配置 API、migration 或 CCT route/service 写入变更。

| 业务字段 | 建议查看键 | 建议修改键 | 与现有权限关系 |
| --- | --- | --- | --- |
| 共享确认销售价（CNY/件） | commercial.sale.view | commercial.sale.edit | 不能从 quote.cost.view/edit、quote.confirm 或 order.edit 推定 |
| 共享确认工价及币种 | commercial.labor.view | commercial.labor.edit | 不等于 Quote 内部成本 labor.value；不能由内部成本权限推定 |
| Quote 面辅料/内部工价/费用/估算 | 既有 quote.cost.view（Estimate 还需 estimate.view） | 既有 quote.cost.edit / estimate.edit 等 | 本轮仅修复已确认目录行为，不给采购来源金额套用该权限 |

建议只有管理员具备四个新增键，其他角色默认不授；已有角色有 quote.cost.view 也不自动迁移为商业字段权限。采用既有 app_permissions/app_roles/app_role_permissions/app_user_roles，无新增 schema 需求。现有 Server 权限读取是数据库角色关系，Browser mock 管理页不是可信 Server 配置 API。新目录及已有管理员授权必须在批准后的受控 Gate 实施并审计，不能假设重新启动就补齐旧管理员。Local Single-User 仍只是 D-093 本机全部目录技术身份，不扩展为生产模式。普通跟单员继续可看授权订单的采购来源执行价格；无新增商业权限则显示 restricted。

Quote 与 Order 的同一 CCT identity/current/version 不复制、不迁移。字段范围建议同时覆盖当前值、确认金额历史、日志、导出和缓存；历史只改变响应可见性、不重写 snapshot。Quote 成本 view 不授予确认销售价/工价 view，未来利润继续独立，未引入利润字段。需要用户批准这组命名、默认角色与保护范围后，才能正式接线。

响应采用 v1 只读投影的独立字段 envelope：`sale`/`labor` 各自 `{visibility:"allowed",value:{price:"0"|decimalString|null,currency}}` 或 `{visibility:"restricted"}`。restricted 无金额/币种值，不假装业务 null。无 current 保留 current:null；版本、context/provenance 与可信订单范围的处理仍需服务级授权，字段投影本身不能代替订单可见范围。

PATCH 建议保留 route 基础权限（Quote quote.view+quote.confirm、Order order.view+order.edit），再要求每个实际提交字段对应 view+edit。写权限不自动授予读权限，角色应明确成对配置。只允许显式 sale/labor 字段与 version，隐藏/未提交的一方必须在原锁与 transaction 内从 current 保留；显式 null 仅作为有权清空命令，"0"是精确零。未知键、客户端 visibility/actor/role、无权提交、绕过旧全量 body 一律 fail closed；旧客户端兼容与禁用旧写入须在批准后做专门契约测试，不静默放行旧包。

保持 D-084/D-087：terms expectedVersion、Quote expectedQuoteVersion、锁顺序、精确 NUMERIC、linked qualifier 由原 Quote PV 所有、unlinked Order 明确 CNY/USD、共享 current、不可变历史、append-only OperationLog/可信 actor 与同事务回滚。金额变更审计在 DB 保留 old/new，审计响应也按各字段读权限裁剪。两个已暴露 CCT GET/PATCH 和 CCT 日志目前没有接入这个方案，必须继续标 SECURITY PENDING。

准备代码 `server/confirmed-commercial-terms/read-projection.ts` 是独立可注入 factory，默认 sale/labor 均 deny；没有客户端可传权限参数、没有任何 endpoint 调用。确定性3/3测试覆盖不同字段独立授权、Quote/Order same identity/current、linked/unlinked、null/zero/精确小数和输入不变；不把此测试当成现有 HTTP 已安全。
## Gate3 — 最终验证与集成边界

本轮最终代码补强：兼容 garmentMedia/quoteDocuments 也仅返回 id/fileName/fileType/url；一个合成扩展金额测试先实际失败，再修复通过。受限保存保留 DB 中未返回的 BaseInfo/附件扩展元数据，不以 DTO 缺失清空；标量属性中的对象注入拒绝。原 Quote 成本、历史和 Estimate 精确保存/CAS/审计规则保持。

| 本轮实际执行 | 结果与范围 |
| --- | --- |
| Gate0 实际 session HTTP 漏洞复现 | 初始4/4；确认三条泄露路径，不代表安全 |
| 最终 Quote 安全/原 API/日志/客户端 + 独立 CCT 投影 | 43/43、0 skipped；包括两条仍存在的 CCT 泄露断言，只有成本路径已由负向断言证明修复 |
| linked CCT/Quote confirmation/Excel/ZIP/internal-summary/全部 Server client 定向回归 | 121/121、0 skipped；补强前执行，补强后受影响投影/保存已含在43项中 |
| npm run test:postgres | 179/179、0 skipped；随机 PG16/tmpfs/dynamic loopback，临时对象存储仅为 disposable MinIO；无真实业务库或 COS |
| npm test | 679/679、0 skipped |
| npm run typecheck / npm run lint | PASS / PASS |
| npm run server:build → npm run build | 串行 PASS；41 routes，现有大于500kB chunk提示保留 |
| git diff --check / owned PG cleanup | PASS；最终按 zhixu-pg-it- 名称只读检查无残留容器，无全局清理 |

完整 PG 首次166/173、7个失败（含父测试失败）：三处账本断言漏了 main 已发布0011，附件 full-save 测试身份无 quote.cost.view。仅补齐断言与该合成 full actor 的既有读权限；普通 viewer/denied 不增加权限，0010/0011 SQL/schema/目录不改。修正后整套179/179；不把首次失败隐藏或当成新 migration 实施。

### Git 与网络记录

- 起始可验证 main 与结束 GitHub connector compare 均为 fcf36e5eab6c78254f808c1cba38f3a63a66d4f8；结束 git fetch 因 schannel missing close_notify 失败，没有 reset/rebase 或改共享代理/TLS设置。connector 比较 main 与 baseline 为 identical（ahead/behind均0）。
- Gate0 checkpoint12ecb07e01e1c21211470cd42a84ced2dd7beb62、Gate1 checkpoint3b8f3836b2d77f8a20e6c085403c659f41c4cee9已正常 push。
- Gate2 checkpoint1b29725a7b4bb7c398ba88be629a613bbcc15896正常 push遭相同TLS错误，一次只读核实远端仍3b8f383；之后继续独立已验证本地阶段。最终 Gate3另建 checkpoint，正常 push 后按 exact SHA核实；最终交付状态以安全PR与当次报告为准，不冒称此前失败已送达。
- PR92最新03b1078e99ff44ceb875dd0b01a1e22358f4dab6 / OPEN Draft；用户本轮明确2026-10-11 HUMAN UI ACCEPTANCE PASS。其旧PR正文仍含当时 PENDING/REMOTE PENDING，不能用旧正文覆盖用户确认或当前head。未编辑B工作树或PR92。

### 与 PR92 的影响

本安全分支从 main 独立实施。共享文件交集为 docs/AI_HANDOFF.md、docs/CURRENT_STATE.md、server/app.ts、server/integration/confirmed-commercial-terms.integration.test.ts；前三项需后续人工保留双方恢复点及可选物料route边界，最后账本补0011是同一基线修正。PR92业务UI/CSS/Material投影和已认可截图不在本分支。没有把其77个changed-files合入。

PR92的现有 known-exposure 审计中 Quote成本读取应在安全PR合并后的集成Gate改成负向；CCT两条正向复现仍应标 SECURITY PENDING。Material响应的采购来源价格继续团队共享，与本次 Quote内部成本保护无冲突。QuoteResponse新增 restricted union，所有未来 full Editor/导出/缓存消费者必须守卫；不得补零或伪造完整DTO。正式 Order/CCT response目前没有改变，下一Gate在批准独立商业键后统一接线，避免将 quote.cost.view当成销售价/工价授权。

### 未完成/待批准

本轮无新 schema/migration、权限目录键、角色默认授权或配置API。没有部署、业务数据写入、艾诺科/COS访问，18443/18444保持未操作；采购来源/报价编号/正式订单来源/shared CCT writer/CAS/历史所有权不变。

**QUOTE COST READ FIX ENGINEERING PASS / CCT SECURITY PENDING。** 建议先审查独立成本安全PR；不是整个系统安全通过，也不授权PR92生产激活。等待用户批准 Gate2四键、管理员/普通角色默认配置、字段envelope、当前/历史/日志/导出覆盖范围与PATCH的view+edit/省略保留规则后，再独立实施销售价/工价权限接线。一般订单/company可见范围仍需单独可信范围审查，不由字段投影解决。
## Delivery reconciliation — LOCAL ENGINEERING PASS / REMOTE PENDING

Gate3工程checkpoint **195f6b73e99935b7823c723c8032dfa03c8c139c** 已保存，提交后工作树clean。正常push实际失败：Schannel failed to receive handshake / SSL-TLS connection failed。按AGENTS2026-10-09授权做一次进程级OpenSSL+HTTP1.1只读对照，证书验证保持开启、无持久配置修改；ls-remote成功确认main fcf36e5及远端安全分支3b8f383。随后同传输正常push遭 unexpected EOF，停止推送重试。GitHub connector compare再确认远端exact **3b8f3836b2d77f8a20e6c085403c659f41c4cee9**，不是195f6b7；错误类型是已确认TLS传输失败，网络/代理根因未确定。

唯一安全PR已创建：[PR #93](https://github.com/clearisok/zhixu-erp/pull/93)，**OPEN / Draft / base main**，目前只承载已送达Gate0/Gate1；正文明确本地最终结果、尚未送达Gate2/3、CCT SECURITY PENDING及不建议合并。没有通过API伪造不同commit或移动ref绕过正常Git交付。本次仅本地补记网络接力并提交，不再次触发同条件推送；最终本地HEAD由最终报告和git log确认，工程源码仍是195f6b7。

后续先在 D:/workspace/zhixu-quote-two-step 执行一组恢复命令，再将PR93更新为exact新HEAD并复核主分支/差异：

```powershell
git push -u origin fix/commercial-amount-read-security
git rev-parse HEAD
git rev-parse origin/fix/commercial-amount-read-security
git status --short
```

PR92继续Draft，用户认可UI未改变。只有成本修复的本地工程已完成；全部安全及GitHub最终送达均不得冒称PASS。新增四个商业权限键、角色默认、PATCH及CCT端点接线仍须用户明确批准。
