# Quote Center

## Original UI / Server convergence (2026-10-09; ENGINEERING PASS / USER UI ACCEPTANCE PENDING)

D-099: PR #64 `7658663038b1da504c95086711f627b6dce5c7a0` is the visual/information-architecture baseline; current Server is the data, security and business baseline. Server persistence is not permission to redesign the product. The [audit, capability/permission matrix and current test evidence](../tasks/active/quote-original-ui-convergence.md) and [synthetic screenshots](../tasks/assets/quote-original-convergence/README.md) record the engineering result, not human approval or deployment.

- New users get nine data cells plus fixed action: style placeholder, style identity, brand/person, type/status, quantity, costs, selling/confirmation, revision/PV count, date. Fifteen independent formal BusinessColumn fields remain configurable and exportable. Each group renders only authorized, visible children; tooltips/mobile records follow the same rule. No guessed country, PV-name or image metadata is added to the summary.
- Existing v1 preferences without presentation metadata retain the independent field layout, visibility, order and widths. The key is unchanged; loading never rewrites it. Explicit group/field view switches and “恢复默认布局” are user actions. Export selection remains independent of visual grouping and temporary choices never overwrite list preferences.
- Shared original PageHeader/More/search/filter/card language is restored, while bounded global search, real totals/paging, cross-page ZIP/internal summary and trusted permissions remain. Normal 1280 desktop grouped defaults fit; wider personal selections scroll inside the table with fixed right actions, never the whole document. True touch devices use authorized record cards, not a hidden table without actions.
- New uses CREATE QUOTE and the shared base-information card. The necessary Server difference is a type-first preparation step: opening/canceling does not create; explicit creation retains POST{}, ID/version and processing PUT, then enters the complete shared Editor. The old Browser unsaved full draft is not recreated through mock persistence. Failure/unknown result retains ID and never repeats POST.
- Editor runtime is unchanged by this convergence: PR83 compact costs, sticky summary, Portal, width floors and failure feedback are retained. Current/history, PV/Revision, Estimate, confirmation, attachments, saved-source exports, logs, CAS and precision remain covered by actual trusted Chromium regression. No new business actions are enabled.
- Known visual differences: no real list thumbnail or list country/PV-name metadata; trusted identity replaces old local-user identity; type-first creation replaces Browser pre-create aggregate editing; safe totals/paging remain. Whole copy/delete, Revision delete and Order creation remain unsupported. Human review must include list/preferences, both new types, detail/costs, 900 fine-pointer and touch layouts. This task never inspected/updated the real trial runtime.

## Historical PR83 usability work (2026-10-09; deployment status below is the original observation)

- 当时正式 Server 列表合并搜索/筛选/批量/内部汇总/列设置；只有选择模式显示本页全选与跨页计数。当时默认 9 个独立字段已被上方 D-099 组合展示取代；已有账号偏好不清空，Browser 的恢复契约不变。
- 此列表显式使用 `DataTable layout="readable"`：像素列宽下限、局部横向滚动、可读完整编号/两行款名/右对齐数值及 sticky 操作。其他表格默认 fit-first 未改变。
- 新建类型选择采用小面板与创建/取消；打开不创建，POST `{}`、必要类型 PUT、ID 保留及不重复创建保护不变。
- Server 详情正常说明收进资料/诊断入口；版本号保留，资料未配置引导可查看。真实写入失败、权限/精度、冻结、校验未隐藏。常用成本直接显示，空行密度收紧；1100–1439px 桌面复用现有展开式紧凑成本字段，避免右侧操作裁切，不折叠或改变计算。
- AppShell 外退出控件不再产生额外纵向滚动。资料载入后绑定 workspace 的 sticky observer，展开侧栏与 sticky 左边界一致；锚点保留 sticky 空间，Portal、dirty guard、保存/CAS 仍沿用原实现。Server 转订单入口继续禁用。
- 加工/经销在隔离正式 UI 创建、保存、刷新及列表筛选读回均通过；未复现“选择加工却保存为经销”。用户原截图是否同一次创建未证实，不归因为用户操作。
- 真实试用环境未更新；已登录不等于完整人工业务卡 PASS。功能范围不增加，历史导入 NOT REQUIRED。

## Current Server business list and internal summary (2026-10-09; engineering only)

Explicit Server mode requests typed, selected business columns from a bounded page of saved default Revisions. Quantity sums all PVs (all null stays null); costs use the existing calculator/range, mixed CNY/USD labor remains qualified, final garment display uses the shared formatter. Missing style images remain a clear placeholder: no old URL or IndexedDB read. Quote aggregate status/filter is distinct from current customer confirmation, never rewritten by this read projection.

