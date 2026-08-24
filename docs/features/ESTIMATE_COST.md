# 估算成本

## Purpose

为内部成本判断提供独立于客户报价的 Revision 级快照。它不是 PriceVersion，也不能进入客户报价 Excel。

## Current behavior

- 报价版本 Modal 顶部顺序为：成本、V1、V2…、更新报价版本。
- 新 Quote 的 `activeEstimateCost` 为 `null`；只有用户主动选择某个 QuoteRevision 生成时才创建。
- 生成时选择来源 PriceVersion（显式 ID、基础价格或首项回退），深复制面料、辅料、工价、其他费用和报价参数，并为成本行生成新 ID。
- 当前估算允许编辑值，但不允许增删面料、辅料或其他费用行，也不提供保存到基础库入口。
- 重新生成会把当前估算归档；历史支持按来源 Revision、创建人和时间搜索，只读查看。
- 恢复历史会 Clone 为新的 active EstimateCost，历史对象本身不变，`basedOnRevisionId` 保持原来源。

## Stale rules

当 `activeEstimateCost.basedOnRevisionId !== quote.defaultRevisionId` 时显示过期提醒。忽略只记录当前 `defaultRevisionId`；再创建新的默认 Revision 时会重新提醒。按当前 Revision 重新生成前必须确认。

## Data model and persistence

`Quote` 持有一个 `activeEstimateCost` 和多个 `estimateCostHistory`。mock repository 随 Quote JSON 保存它们；旧存储读取时补成 `null`/空数组。

## Important constraints

- EstimateCost 不属于 QuoteRevision 或 PriceVersion，编辑不能污染来源快照。
- 客户报价 exporter 和模板字段表不得暴露任何 EstimateCost 数据。
- 报价汇总表是内部文件，可以按用户本次选择导出估算总成本、来源 Revision 和销售价差额。
