# Post-Phase6 UI Correction

## A. Correction Start Baseline

- Branch: `rescue-codex-20260824`
- Start HEAD / Delivery Phase 6 commit: `1f354772b442383be8c88bb8c2f4ac9c72c1c57c`
- Commit subject: `ui: complete delivery phase 6 master data`
- Correction 开始前除 `artifacts/artifact-tool-qa/node_modules/**` 与 `tsconfig.tsbuildinfo` 外，没有无法归属的 product hunks。
- 本任务不是 Delivery Phase 7；没有实施 Phase 7 范围。

## B. QA Dataset Visibility Root Cause

当前 DEV Repository 使用浏览器 `localStorage`、IndexedDB 和 `zhixu.erp.local.*` namespace。浏览器本地数据同时按 Origin 与 Browser Profile 隔离：

- `http://127.0.0.1:3001` 与 `http://localhost:3001` 是不同 Origin。
- Codex Browser Profile 与用户自己的 Chrome Profile 不共享 localStorage / IndexedDB。
- 因此 Codex Browser 中存在 `ui-redesign-qa-v1`，不代表用户 Chrome Profile 自动拥有同一 Dataset。

没有修改 Repository、namespace、schemaVersion、PostgreSQL 或持久化架构。

## C. QA Loader

目标 Profile 装载流程：

1. 在 `http://127.0.0.1:3001` 启动 DEV。
2. 执行 `npm.cmd run qa:data:prepare`。
3. 用最终验收 ERP 的同一个 Chrome Profile 打开 `http://127.0.0.1:3001/__dev-ui-qa-data.html`。
4. 页面核对 Origin、Dataset ID、seed、namespace 与预期数量后，执行“生成 / 补齐”。
5. 返回 ERP，检查 Quote / Order / Scheduling / Closing。
6. 执行 `npm.cmd run qa:data:cleanup`；该命令只删除临时 Loader HTML，不删除 Dataset。

Loader 显示 Origin、Browser Profile 提示、Dataset ID `ui-redesign-qa-v1`、seed `zhixu-ui-redesign-2026`、`zhixu.erp.local.*` 和 Quote / Order / Schedule / Closing 数量。实际在同一 Profile 连续执行两次，第二次均为 `added 0`，现有 72 Quote、168 Order、150 Schedule、3 Closing Month、90 Closing Relation 被跳过且未覆盖。

## D. Quote Workspace Audit

旧问题由三个布局约束叠加造成：

- Object Header 使用可持续 shrink 的多列 flex，身份、metadata 与 actions 竞争宽度，业务字符串容器可收缩到字符级。
- 页面 Grid 的隐式 min-content 宽度在 768px 时仍接近 877px，并被外层 hidden overflow 截断。
- Fabric Compact 在中等容器宽度下使用单列字段流，导致字段虽可见但一字段一行；低频源输入又被只读化。

修正后 Header 按语义块和自身容器宽度重排；identity、metadata 与 actions 在 Medium / Compact 分行，不再通过字符级换行承受宽度压力。页面 Grid 明确使用 `minmax(0, 1fr)`，Workspace 使用可用内容宽度。

## E. Quote Detail Second Pass

- Object Header 以款号为 Primary、款式名称为 Secondary；品牌、业务员、报价类型、状态与 Quote 编号进入独立 metadata flow。
- Wide 使用 Identity + Metadata + Actions；Medium / Compact 切换为 identity、metadata、actions 的语义分行；Mobile 使用单列对象头。
- 顶部 Object Header 与价格 Metrics 形成连续 Workspace 卡，不再像互不相关组件拼接。
- QuoteRevision 继续作为不可变历史快照，PriceVersion 继续作为当前 Revision 内的价格方案；模型与切换逻辑均未合并。
- 原有 Sticky、价格摘要、Section Navigation、Save / Export / More 行为保留。

## F. Fabric Editing

| Field | Wide | Primary | Compact | Mobile | Derived |
| --- | --- | --- | --- | --- | --- |
| 面料名称 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 成分 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 供应商 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 段长 | 直接编辑 | 直接编辑 | **直接编辑** | 摘要 + Drawer 编辑 | 否 |
| 门幅 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 克重 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 损耗率 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 单价 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 采购单位 | 直接编辑 | 直接编辑 | 直接编辑 | 摘要 + Drawer 编辑 | 否 |
| 单耗 | 只读结果 | 只读结果 | 只读结果 | 只读摘要 | 是，Calculator |
| 面料成本 | 只读结果 | 只读结果 | 只读结果 | 只读摘要 | 是，Calculator |

所有编辑继续写入当前 Quote Fabric Snapshot，不回写 Fabric Master。完整资料 Drawer 保留为 Advanced Detail / 超小屏编辑入口；移动端 Drawer 实测 ESC 关闭并恢复触发按钮焦点。

## G. Fabric Responsive Layout