Confirmation is checked per PV: exact linked uses CCT current/version, linked empty never falls back, proven unlinked uses its saved confirmation, incomplete provenance is unknown. JSON includes minimal per-PV source qualifiers; internal XLSX confirmation cells carry the same source in notes. No historical snapshot mutation or first-PV aggregate shortcut.

Personal list columns/order/width use a new local UI-only key scoped by trusted session userId and re-filtered by current permissions, not `loadQuoteSettings`, legacy preferences or master defaults. This is not cross-device synchronization. The formal summary dialog uses current visible columns by default and keeps temporary export choices separate. It exports one row per Quote or PV; Estimate is opt-in and protected. Contracts and technical limits are in `QUOTE_BATCH_EXPORT.md`; field permissions are in `PERMISSIONS.md`.

2026-10-09 overnight engineering: explicit Server mode supports trusted current
unlinked PV confirmation, including zero, processing/distribution, saved-source
values/time and same-transaction version/audit. Generic PUT preserves unchanged
confirmations but cannot forge them. Linked shared current now uses saved-PV
currency/eligibility with Quote CAS and independent terms CAS under transaction locks; no fallback or real activation.

Also connected: saved current/explicit history customer XLSX (one/all PVs, built-in template), bounded cross-page customer ZIP with truthful partial/warning manifest, and read-only Quote/global Server logs with audit/Estimate permissions. These reuse the existing Editor/export core/log components; they do not enable internal summary, whole-Quote copy/delete, Revision deletion or Quote-to-Order. Counts/checkpoints and remote delivery status are centralized in AI_HANDOFF.

## CURRENT — Fresh Start formal Server basic loop (D-097, 2026-10-08)

正式 `/quote-center` / `new` / `detail` 通过显式 `NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY` 原地分流。默认 browser 保留原 mock/localStorage 行为；server 必须 masters=server、writer=writable，编译/运行身份一致。Server 分支复用 QuoteEditor 的基础信息、当前价格版本材料/工价/其他成本、报价设置、保存与附件 panel，而不是简化 workspace。

页面实例 persistence 控制 expectedVersion/baseline 与 aggregate/附件排他锁；成功才推进版本，409 草稿保留、精度无法无损 round-trip 拒绝；Server list 最小 saved summary + 有界全库搜索/filter/真实 total，不读 Browser。Root trusted identity + 业务 bootstrap/unsupported-route 隔离，不添加 Browser logs；empty masters/defaults 明示未配置，Quick Create 走 Server。

Server new 页提供原有加工 processing / 经销 distribution 选择；只在用户点击后 POST `{}`，Server 默认经销不变。加工选择使用返回 aggregate/ID/version 做正常 PUT，成功后才进入详情；失败保留已创建 ID、明确类型未确认并禁止再次 POST，用户可打开该草稿核对。详情不新增任意类型修改入口，历史 Revision 不可变、计算规则和权限不变。

Server Revision / PriceVersion workflows 已接线：PV 以所选已保存方案复制并建立新 PV/成本行 ID，可编辑名称/数量/说明、删除非最后 PV、独立成本/设置与切换；Revision 从当前或明确所选历史快照创建新默认版本，沿用 Vn/分支命名和完整性验证，可信创建身份/时间，保留 scoped child IDs，清除新快照确认并冻结旧版本。历史只读/返回当前不写业务数据；附件关系由原 repository 事务继承，不复制 binary。

Typed `POST /api/v1/quotes/:id/version-workflows` 的小命令严格 allowlist + expectedVersion；沿用动作权限与可信审计，拒绝跨 owner/历史修改/最后 PV 删除/stale 或伪造 actor/time/label。Server 仅复用纯克隆/命名/存在性规则，不将 Decimal string 转 number 或重算历史。页面共用 aggregate/附件/版本写锁；dirty 须保存或取消，关联成本差异走原明确同步选择后再继续。前一步保存成功/后续命令未确认分别呈现；冲突/网络未知不重复创建、不落 Browser。Portal 弹窗表单提交不再冒泡触发外层 aggregate save。

PV 普通编辑与 Browser updateRevision 共用状态推导：有确认或原状态 confirmed/partially_confirmed 时按摘要更新，否则保留原 draft/quoting；新 Revision 创建仍进入 quoting。成本同步“同步并保存”/“仅保存当前版本”在 Server 模式统一处理失败：请求完成前不自动关闭弹窗，失败关闭 overlay 展示错误/显式核对，保留已应用范围与独立标记的 dirty 草稿、不继续后续版本命令、不自动重试；成功使用 Server 响应的版本/baseline 收口。同步规则与 persistence blocked 保护不变。

