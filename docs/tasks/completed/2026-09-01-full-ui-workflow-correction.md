# 2026-09-01 Full UI / Workflow Correction

状态：PASS

## Delivery commits

- Gate A — Foundation + Quote：`367983925f8e9236a701a71781054f6baaf65e78`
- Gate B — Order + Production + Style Progress：`9098f903f9d76ff647dcebacbde46ce7ebfe0de4`
- Gate C — Closing Center：`be464c6476c8a6b596f26229d0022481ffb0fb2b`

## Page 1–16 feedback mapping

| Page | Feedback requirement | Delivered behavior | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | 报价列表文字、无核心横向滚动、款式图、普通与 `/` 搜索 | 1229 下无 document overflow；款式缩略图；普通 token AND、structured AND 与组合搜索 | PASS | [Quote List](../../ui-redesign/screenshots/full-ui-2026-09-01/quote-list-1229.png) |
| 2 | 返回层级、其他费用、最终报价明细、“更多”不裁切 | PageBack 与标题同层；其他费用指标；Cost Breakdown Drawer；Portal 菜单 | PASS | [Final Price Drawer](../../ui-redesign/screenshots/full-ui-2026-09-01/quote-final-price-drawer.png) |
| 3 | 报价详情折叠与稀疏布局修正 | 详情按工作区重新收敛，完整编辑与摘要层次保持一致 | PASS | [Quote Detail](../../ui-redesign/screenshots/full-ui-2026-09-01/quote-detail-1229.png) |
| 4 | 1229 显示面辅料行，不使用半屏大卡 | 成本区按实际容器宽度采用紧凑表格/分组，不产生 document overflow | PASS | [Quote Detail 1229](../../ui-redesign/screenshots/full-ui-2026-09-01/quote-detail-1229.png) |
| 5 | 附件直接粘贴、嵌套选择、实际 fallback、菜单与订单月份筛选 | Attachment 直接 Ctrl/Cmd+V；品牌/业务员 nested picker；显示实际继承值；订单按交期月份筛选 | PASS | [Master More Menu](../../ui-redesign/screenshots/full-ui-2026-09-01/master-more-menu.png) |
| 6 | 订单详情字段权威边界与紧凑状态 | 销售合同号、工厂款号、来源只读；客户 PO/客户/国家不重复编辑；状态收敛 | PASS | [Order Detail](../../ui-redesign/screenshots/full-ui-2026-09-01/order-detail.png) |
| 7 | 订单详情重叠 | Header、Tabs 与业务区重新排布，六档 viewport 无 document overflow | PASS | [Order Detail](../../ui-redesign/screenshots/full-ui-2026-09-01/order-detail.png) |
| 8 | 去重数量/交期、颜色级取消、颜色区滚动、生产入口 | 颜色取消以 append-only adjustment 保存；无颜色内部滚动；生产行提供真实入口 | PASS | [Color Cancel](../../ui-redesign/screenshots/full-ui-2026-09-01/order-color-cancel.png) |
| 9 | “查看订单/物流”进入对应页面 | 生产队列使用真实订单与款式进度/物流导航 | PASS | [Production Row](../../ui-redesign/screenshots/full-ui-2026-09-01/production-order-row.png) |
| 10 | 款式颜色筛选、面辅料折叠、收窄无横向滚动 | 颜色筛选实际改变投影；面/辅料可折叠；1229 无 document overflow | PASS | [Style Color Filter](../../ui-redesign/screenshots/full-ui-2026-09-01/style-progress-color-filter.png) |
| 11 | 排单重复按钮与“更多”真实动作 | 重复入口收敛；行内动作进入排单、款式进度或价格调整 | PASS | [Production Row](../../ui-redesign/screenshots/full-ui-2026-09-01/production-order-row.png) |
| 12 | 日常导航移除 Ainuoke Sync | 订单中心日常二级导航只保留订单、款式进度、风险预警 | PASS | [Style Progress](../../ui-redesign/screenshots/full-ui-2026-09-01/style-progress-d1935-1229.png) |
| 13 | 物料/运输不维护重复日期 | 生产页只消费 Style Progress Projection，不再维护第二套手工物料日期 | PASS | [Material Projection](../../ui-redesign/screenshots/full-ui-2026-09-01/production-material-projection.png) |
| 14 | 生产物料状态联动、空提交错误层级 | Style Progress 是唯一物料投影；Modal 校验错误在可见高层展示 | PASS | [Material Projection](../../ui-redesign/screenshots/full-ui-2026-09-01/production-material-projection.png) |
| 15 | 生产左组 sticky、关账错误同层 | 生产组总览 sticky；关账 Error Layer z-index 1400，高于 Modal | PASS | [Closing Error](../../ui-redesign/screenshots/full-ui-2026-09-01/closing-modal-error.png) |
| 16 | 经销售价、加工币种默认、关账总览/详情/月切换/已生产、确认与锁定 | 售价可编辑；系统默认加工币种 USD 仅初始化新事实；月份倒序/分组/状态筛选；详情按月切换 KPI/行；confirmed ≠ locked | PASS | [Closing Overview](../../ui-redesign/screenshots/full-ui-2026-09-01/closing-overview.png), [Closing Detail](../../ui-redesign/screenshots/full-ui-2026-09-01/closing-detail.png) |

## Responsive and browser QA

- 覆盖宽度：1600、1280、1229、960、768、402。
- 代表页面：Quote List、Quote Detail、Order Detail、Production Scheduling、Style Progress、Closing Overview、Closing Detail。
- 42 个页面/宽度组合均无 document-level 横向溢出。
- Gate A 的 nested picker、实际 system fallback、Dropdown/Modal/Toast Portal、Attachment Ctrl/Cmd+V 与最终报价 Drawer 已做真实交互复验。
- unexpected console error：0。
- QA 数据只在隔离 Browser QA profile 中追加或调整；未清除用户或正式业务数据。

## Regression

- Relevant tests：PASS。
- Full tests：447/447 PASS。
- `npm run typecheck`：PASS。
- `npm run lint`：PASS。
- `npm run build`：PASS。
- `git diff --check`：PASS。

Gate C 收口前曾出现一次 ESLint manual memoization 报错；代码已修正，随后 lint 与完整 Final Gate 均通过。不存在被隐藏的正式失败。

## Screenshot set

新截图位于 `docs/ui-redesign/screenshots/full-ui-2026-09-01/`，共 13 张；Legacy Audit 目录未覆盖。
