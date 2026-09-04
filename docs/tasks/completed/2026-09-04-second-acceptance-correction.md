# 2026-09-04 Second Acceptance Correction

状态：实现与自动门禁 PASS；PR #3 保持未合并，等待用户真实 1229×691 视觉复验。

## 截图反馈映射

1. 截图 1–2：Quote List 改为 fit-first 组合列；最大字段无局部横向滚动，款式图/身份独立，更多按钮单行。
2. 截图 3：Quote Detail Sticky 增加 Revision、PriceVersion、制作国家、类型、数量、成衣价、工价、确认与保存状态。
3. 截图 4–5：Order Detail 由 Header 承担身份，Overview 只保留判断型 Projection，客户/PO 与款号不再多处重复。
4. 截图 6：正式 Ainuoke Order 移除常驻“交期计划与数量历史”；Domain、migration、日志与备份未删除。
5. 截图 7：Production 移除组级大异常 Banner 与执行摘要，异常保留在组 Badge 和队列行。
6. 截图 8：生产组只保留当前款身份、待产、异常和队尾日期。
7. 截图 9–10：整个生产组选择 `aside` 相对 AppShell 主滚动 sticky 于 80px；面板自身不滚动。

## 表格覆盖矩阵

| 表格 / tableKey | Resize | Reorder | 说明 |
| --- | --- | --- | --- |
| `quote-center.quote-list` | 是 | 是 | 受控 Preference；旧 `style` 映射 `styleImage + styleIdentity` |
| `order-center.order-list` | 是 | 是 | 受控 Preference；操作列保持 sticky |
| `workspace.款式进度列表` | 是 | 是 | 共享 DataTable 自动持久化 |
| `workspace.品牌设置` / `客户业务员设置` / `面料库` / `辅料库` | 是 | 是 | 共享 DataTable 自动持久化 |
| `workspace.生产组` / `外发厂` / `月度生产目标` | 是 | 是 | 共享 DataTable 自动持久化 |
| `workspace.OperationLog 业务事件` / `workspace.模板管理` | 是 | 是 | 共享 DataTable 自动持久化 |
| Quote 成本录入矩阵 | 否 | 否 | Spreadsheet 语义；列与公式位置固定，按容器比例 fit，窄屏切 Compact/Card |
| Style Progress 物料明细 | 否 | 否 | 来源/需求/实际/物流的固定审计语义；折叠分区与窄屏投影，不任意调序 |
| Production Queue | 否 | 否 | 队列顺序、状态、异常、动作是固定作业序列；fit-first 且无局部滚动 |
| Unscheduled Pool | 否 | 否 | 固定排单决策序列；fit-first 且窄屏转 Record/Grid |
| Closing Detail 分组汇总 | 否 | 否 | 月度数量与状态的固定汇总顺序；`min-width: 0` fit-first |
| Ainuoke 对照表 / Order 内嵌同步表 | 否 | 否 | 导入对照与候选判断的固定列语义 |
| Attachment 文件表 | 否 | 否 | 次级附件清单；文件身份和动作顺序固定 |

共享 DataTable 的自动键为 `moduleKey + ariaLabel`；全部 Preference 由当前用户隔离，不进入业务数据或 OperationLog。

## Browser QA

- 应用内 Browser 实际 viewport：1280×720；1229 与 1280 均为 Primary Desktop 响应模式。
- Quote List：document `1280/1280`；最大字段 wrapper `1021/1021`。
- Order List：wrapper `1021/1021`。
- Style Progress List：修正末列 resize handle 后 wrapper `1023/1023`。
- Basic Settings：wrapper `1021/1021`。
- Production Queue：wrapper `687/687`，`overflow: visible`。
- Closing Detail：修正固定 1070px 后 wrapper `1021/1021`。
- Sidebar：186px → 78px；Workspace 1094px → 1202px；折叠状态跨 Quote/Order/Production 保持。
- Quote Sticky：滚动后可见，top 约 68px。
- Production Group Selector：请求滚动 400/800/1200 时当前数据页均在主滚动最大值 240px 截止；sticky top 始终为 80px，顶栏 bottom 为 68px，左侧内容未形成独立滚动。
- Browser Console：unexpected error/warn 0。
- 真实 1920×1080、Windows 125%、Chrome 125%（约 1229×691 CSS px）由用户在合并 PR #3 前完成最终视觉复验。

## 截图

目录：`docs/ui-redesign/screenshots/second-acceptance-2026-09-04/`

- `quote-list-max-fields-1229.png`
- `quote-list-reordered-columns.png`
- `quote-sticky.png`
- `sidebar-expanded.png`
- `sidebar-collapsed.png`
- `order-detail-clean.png`
- `production-top-clean.png`
- `production-groups-compact.png`
- `production-groups-sticky-scrolled.png`

## 自动门禁

- Relevant tests：17/17 PASS
- Full tests：455/455 PASS
- `npm run typecheck`：PASS
- `npm run lint`：PASS
- `npm run build`：PASS
- Browser Console：PASS
- `git diff --check`：提交前执行