Server Estimate 日常闭环已接正式版本管理/成本面板：从所选已保存 Revision/PV 主动生成、固定结构编辑保存、重新生成完整归档、历史搜索/只读查看/克隆恢复、stale/ignore。Quote 级当前估算在查看历史 Revision 时可按自身权限编辑；历史 Estimate 不可写，来源 PV 删除后仍可独立查看/恢复。Server 克隆不重算，不反写来源/确认/状态/default/附件。来源、编辑字段、精确 decimal-string/null/zero 与命令边界见 `ESTIMATE_COST.md`。

Estimate 与 Quote/附件/版本共用 lock/version/baseline；估算-only 保存一个专用命令，混合草稿先保存 Quote 再保存 Estimate，前一步已提交、后一步未确认须分别显示。dirty 要求保存后继续或取消，成本同步选择完成后再主动继续；失败保留草稿/来源/历史选择、立即提供核对、blocked 不重试、不回退 Browser。

Quote / Estimate 权限耦合已在本 PR 内修复，而非新增角色政策。`quote.view` 可读报价及已授权历史，不因他人生成 Estimate 而整体403。可信身份无 `estimate.view` 时，GET、创建、普通保存与 Revision/PV 响应集中投影为 `estimateVisibility: restricted`，完全省略 active/history 字段，不返回存在性、历史条数或汇总；有权限则保留完整 Estimate。Editor 使用独立视图类型保留“未授权返回”状态，不伪造成 null/[]，不加载估算面板/计算/缓存；成本入口显示无查看权限。

普通 PUT 只提交 Quote 内容；Server 在 expectedVersion 校验后合并当前已保存 Estimate，仍对完整领域实体执行原 normalize/validate、细粒度权限、历史不可变与 repository CAS/事务检查。缺失字段不是清空命令；无 Estimate 读权限者注入任何 Estimate 字段（包括 null/[]）返回409 `estimate_command_required`。有读权限者的旧完整请求仅兼容原样切片，任何变化仍拒绝；Estimate 修改只走专用命令，需要 `quote.edit` + `estimate.view` + `estimate.edit`。读权限不授予写权限，默认角色/权限目录不变。

整单复制/删除、Revision 删除、转订单仍未接线，Server 模式禁用；内部汇总现已接线。Browser 模式原功能保留。HISTORICAL 初始工程 checkpoint 的 actual Chromium30/30 包含 Estimate 与此前版本/成本同步/附件/下载字节SHA回归，suite 数字及验证来源统一见 `AI_HANDOFF.md`。本轮列表/汇总的新结果见 AI_HANDOFF，不沿用旧数字。不是真实部署或全报价 production-ready，默认 Browser/旧 runtime 不变，历史导入 NOT REQUIRED。详细矩阵见 `FRESH_START_FOUNDATION.md`；下方早期 Q2 描述为历史上下文或默认 Browser 分支。

> 2026-10-05：`/quote-center` Quote aggregate 仍由 Browser mock Repository/localStorage 持有；Q3 master/default dependencies 在真实 3001 的 `masterSettingsAuthority=server` 下来自 PostgreSQL，Q3 编辑已重开。PR #64 Local Single-User UI 修复已部署：`/` 自动进入 `/quote-center`、统一侧栏恢复；用户真实浏览器确认原 Quote 数据保留。此收口没有迁移、重置、重新 seed 或改变 Quote storage namespace；Quote historical migration/Server ownership 另立 Gate。

## Q2B2B isolated Server new Quote (not Browser cutover)

- `/quote-center/server-new` uses `AppShell identityMode="server"`, trusted Server Session and scoped `quote.create`. It does not authorize through Browser PermissionProvider. The preview navigation entry is visible only with trusted `quote.create` and only navigates to the preparation page.
- Opening the route performs zero POST and `LocalDataBootstrap` skips that exact path. Only the explicit “创建 Server 报价草稿” action calls `POST /api/v1/quotes` with `{}`; pending disables double submit. Success redirects to `/quote-center/server-edit?id=<Server UUID>`. 401 invalidates Server session, 403 is explicit, and an ambiguous network outcome disables repeat creation until the Server list is checked; there is no hidden retry or Browser fallback.
- Browser cannot enter Quote ID, business number, date or suffix. The Server creates UUID identities, `QT-YYYY-MMDD-NNN` with Asia/Shanghai date, neutral draft fields and trusted `createdBy`. The page reads no `mockQuoteRepository`, Browser masters/settings, Browser OperationLog, IndexedDB attachments or OrderRepository.
- This route does not create attachment metadata, ConfirmedCommercialTerms or SalesOrder data. Production `/quote-center`, `/quote-center/detail` and `/quote-center/new` remain Browser/local. Q3/Q4/Q5 and production single-login/writer cutover remain incomplete.

