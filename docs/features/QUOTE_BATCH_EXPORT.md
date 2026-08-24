# 报价批量导出

## Current behavior

- Quote Center 正常模式不显示 Checkbox；点击“批量导出”进入临时 Selection Mode。
- Selection Mode 把 Foundation Checkbox 放入款式列内容左侧，不新增永久表格列；支持全选当前筛选结果、导出所选和退出清空。
- “报价单”对每个 Quote 读取 `defaultRevisionId`，调用正式客户报价 exporter，一个 Quote 一个 xlsx，一个 PriceVersion 一个 Sheet，最后使用 JSZip 下载 ZIP。
- 单项失败会统计成功/失败数量和失败款号，不会无提示伪装成完整结果。
- “报价汇总表”生成单个 xlsx，默认复用当前个人可见列；本次可调整导出列但不修改 QuoteListViewPreferences。

## Row modes

- 每款一行：复用 Quote Center 的数量汇总、成本 range 和确认汇总规则，禁止偷取第一个 PriceVersion。
- 每 PriceVersion 一行：自动增加“价格版本”列，“总数量”改为“数量”，成本、销售价和确认只读取该 PriceVersion。
- 内部估算字段默认不选；无 active EstimateCost 时保持空白。

## Constraints

列标题和字段值由 `quote-list-column-definitions.ts` 提供，页面与汇总导出不得维护两套含义不同的映射。
