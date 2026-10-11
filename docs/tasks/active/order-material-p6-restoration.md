# PR #92 P6 original UI restoration — 2026-10-11

## Gate 0 — deterministic visual failure

User rejected the night P1–P5 UI; prior automated7/7 is historical functional evidence, not accepted visual evidence. **USER UI ACCEPTANCE PENDING** throughout this repair. P6's stated original layout is the baseline; no redesign or real511-order access.

Worktree D:/workspace/zhixu-order-material-b, branch feat/ainuoke-order-material-progress. Initial local/remote/PR exact HEAD d18b5db3e0f88bc2ebc58f909ee8fc8e355a3faa, latest fetched main fcf36e5eab6c78254f808c1cba38f3a63a66d4f8; branch divergence0/0, #92 OPEN/Draft. Only inherited dirty order-material-read-gate1.md30lines, SHA2568B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E, never edited/staged.

Root app/layout.tsx loads app/foundation.css after feature CSS; integration-preview/main.tsx omitted it. Added real private-Chromium assertions first, before adding CSS. Original1440/1280 .qc-toolbar display:block,height412; .qc-responsive-record-list display:block while desktop table also visible; filter controls span346px vertically. Foundation style absent.390 toolbar also block. No root overflow existed, proving that previous no-overflow check could not establish correct layout.

Red test:7tests,3pass/4fail,0skipped (three width cases fail + parent). Business/safety siblings remain passed, no assertion removed. [Before screenshot](evidence/order-material-p6-restoration/before-1440.png) and [actual computed metrics](evidence/order-material-p6-restoration/before-computed-styles.json). Only own random PG16/synthetic sessions/private browser were used and cleaned.

The current formal DTO exposes colorName,quantity,deliveryDate but no garment size grid. This Gate may rearrange/display those facts and honestly label size data as not connected; it must not fabricate sizes or change API/DB.

The P6 image itself is not present in this turn's readable attachment context. Comparison will cover every explicit P6 requirement in the user's message and the existing formal component/CSS; no pixel-identical claim or user acceptance will be inferred.

## Gate 1 — original list CSS restored

Gate0 checkpoint ca9bcb7ad4193220942ea79209206ab26b345144 exact remote verified after push reported target-present ref-lock. Added exactly the missing `import '@/app/foundation.css'` after feature CSS, matching RootLayout order. ServerOrderCenterPage, Toolbar, DataTable and formal list CSS were not rewritten.

Actual browser7/7,71assertions,0skipped and typecheck PASS. Desktop toolbar now flex/row,height65 rather than412. Both1440/1280 mobile records display:none, one original desktop table spans the white card (2px border difference). Search/query/four filters share the exact same vertical center.390 original responsive record grid is visible and desktop table hidden. PageContainer grid and zero document overflow hold at all widths. No API/provider/storage assertions removed; original account/Source/return checks pass.

The first green-attempt checked control top edges and incorrectly rejected different native input/button heights despite common centers. Changed measurement to vertical center with stricter5px threshold; final centers are exactly equal. This is a metric correction, not a CSS workaround or relaxed business/security test.

Desktop1440/1280 and390 screenshots visually inspected: compact one-row toolbar, one table, green sidebar/warm gray/white card, no duplicated records. This satisfies the listed P6 structure checks, **not user acceptance or pixel-level original-image comparison**. The two synthetic orders are intentionally unchanged; no real511-order data accessed.

## Gate 2 — compact formal detail, facts retained

Gate1 checkpoint2e0960cd79b64d91591a3a58a533f144528fbfe3 pushed normally. Reordered the same detail into overview → color summary → existing material summary → native collapsed Source/technical details. UUID/version/creation-source/raw lifecycle/InsideOrderNo/company/contract date/created+updated times and trusted identity remain readable on expansion. Existing commercial executionOnly gate stays intact; no API/DB/permission/source logic change. Garment size remains explicitly not connected; existing unconfirmed color delivery field is not promoted into UI.

Initial detail run checked hidden content height and failed because Chromium keeps internal rectangles for native closed-details content; switched to actual checkVisibility=false and body.innerText omission. Expanded UUID/version/time visibility and re-collapse are asserted. The subsequent7/7,98assertions result was **visually rejected by Codex screenshot inspection**:390 return/title overlap and global1000px minimum width hid color quantity. It was not accepted as a visual Gate success.

Fixed only scoped display rules: bind original named header areas, reset two-column formal color table minimum width, add summary padding/disclosure arrow. Synthetic preview notice now floats outside layout, so it neither hides behind fixed sidebar nor creates an extra page scroller. Real final browser7/7,104assertions,0skipped; desktop overview3columns/mobile1, return/identity rectangles never overlap, both color columns fit, technical fields actually hidden/default and readable/expanded. Typecheck/lint0warnings PASS; full npm757/757 was run this round and remains recorded separately from the subsequent minor display fix.

Desktop and390 detail screenshots now visually checked after the fix. **USER UI ACCEPTANCE PENDING**; no claim that user has approved them. Material display changes are isolated in the following Gate3 checkpoint.