## Q2B2A isolated Server writer (not Browser cutover)

- `/quote-center/server-edit?id=<quoteId>` is a clearly labeled test workspace for an EXISTING Server Quote. It loads and saves only through a dedicated typed adapter over Q2A `GET`/`PUT`; it does not reuse the Browser `QuoteEditor` or its repository/audit/attachment/master/Order side effects.
- The workspace uses trusted Server Session identity and a scoped Server permission authority. `quote.view` controls load, `quote.edit` controls aggregate save, and Server-side Q2A checks retain the finer cost/settings/workflow permissions. Browser test users and Browser PermissionProvider cannot grant Server edit.
- Server decimal strings enter the Browser numeric model only after exact canonical round-trip proof. Unsafe precision fails the whole edit projection closed. Successful PUT adopts the returned aggregate/version; a stale `expectedVersion` leaves dirty state visible and offers only an explicitly confirmed reload, never auto-overwrite/retry.
- Q2B2A edits a deliberately narrow existing default Revision surface. Attachments, Browser master resolution/quick create, delete, export, Quote-to-Order, new Quote, destructive advanced workflows and confirmation mutation are unavailable. Existing attachment references, historical snapshots and C4.2 current terms are preserved.
- Dirty navigation and `beforeunload` remain guarded; save-and-leave performs Server PUT only. The exact route skips `LocalDataBootstrap`. Production `/quote-center`, `/quote-center/detail` and `/quote-center/new` remain Browser/local; Q2B2B adds only the isolated Server new workspace described above.

## Q2B1 Server shadow read (not Browser cutover)

- `/quote-center/server-preview` is an isolated PostgreSQL metadata list; `/quote-center/server-detail?id=<quoteId>` presents the full Server Quote aggregate read-only. They use only the Q2A typed `quoteServerRepository` and never fall back to `mockQuoteRepository`.
- These routes use trusted Server Session + `quote.view` as their sole visible identity/authorization. Browser test-account switching, Browser settings/global-search controls and mock roles are hidden in Server shell mode; 401 invalidates the Server session and 403/404/network failures remain explicit.
- The detail preserves decimal strings, null-versus-zero, stored confirmation/Estimate snapshots and historical Revision read-only state. It does not mount `QuoteEditor`, resolve attachment references through IndexedDB, recalculate snapshots, or expose create/save/delete controls.
- `LocalDataBootstrap` skips those two exact routes. The production Browser routes below remain unchanged; Q2B1 is not writer cutover or global single-login production cutover. Q2B2A later adds only the isolated existing-Quote writer described above.

## Q2A Server API foundation

- Q2A adds typed Server list/detail/full-replacement-save contracts backed by the existing Q1 aggregate repository. Q2B2B replaces caller-supplied runtime aggregate creation with Server-owned `{}` → neutral draft creation while preserving Q1's internal exact aggregate path for future migration. The API preserves stable Quote/Revision/PriceVersion/cost/Estimate IDs, decimal strings, null versus zero, immutable history and optimistic aggregate version.
- The same-origin `quote-server-client`/repository uses `credentials: include`, `cache: no-store`, mutation boundary headers；D-097 显式 Server 分支已复用它，默认 Browser 分支不调用它。
- 当前旧部署与默认 browser 构建仍为 mock/localStorage；显式 server 构建正式 routes 走上述基本闭环。页面 load 不执行 Server create/migration；真实 cutover/完整 workflows 未发生。

## C4.2 linked current confirmation boundary

