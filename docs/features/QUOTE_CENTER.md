# Quote Center

## CURRENT — Fresh Start formal Server basic loop (D-097, 2026-10-08)

正式 `/quote-center` / `new` / `detail` 通过显式 `NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY` 原地分流。默认 browser 保留原 mock/localStorage 行为；server 必须 masters=server、writer=writable，编译/运行身份一致。Server 分支复用 QuoteEditor 的基础信息、当前价格版本材料/工价/其他成本、报价设置、保存与附件 panel，而不是简化 workspace。

页面实例 persistence 控制 expectedVersion/baseline 与 aggregate/附件排他锁；成功才推进版本，409 草稿保留、精度无法无损 round-trip 拒绝；Server list 最小 saved summary + 有界全库搜索/filter/真实 total，不读 Browser。Root trusted identity + 业务 bootstrap/unsupported-route 隔离，不添加 Browser logs；empty masters/defaults 明示未配置，Quick Create 走 Server。

Server new 页提供原有加工 processing / 经销 distribution 选择；只在用户点击后 POST `{}`，Server 默认经销不变。加工选择使用返回 aggregate/ID/version 做正常 PUT，成功后才进入详情；失败保留已创建 ID、明确类型未确认并禁止再次 POST，用户可打开该草稿核对。详情不新增任意类型修改入口，历史 Revision 不可变、计算规则和权限不变。

Server Revision / PriceVersion workflows 已接线：PV 以所选已保存方案复制并建立新 PV/成本行 ID，可编辑名称/数量/说明、删除非最后 PV、独立成本/设置与切换；Revision 从当前或明确所选历史快照创建新默认版本，沿用 Vn/分支命名和完整性验证，可信创建身份/时间，保留 scoped child IDs，清除新快照确认并冻结旧版本。历史只读/返回当前不写业务数据；附件关系由原 repository 事务继承，不复制 binary。

Typed `POST /api/v1/quotes/:id/version-workflows` 的小命令严格 allowlist + expectedVersion；沿用动作权限与可信审计，拒绝跨 owner/历史修改/最后 PV 删除/stale 或伪造 actor/time/label。Server 仅复用纯克隆/命名/存在性规则，不将 Decimal string 转 number 或重算历史。页面共用 aggregate/附件/版本写锁；dirty 须保存或取消，关联成本差异走原明确同步选择后再继续。前一步保存成功/后续命令未确认分别呈现；冲突/网络未知不重复创建、不落 Browser。Portal 弹窗表单提交不再冒泡触发外层 aggregate save。

Estimate、客户确认、导出、整单复制/删除、Revision 删除、转订单与日志查看仍未接线，Server 模式禁用；Browser 模式原功能保留。最新实际 Chromium 14/14（新 PG/tmpfs、memory storage、新 profile），覆盖两类型版本流程/历史分支/附件继承与解绑后继续保存、409/网络未知、原下载字节/SHA 与 Browser sentinel；不是生产部署验收。详细矩阵见 `FRESH_START_FOUNDATION.md`；下方早期 Q2 描述为历史上下文或默认 Browser 分支。

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

- Quote linkage integration is guarded by the build-time `NEXT_PUBLIC_ZHIXU_CONFIRMED_TERMS_QUOTE_LINKAGE=true` activation prerequisite and is disabled by default. While disabled, the existing Browser-local confirmation flow remains unchanged; rollout must prohibit creating or using formal Quote-linked SalesOrders in that mode. Merging implementation code therefore neither silently activates a second authority nor blocks current Quote-first production.
- Once explicitly activated, the current default Quote Revision/PriceVersion resolves formal linkage through the trusted Server by exact `quoteId + revisionId + priceVersionId` only. No quote code/style/customer/brand/date/price or Browser SalesOrder ID inference is allowed. Anonymous session, Server unavailability and incomplete lookup are `unknown`, not inferred-unlinked, and cannot write local confirmation.
- If the activated exact lookup proves provenance unlinked, the existing Browser-local confirmation workflow remains active. If it proves linked, customer-confirmed price and confirmed labor price read/write shared Server `ConfirmedCommercialTerms`; the linked PriceVersion's actual `CNY|USD` qualifier is established by the Quote surface and is read-only from Order. The linked branch does not call `mockQuoteRepository.save` and never falls back locally.
- Linked stale `expectedVersion` returns 409; the UI reloads current Server values and asks the user to review. The trusted session and `quote.view`/`quote.confirm` remain distinct from Browser mock identity/permissions.
- The active PriceVersion confirmation card, cockpit and sticky summary project linked confirmation from Server current terms using the existing quote-type rule: processing requires labor; distribution requires both labor and customer-confirmed garment price. Labor-only and garment-only distribution terms remain unconfirmed. The quote-wide `aggregateStatus` remains the legacy Browser aggregate until a later formal Quote migration can resolve every PriceVersion together; C4.2 does not duplicate numeric values locally merely to rewrite that aggregate.
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