| 场景 | CSS viewport / DPR | 关键测量 | 结果 |
| --- | --- | --- | --- |
| 1600 × 1000 | 1600 × 1000 / 1 | Workspace 1399px；Fabric 1331px | Wide 完整宽表，无页面横滚 |
| 1280 × 900 | 1280 × 900 / 1 | Workspace 1079px；Fabric 1023px | Primary 高密度，无页面横滚 |
| 960 × 900 | 960 × 900 / 1 | Fabric 825px；Card 799px | Compact 多列直接编辑 |
| 768 × 900 | 768 × 900 / 1 | Workspace 675px；Fabric 639px；Card 619px | Compact 多列，普通字段不独占整行 |
| 402 × 874 | 402 × 874 / 1 | Fabric 363px | Mobile Task Card |
| 440 × 956 | 440 × 956 / 1 | Fabric 401px | Mobile Task Card |
| Scenario A 模拟等效 | 614 × 768 / 1 | Workspace 521px；Header 483px；Fabric 485px；Card 465px | Half-screen Header 无字符塌陷，Fabric 约 3 业务行 |
| Scenario B 模拟等效 | 1229 × 768 / 1 | Workspace 1028px；Header 972px；Fabric 974px；Card 948px | Windows125 + Chrome125 full-screen 等效，多列 Fabric |
| Scenario C 模拟等效 | 768 × 864 / 1 | Workspace 675px；Fabric 639px | Windows100 + Chrome125 half-screen 等效，Compact 直接编辑 |

Scenario A/B/C 是实际 CSS viewport 复现，不是对真实 Windows Display Scaling 或 Chrome Zoom 的替代验收；自动化环境 DPR 为 1。

## H. Order Detail Audit

- 实时 DOM 中 AppShell Navigation 只有一份，正常滚动无重复、重叠或闪烁。
- 用户 full-page 长截图中的重复 Sidebar 是 fixed/sticky 元素被浏览器 full-page stitching 多次拼接的截图伪影，不是产品 DOM duplicate。
- 真实宽度问题来自通用 Workspace 在没有 `context` 内容时仍保留约 320px 的空 Context column；1280 下主内容只剩约 689px。

## I. Order Detail Correction

- Order Detail 在无 context 时改为单列 `minmax(0, 1fr)`，1280 下主内容恢复到约 1023px。
- 1600 / 1280 / 960 / 768 / 402 / 440 均无 document-level 横向溢出。
- Business grid 分别按可用宽度使用 4 / 3 / 2 / Mobile columns；Cockpit、数量与交期、生产、物流、价格与关账、附件和 OperationLog 语义未改变。
- 正式截图使用 viewport capture；不把存在 stitching artifact 的 full-page capture 作为证据。

## J. Business Protection

未修改 Quote、QuoteRevision、PriceVersion、defaultRevisionId、Quote Calculator、Fabric consumption formula、第五位精度规则、USD Labor conversion、Final Quote、EstimateCost、Customer Confirmation、Order、Quantity / Price History、DeliveryPlan、ScheduleAssignment、三种订单状态、Closing、RBAC、OperationLog、AttachmentRepository、Backup / Restore、Template Parser / Exporter、storage namespace 或 schemaVersion。

## K. QA Dataset Protection

无 Reset、无 Re-seed、无 QA Quote / Order / Schedule / Closing 删除、无 localStorage / IndexedDB 清理、无 namespace / schemaVersion 修改。Loader 的第二次运行只跳过已有 Dataset；`qa:data:cleanup` 只删除临时 HTML。

## L. Quality Gate

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Correction Tests | PASS | `tests/post-phase6-ui-correction.test.mjs`，6 / 6 |
| Full Tests | PASS | `npm.cmd test`，408 / 408 |
| Production Build | PASS | 23 routes prerendered；仅既有 `>500 kB` chunk warning |
| `git diff --check` | PASS | Correction files / staged diff 无 whitespace error；vendored artifact 单独排除 |
| Browser Console | PASS | 最终日志只有 Vite debug、React DevTools info 与 Build Info；0 warning / 0 error |

轻量回归已打开 Quote Center、Order Center、Production Scheduling 和 Brand Settings；均正常加载、无 Runtime Error、无页面横向溢出。

## M. Screenshots

| Evidence | Screenshot |
| --- | --- |
| Half-screen Header | [correction-quote-half-header-614.png](screenshots/correction-quote-half-header-614.png) |
| Half-screen editable Fabric | [correction-quote-half-fabric-edit-614.png](screenshots/correction-quote-half-fabric-edit-614.png) |
| Windows125 + Chrome125 CSS-equivalent Fabric | [correction-quote-w125-z125-fabric-1229.png](screenshots/correction-quote-w125-z125-fabric-1229.png) |
| Quote Workspace 1280 | [correction-quote-workspace-1280.png](screenshots/correction-quote-workspace-1280.png) |
| Quote Workspace 960 | [correction-quote-workspace-960.png](screenshots/correction-quote-workspace-960.png) |
| Quote Workspace Mobile 402 | [correction-quote-mobile-402.png](screenshots/correction-quote-mobile-402.png) |
| Order Detail 1280 | [correction-order-detail-1280.png](screenshots/correction-order-detail-1280.png) |
| Order Detail Compact 768 | [correction-order-detail-compact-768.png](screenshots/correction-order-detail-compact-768.png) |
| Order Detail Mobile 402 | [correction-order-detail-mobile-402.png](screenshots/correction-order-detail-mobile-402.png) |
| Normal-scroll Sidebar | [correction-order-sidebar-normal-scroll-1280.png](screenshots/correction-order-sidebar-normal-scroll-1280.png) |

## N. Version Control

- Start HEAD: `1f354772b442383be8c88bb8c2f4ac9c72c1c57c`
- Commit message: `fix: correct quote workspace and order detail responsive layouts`
- Commit hash / Final HEAD: 由最终交付报告记录；文档避免把自身提交 hash 写入同一提交造成循环变更。

## Correction Gate

产品、自动化、浏览器、截图与文档条件已满足；以独立 Correction commit 成功作为最终 Gate 的最后条件。Delivery Phase 7 未开始。