- Default Browser linkage still requires `NEXT_PUBLIC_ZHIXU_CONFIRMED_TERMS_QUOTE_LINKAGE=true`; explicit Quote authority=server resolves linkage independently of that legacy flag. Disabled Browser linkage retains local confirmation and must not maintain formal linked current. Merge activates neither runtime nor migration.
- Once explicitly activated, the current default Quote Revision/PriceVersion resolves formal linkage through the trusted Server by exact `quoteId + revisionId + priceVersionId` only. No quote code/style/customer/brand/date/price or Browser SalesOrder ID inference is allowed. Anonymous session, Server unavailability and incomplete lookup are `unknown`, not inferred-unlinked, and cannot write local confirmation.
- Explicit Quote Server mode always resolves exact trusted linkage: proven-unlinked uses its Server snapshot confirmation command; linked uses shared CCT with saved-source qualification and two versions. Default Browser remains local with linkage disabled; if enabled there, proven-unlinked remains local, but legacy linked mutation without a verifiable saved Server Quote is read-only. No fabricated source/weaker PATCH or linked `mockQuoteRepository.save` fallback.
- Linked mutation pins Quote/Revision/PV, saved currency, terms expectedVersion (first 0) and positive expectedQuoteVersion. 409/network preserves input/target and blocks mutation; explicit read only shows evidence, never replaces input/CAS or resubmits. Dirty work first saves/cancels with original permissions/cost-sync/Estimate sequencing. Currency drift explicitly shows previous/shared and saved-PV currencies for human review, not conversion. Linked notes are not saved.
- Active card/cockpit/reference distinguish shared current, unlinked snapshot, immutable history and unknown. Linked without current is unconfirmed; unknown never uses embedded confirmation as current. Processing requires labor, distribution requires both amounts. Terms-only changes leave aggregateStatus, Quote/Order versions, Estimate, calculations/confirmation snapshots and history unchanged; terms DTO is not QuoteRecord. Late/wrong-provenance lookup cannot replace another selected PV.
- Historical Quote Revision/PriceVersion pages continue to display their embedded immutable confirmation snapshots. New revisions and copied PriceVersions are not assumed linked and do not inherit a Server relationship. Confirmation note and every other PriceVersion field remain local/snapshot semantics; fabric/trim costs, markup, exchange rate, manufacturing country and assumptions are not live-linked.
- C4.2 contains no migration of real Browser confirmations and no real Browser write acceptance. Real PostgreSQL activation is separately gated.

## Purpose

Quote Center 是面向成衣报价工作的新版前端模块，提供完整报价快照、并列价格版本、细分成本、客户确认和报价列表管理。它目前与根路径 ERP 的旧报价模型隔离。

## Current behavior

- `/quote-center` 显示报价列表，支持搜索、筛选、个人可见列设置和临时批量导出选择模式。
- `/quote-center/new` 在内存创建草稿；用户未保存直接离开时不产生记录。
- 新建报价可在品牌/客户业务员搜索无匹配时就地创建主数据并立即选用；客户业务员只能在已选品牌下创建。快建主数据不会触发报价保存，默认资料自动应用与已有数据三向切换保护继续有效。
- `/quote-center/detail?id=...` 编辑当前默认 Revision，查看历史 Revision。
- 报价内可以创建/复制 PriceVersion、编辑面辅料/工价/其他费用、管理附件、客户确认、创建新 Revision、维护独立估算成本、删除和保存草稿。
- 可以把当前或历史 Revision 导出为正式 Excel；一个 PriceVersion 对应一个 Sheet，当前编辑存在未保存修改时会明确选择导出已保存版本或保存并导出。
- 报价明细业务 Card 的固定顺序为：面料成本、辅料成本、工价、其他费用、附件；附件始终是最后一个业务 Card，历史 Revision 同位置只读展示。
- 当前默认 Revision 可编辑，历史 Revision 只读。
- 页面有离开前 dirty guard；整页普通 Enter 不触发保存。
- 顶部常驻操作顺序为：返回列表、报价版本、创建价格版本、客户确认、导出报价、保存草稿。操作记录和删除报价保留既有权限与行为，但位于“更多”次级入口；报价设置位于 Revision 区域而非顶部主操作组。
- 面料成本、辅料成本、工价和成衣销售单价四项摘要已并入常规标题区，并在滚动后进入同一 Sticky Header；USD 工价显示原币金额与统一计算的 RMB 折合值，CNY 工价直接显示人民币金额，不再在基础信息后重复占用独立大卡片区。
- 顶部操作区下方提供页内快速导航。滚动后报价摘要、操作按钮和快速导航由同一 sentinel/state 进入同一个 sticky container，不存在导航先吸顶的中间状态。
- 当前默认 Revision 的可编辑能力由权限键控制；查看员仍可打开报价和导出，但基础信息、成本、附件与保存操作保持只读/disabled。
- 报价详情提供只读“操作记录”时间线；日志在保存成功后由前后快照差异追加生成，详细边界见 `OPERATION_LOGS.md`。
- 已保存报价可由 AppShell 全局搜索按报价号、款号、款式名称、品牌和客户业务员检索；结果只投影非成本信息，详细架构见 `GLOBAL_SEARCH.md`。
- 列表普通搜索按空格 token 做 AND；`/字段 值` 结构化搜索也做 AND，并可与普通 token 组合。`/制作国家` 扫描全部 PriceVersion 快照。
- 列表在 1229 CSS viewport 保持无 document-level 横向溢出，并直接显示款式缩略图；“更多”使用 Portal，不受表格或父容器裁切。
- 其他费用进入顶部成本摘要；点击最终报价打开 Cost Breakdown Drawer，计算继续读取当前 PriceVersion 的正式 calculator 结果。
- Attachment 区域获得焦点后可直接 Ctrl/Cmd+V 粘贴图片，不再要求先打开上传弹窗。
- 品牌与客户业务员使用嵌套选择器；系统 fallback 必须显示实际继承值，不能只显示“回退品牌值”占位。

