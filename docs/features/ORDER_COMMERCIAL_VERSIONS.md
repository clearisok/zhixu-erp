# 订单商业版本与报价中心议价

2026-10-19；工程基线 main `996dfedc12da3527343cd3ff2aa5eea35497e10e` 已包含 PR108–119。以下是 D-122/D-145 的当前实现；部署与人工接受另行核实。[原阶段记录](../tasks/completed/2026-10-19-pre-stabilization/ORDER_COMMERCIAL_VERSIONS.md)保留旧日期、SHA、结果和限制。

## 唯一事实与不可变历史

Quote / Revision / PriceVersion 保存产品规格、工艺与报价方案。报价 CCT 是客户确认来源，存在则空值也不回退；不存在才使用已保存 PV 确认。`confirmation-source.ts` 统一列表、汇总、导出、商业采用的确认口径。

订单实际价格只读 `sales_order_commercial_heads` 指向的不可变 `sales_order_commercial_versions`。0015 的历史统一价仍可读；0028 在同一模型增加 `sales_order_commercial_lines`、稳定颜色身份、来源及产品快照，不建立另一张可变当前价格表。每项保留精确 Quote/Revision/PriceVersion、来源 CCT/Quote 版本、确认依据、成交价、工价、币种、原因与采用人。已删除或修改报价不覆盖订单历史。

销售价沿既有 CNY 口径，工价保留 CNY/USD；零有效，未确认与不适用不等于零。本模块不新增换汇或成本计算。多色价格不能通过旧标量接口返回第一项或平均值；旧 v1 不适用时明确拒绝。

## 维护来源和加工边界

订单中心仅首次匹配报价并采用已确认价格，不开放输入成交价；已有商业版本不能从订单中心覆盖。合同类先可信接纳，无负责人/认领前置，新翻单写入口已退役。[来源 API 和交互](ORDER_BUSINESS_SOURCE.md)是当前说明。

加工类由下单批次消费产生并固定报价依据与实际确认工价，不进入成衣议价或报价上下文来源替换。预览和提交都调用同一来源上下文校验；直接 POST、重复请求或更换请求键不能绕过批次边界。旧已提交请求的回执读取不生成新商业版本。原批次、价格和产品快照保留。

## 单独与批量议价

0029 保存统一议价操作、逐单尝试与回执；单笔是仅一张订单的批次，最多25单。每单所有颜色、商业 head、审计和成功回执同事务。金额增减、百分比、统一价采用精确十进制，负成交价拒绝；不改工价、币种、CCT、PriceVersion 或成本。

- `GET /api/v1/quote-order-prices` 查询关联订单。
- `/api/v1/order-price-adjustments/preview` 预览；POST 主资源提交；`/requests/:id` 核对回执、`/resume` 按原计划只处理未成功项。
- 全局、报价内、订单内历史引用同一操作和精确前后商业版本。修正追加版本，不删除旧记录。
- 报价详情“关联订单”和列表“更多 → 批量调整订单成交价”复用同一服务；订单中心只读。
- 来源改配仅报价上下文命令可用，仍检查采用及调价权限、两类金额查看、订单与来源版本；加工类拒绝。创建身份和执行流水不改变。

可信 session、fresh DB grants、来源锁、订单 CAS、预览指纹、actor/request 唯一键与审计继续生效。`quote.order_price.adjust` + sale.view/edit 不授予工价或成本；其他金额单独投影。已完成/取消、命令冻结、无效历史订单继续阻断，Server 完整关账尚未实现，不能声称本模块已补齐。

## 展示、恢复与验收

全单同价显示统一价，可展开方案映射；不同价按颜色显示。方案汇总按“方案 ID + 实际可见价格 + 币种”分组：同方案不同议价必须分开；不同方案同价不合并；受限字段只按已投影内容呈现，不借分组泄露金额。混合价格摘要不把空标量称为“不适用”。

提交未知结果先核对原回执。sessionStorage 仅保留当前用户范围的请求 UUID，不存金额/原因/令牌；刷新后未找到回执不等于未执行。旧 Order CCT 写入口拒绝，报价 CCT 仍是报价确认渠道。历史切换预览只读，不能把当前价冒称最初下单价。

回归入口：`test:order-commercial`、`test:order-business-source`、`test:order-sale-adjustments`、`test:processing-quote-push` 及对应 UI 测试。2026-10-19 稳定化记录见 [任务证据](../tasks/active/price-source-stabilization-2026-10-19.md)。
