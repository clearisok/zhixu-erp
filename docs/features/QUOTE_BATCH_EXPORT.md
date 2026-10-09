# 报价批量导出

Explicit Server mode supports temporary cross-page selection by Quote ID/version,
accurate “本页全选”, maximum 25 Quotes/100MB and sequential generation with the
shared customer workbook core. Each default Revision/all PV selection is bound
before generation; no simultaneous global snapshot claim. ZIP contains a verified
minimal manifest and collision-safe names; partial/all-failed results are explicit,
all-failed produces no empty download. Estimate is excluded; no Browser IO.

Per-item image/build warnings survive in `export-results.json`; the bounded response and UI show the affected selections/counts rather than silently calling the batch clean. Manifest/audit preserve safe Quote style identity, Revision label and PV ID/name/manufacturing-country snapshots, not internal amounts or Estimate. One-item generation logs remain factual even if a later ZIP stage fails; partial success never claims rollback of generated items. Internal estimate summary export remains deferred. The following legacy Browser batch/summarization behavior is unchanged, not an enabled Server summary path.

## Current behavior

- 每次成功导出后追加 OperationLog：除选择数、成功/失败数或导出行数外，还保存全部所选 Quote 的稳定 ID、款号、款名、Revision ID/Label 与 PriceVersion 制作快照摘要。日志详情页可以折叠查看完整清单，折叠不会截断持久化数据。

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