当前“创建价格版本”以活动 PriceVersion 为来源复制成本数据，并为成本行生成新 ID；UI 使用“创建价格版本”文案。

## Business rules

- 面料 kg 与 meter 单耗在 `quote-calculations.ts` 的计算边界统一按第五位四舍五入为四位正式业务值；面料成本直接乘该四位值，UI 与 Excel 不维护另一套精度。

- Revision 是完整报价快照；PriceVersion 是同一 Revision 中的并列价格口径。
- `defaultRevisionId` 指向默认 Revision；`currentRevisionId` 仅兼容旧数据。
- 新 Revision 深复制来源、清除客户确认、记录父版本/分支关系，并使历史版本只读。
- 单个 PriceVersion 持有数量、成本和确认；总数量为各 PriceVersion 数量之和。
- 最后一条 PriceVersion 不允许删除。
- 新复制的 PriceVersion 及其成本行必须使用新 ID，确认信息清空。
- 客户确认属于 PriceVersion，汇总状态为报价中、部分确认或已确认。
- 空值不等于 0。未录入成本显示空态，只有明确输入 0 才显示零金额。
- Quote Center 使用 `markupRate` 乘法加成，不使用根路径 ERP 的毛利率除法公式。
- 面向用户的最终成衣销售单价保留一位小数并直接截断，不使用四舍五入；内部计算继续保留原始精度。
- 制作预设应用到当前选中的 PriceVersion 快照，带出制作国家、加工币种、汇率、加成率和预设运费行；同一 Revision 的 PriceVersion 可使用不同预设，系统预设后续变化不回写已有快照。
- 新 Quote 的系统默认制作预设只能是 active preset；inactive reference 按无默认处理。停用当前 default 会清空设置关系，重新启用不会自动恢复，但这些状态变化从不修改任何已保存的 PriceVersion 制作参数快照。
- 报价详情的报价设置只选择当前 PriceVersion 制作预设并显示只读摘要；预设内容只在系统设置维护。
- USD 工价人民币折合由 `convertedLaborRmb` 统一计算为 `原始 USD 工价 × 当前汇率 × 1.13`；`markupRate` 继续独立参与报价成本/售价加成，CNY 工价不走 USD 折算。
- 详细公式见 `docs/BUSINESS_RULES.md` 和 `model/quote-calculations.ts`。

## Data model

权威前端模型在 `features/quote-center/model/quote-view-model.ts`：

- `Quote`：稳定 ID、报价编码、删除预留、默认 Revision ID、聚合状态、Revision 数组、当前估算成本和估算历史。
- `QuoteRevision`：身份/分支元数据、基础信息、PriceVersion 数组、图片/文件附件 ID、款式图 ID 和确认摘要。
- `PriceVersion`：名称、数量、说明、独立 `pricingParameters` 制作预设快照、面料、辅料、工价、其他费用和客户确认。
- `FabricCostLine` / `TrimCostLine` / `LaborCost` / `OtherCostLine`：报价当时使用的成本快照。
- `PriceVersionConfirmation`：报价值和客户确认值的快照。

`PriceVersion.pricingParameters` 同时保存制作预设引用 ID 与应用时的完整快照；正式计算、页面汇总、报价中心列表、客户确认报价值和 Excel 导出均只读取目标 PriceVersion，不实时读取系统预设。报价中心工价列按各 PriceVersion 原始币种分别格式化，混合币种不合并为错误统一区间。

附件 metadata 与 Blob 使用独立 AttachmentRepository/IndexedDB，具体见 `features/ATTACHMENTS.md`。

## API and persistence