## Gate 3 — 原 Control Tower 展示恢复

Gate2 本地 checkpoint `1164663d6fbadfca21159a5c2216a2b0216a470b` 已保存；当次 push 遇到 TLS close_notify，随后唯一只读核实显示远端仍为 `2e0960cd79b64d91591a3a58a533f144528fbfe3`，因此如实记为 REMOTE PENDING。继续同一已验证基线的独立本地阶段，无 force/reset/rebase。

仅调整 Server 专属展示：原 Control Tower 搜索框不再保留 Browser 排期控件的空列；物料组标题、展开明细标题使用原页面字体和留白；合同替代默认大段 UUID 说明。原共用 MaterialReadCard/Table、分组/颜色规格、采购/入库/出运/出库事件、投影与状态算法保持原实现，固定 UUID 返回不变。Server 分支继续不挂载 Browser 导入、人工排期或写入。

合成数据标识移到隔离预览页头的空白位置，独立 preview.css 只控制该标识，不覆盖正式组件样式。移动端实际滚动到页面底部，技术详情入口完整可见且不被标识遮挡；采购明细通过表格内部横向滚动读取单价和金额，页面本身不横向溢出。

最终实际组件 Chromium：**7/7，115 断言，0 skipped**。含三个宽度的 CSS/computed styles、列表唯一性、网格/折叠可见性、标题非重叠、搜索区域、金额可读、UUID 返回、账号切换隔离、未连接、摘要/详情一致性、GET-only、无 CCT/Quote 请求、无 Browser 业务存储/IndexedDB、无非隔离来源请求或 JS 异常。新增断言未移除既有业务和安全断言。

已检查最终桌面/移动截图，明确与此前被否决的截图区分。**USER UI ACCEPTANCE PENDING**；截图结构与 computed-style 检查不是用户批准。详见 [截图及 P6 要求逐项对照](evidence/order-material-p6-restoration/README.md)。
## Gate 4 — 本轮工程结果与交付边界

Gate3 checkpoint `802b104abad4c2995ea53f3fc68663d553c22e87`。所有产品改动完成后，最终截图已人工检查；不再新增 UI 或业务功能。用户人工 UI 验收仍为 PENDING，真实环境未部署。

| 本轮执行项目 | 结果 |
| --- | --- |
| `npx tsx --test features/ainuoke-material-progress/__tests__/integration-browser.test.mjs` | 7/7、115 断言、0 skipped；1440/1280/390 真实私有 Chromium |
| `npx tsx --test --test-concurrency=1 server/integration/order-material-http.test.ts server/integration/order-material-security-audit.test.ts` | 12/12（HTTP 11 + 既有暴露审计 1），0 skipped；审计通过代表暴露被重现，不代表修复 |
| `npm test` | 757/757，0 skipped；最终产品展示改动后重新执行 |
| `npm run typecheck` / `npm run lint` | PASS / PASS，0 lint warnings；最终标识样式后另执行定向 lint |
| `npm run server:build` → `npm run build` | 顺序 PASS；前端 42 路由，既有大于 500kB chunk 提示保留 |
| `git diff --check` | PASS |
| 完整 `npm run test:postgres`、独立 CCT 7 项、独立 Source/Gate1/1.5 78 项 | NOT RUN 本轮 UI 修复；不把此前结果当作本轮通过证据 |
| 临时资源 | 浏览器/API/Vite/随机 PG16 由各 fixture finally 清理；只核对本任务已知容器，其他并行任务容器不动 |

### 文件与风险

- 本轮仅改现有订单/款式展示 CSS、正式详情组件、物料摘要展示 class、隔离预览入口/标识和定向浏览器测试、合成截图/任务报告及必要状态/feature 文档。
- 未改正式订单列表组件/算法、数据库、共享权限目录、Quote 模块、Server API、0010/0011、任何部署环境。
- 当前金额 GET 风险仍存在；Material DTO 不含销售价/工价/Quote 内部成本/利润。团队可见的采购来源单价/金额继续展示，来源所有权没有改变。
- 正式分码数据尚未接线；默认真实 Source 和生产路由继续关闭。工程测试不能声明实时同步或生产安全。
- P6 原图无法在当前附件上下文读取，逐项对照明确列出的要求与原组件；像素比较未验证，用户审批待定。
- 继承 `order-material-read-gate1.md` 的 30 行修改始终未 stage，原 SHA256 保持不变。

GitHub 交付使用原分支/唯一 Draft #92。Gate2 纯 TLS 故障的本地/远端状态已分开记录；最终正常 checkpoint push 后，以只读 exact SHA 核实并在 PR/最终交付回复记录收据，不猜测送达、不 force push。

本轮相对起始 d18b5db3 的文件与已合并 PR91（HEAD `cf57074185412e323e2f3308bddc2fd3f73be063`）交集仅 `docs/AI_HANDOFF.md`、`docs/CURRENT_STATE.md`，为必要状态接力；未触及 PR91 业务代码、迁移或部署证据。整个历史 PR92 的 post-merge 交集另含此前已批准的 server/app.ts 和 CCT ledger 测试，不是本轮 UI 增量。