- Repository interface：`features/quote-center/repository/quote-repository.ts`。
- 当前实现：`mock-quote-repository.ts`，以内存缓存 + 稳定 localStorage `zhixu.erp.local.quotes` 保存；旧 sessionStorage `zhixu.quote-center.slice-1.2` 只作为一次性兼容迁移来源。
- 附件二进制：IndexedDB `zhixu-quote-attachments`，Quote repository 只保存 ID 引用。
- 全局费用和列表偏好使用 `zhixu.erp.local.*` 稳定 localStorage envelope，定义在 `model/quote-settings.ts`。
- Q1 已提供独立 `server/quotes/` 和 `0005_quote_foundation.sql`；Q2A 已在其上增加 trusted typed HTTP API、aggregate writer、optimistic conflict 与 atomic OperationLog，并只通过 disposable PostgreSQL 验证。Browser writer cutover 仍未执行。完整 schema/边界见 `QUOTE_PRODUCTION.md` 的 Q1/Q2A 节。
- 不调用根路径 ERP 的旧 `/api/quotes`。
- Repository delete interface 预留 `hard` / `soft` 模式；当前 mock UI 实际执行硬删除。
- 操作日志使用独立 localStorage repository `zhixu.erp.local.operation-logs`，旧 key 只作为迁移来源，不改变 Quote repository 和 Revision 数据结构。

## Frontend behavior

主要入口：

- `app/quote-center/page.tsx`
- `app/quote-center/new/page.tsx`
- `app/quote-center/detail/page.tsx`
- `app/quote-center/server-preview/page.tsx`（Q2B1 Server-only shadow read）
- `app/quote-center/server-detail/page.tsx`（Q2B1 Server-only aggregate detail）
- `features/quote-center/components/quote-list.tsx`
- `features/quote-center/components/quote-editor.tsx`
- 权限接入：`features/permissions/` 与 Foundation `Button.permission`
- 操作日志：`features/operation-logs/`；详细规则见 `OPERATION_LOGS.md`

主要 UI 子模块：

- 基础信息：`quote-base-info.tsx`
- 面辅料宽表：`cost-table.tsx`
- 价格版本：`price-version-selector.tsx`
- 页内快速导航：`quote-quick-navigation.tsx`，由 `quote-editor.tsx` 组装可见项和 section anchor
- Revision 管理：`revision-history.tsx`、`revision-manager-modal.tsx`
- 报价/全局设置：`quote-pricing-settings.tsx`、`quote-settings-modals.tsx`
- 制作国家预设：`global-quote-settings-page.tsx`、`quote-pricing-settings.tsx`、`model/quote-settings.ts`
- 校验/汇总：`validation-summary.tsx`、`quote-metrics.tsx`
- 附件：`attachment-panel.tsx`、`model/quote-attachments.ts` 和附件 repository
- Excel 导出：`quote-export-modal.tsx`、`features/quote-center/export/`；详细规则见 `QUOTE_EXCEL_EXPORT.md`
- 批量导出：`batch-export-modal.tsx`、`export/quote-batch-exporter.ts`；详细规则见 `QUOTE_BATCH_EXPORT.md`
- 估算成本：`estimate-cost-panel.tsx`、`model/estimate-cost.ts`；详细规则见 `ESTIMATE_COST.md`

面料/辅料从基础库选择时，只把当时数据复制到报价行；后续编辑报价不回写基础库。

品牌或客户业务员快建后，Quote Editor 直接刷新内存主数据并选中新 ID，不依赖页面刷新。默认辅料进入报价时重新生成 row ID、用量保持 `null`；历史 Revision 和 Trim Library 均不被报价行后续编辑污染。

响应式当前行为：

- `>=1440px` 保持完整桌面侧栏和列表 Table；小于 1440px 的细指针/可 hover 桌面窗口使用 compact sidebar，即使 viewport 缩到 650px 也保留完整业务能力。报价列表仍保持 Table，成本区则按各自 Card 容器宽度选择 renderer。
- 报价明细成本区以 Card 实际内容宽度选择 renderer：`>=1040px` 使用单行 Wide，低于该值使用 Compact/Narrow；同时 `700–1099px` viewport 保证半屏使用完整两行 Compact，不因 Sidebar/padding 误入单列。Wide 面料、辅料和其他费用使用固定表格布局与业务权重百分比，吃满 Card 且正常桌面不产生横向滚动；Compact 分组、ViewModel、回调、计算、row ID、dirty 和焦点规则不变。
- 全部 Compact/Tablet 的普通操作 Header 和已验收 Sticky Header 均为四列等宽 Grid；只有 `>=1440px` Large Desktop 自然横排。响应式只改变尺寸和排列，Sticky sentinel/observer/出现时机不变。
- Quote Detail 内容区不再显示“返回报价中心”；明确父目标由 AppShell 顶栏返回入口承载并继续经过 unsaved guard。操作记录和删除报价通过轻量单行“··· 更多”访问。
- Quote Detail 顶部只有一条 Quote Cockpit Bar：Revision / PriceVersion / 制作国家 / 数量、面辅料、工价及人民币折合、其他费用、成衣销售价格、客户确认与差异、加成和报价设置在同一业务 strip 中表达；独立 `QuoteMetrics` 与黄色 Price Context Bar 不再并行重复最终售价。1229 CSS viewport 下无需页面或 Cockpit 横向滚动，窄宽度通过语义合并而非极小字体处理。
- `768–1023px` 的触摸设备使用 Tablet；连接细指针并可 hover 时优先按 Compact Desktop 处理。
- 只有 `<768px`、`pointer: coarse`、`hover: none` 的 True Mobile 把报价列表改为 Card List；报价详情是“查看全部 + 轻编辑”，基础信息、备注、工价、客户确认、附件继续复用桌面状态与保存流程。
- Quote Center 的搜索、报价类型、报价状态在所有设备直接显示为同一行 `6fr / 2fr / 2fr`，不使用筛选按钮、Drawer 或 Bottom Sheet；结果数量轻量显示在列表上方右侧。
- Mobile 详情隐藏 Sticky Header，款式图显示 contain 缩略图；Bottom Navigation 只允许 True Mobile 出现。
- 手机面料/辅料为现有成本行的摘要投影，数值继续调用既有计算函数，不建立第二套数据或公式；结构增删留在桌面端。
- Mobile PriceVersion 使用横向紧凑卡；保存和客户确认保留在顶部，返回由 AppShell Detail 导航承载，报价版本、创建价格版本、导出和删除进入“更多”。

## Important constraints

- 不得把 Library 或 Basic Settings 整体塞入 Revision。
- 不得把 mock repository 描述为生产数据源。
- 不得静默连接或适配旧 `/api/quotes`；后端迁移必须单独设计映射和数据迁移。
- 不得将根 ERP 的 `margin` 公式用于 `markupRate`。
- 不得重新引入输入一个字符丢焦点、Dropdown 被 overflow 裁剪或普通 Enter 保存整页等已解决问题。
- 历史 Revision 的数据必须保持快照语义。
- 旧 Revision 级制作参数只允许在 repository v2 → v3 迁移中读取并复制到各 PriceVersion；新保存数据不得继续依赖该层级。
- 正式 Excel 导出必须使用仓库模板、现有计算口径和精确选中的 Revision 快照。

## Tests

相关测试分布在 `tests/quote-*.test.mjs`、`tests/quick-master-data.test.mjs`、`tests/fabric-calculations.test.mjs`、`tests/cost-table-ui-part2.test.mjs`、`tests/cost-responsive-batch1-2.test.mjs`、`tests/global-costs-v2.test.mjs` 和 `tests/quote-revision-management.test.mjs`。页内导航由 `tests/quote-quick-navigation.test.mjs` 覆盖，正式 Excel 导出由 `tests/quote-excel-export.test.mjs` 覆盖。

测试包含大量源码契约检查；修改结构时也应做浏览器实际交互验证，不能仅依赖字符串断言。

## Known gaps

- Production Quote Center 尚未切到真实后端或多用户写入；legacy routes 仍只有 localStorage mock RBAC。Q2A Server API 与 Q2B1/Q2B2A isolated routes 已有 trusted Server enforcement，但不是 production cutover。
- 已提供从明确 Quote Revision + PriceVersion 生成新订单中心 SalesOrder 的浏览器流程；尚无真实后端订单 API 或与根路径旧订单的数据整合。
- 附件当前仅为单设备 IndexedDB 原型，没有真实上传 API、对象存储和跨设备共享。
- 列表无分页/服务端筛选。
- 当前测试账号可在 AppShell 切换，但不是已认证的真实会话；个人偏好尚未按该账号全面迁移。
- 2026-09-01 Full UI / Workflow Correction 的 Quote 与 Foundation 修改已由 Gate A commit `367983925f8e9236a701a71781054f6baaf65e78` 独立固化。

## 2026-09-04 Second Acceptance

- 报价列表把旧 `style` 拆为稳定 `styleImage` 与 `styleIdentity`，旧偏好自动映射为两列；用户可分别调整顺序与宽度。
- 最大字段场景使用业务组合列与 secondary line 展示报价编号、款式、品牌/业务员、类型/状态、数量、成本、成衣价/确认、报价历史/价格方案、日期和操作，Primary Desktop 不再强制隐藏用户选择的 revision 列。
- “更多”保持单行紧凑按钮；详情 Sticky 在滚入成本区后继续显示款式身份、Revision、PriceVersion、制作国家、报价类型、数量、成衣价、工价、确认与 dirty/save 状态。
- 2026-09-08 Correction 将两层价格摘要收敛为唯一 Quote Cockpit Bar；Sticky 继续共用原 sentinel/state，只保留滚动时的高价值上下文，不重新渲染第二套大型 Cockpit。
