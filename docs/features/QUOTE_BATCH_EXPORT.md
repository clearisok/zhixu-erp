# 报价批量导出

## Current explicit Server internal summary

`POST /api/v1/quotes/internal-summary` accepts only up to 25 unique saved Quote IDs/positive expectedVersions, `rowMode` (`quote` / `price-version`), strict nonduplicate business column keys and explicit Estimate keys. At most 500 rows / 20MB; limits fail instead of truncating. All-or-nothing: any required missing source, unsafe decimal, version conflict or audit failure returns no workbook. This is separate from the partial-success customer ZIP path.

One repeatable-read snapshot loads selected default Revisions/PVs in fixed batch queries, never full aggregates/history or per-row HTTP. Costs use saved pricing/material snapshots and existing calculator; no defaults, conversion policy, profit algorithm or workbook business formulas. Null and zero remain distinct typed cells; money qualifiers and ranges retain currencies, integer quantity uses an integer format and fractional quantity General (no persistence rounding), dates retain unambiguous saved ISO text. User-entered names are strings, not formulas/links. The original green headers, freeze/filter and width basis are shared through `quote-summary-core.ts`; Server body text wraps. Browser summary mapping and IO remain unchanged.

Current confirmation uses exact per-PV linked CCT vs unlinked saved snapshot, not aggregate status. Linked empty is unconfirmed; incomplete provenance rejects a confirmation-dependent summary. Confirmation cell notes distinguish source/current version. During file building no write locks are held. Before generation audit, acquire sorted terms contexts then sorted Quote rows, verify Quote CAS and independent current binding/CCT versions. A terms-only update can reject generation despite unchanged Quote.version; no automatic retry.

Estimate default is none and no Estimate query/input/cache is created in that case. Explicit `estimateTotal`, `estimateRevision`, `estimateDifference` use only Quote-level active, never history fallback. Active snapshot remains readable after source PV deletion; stale/ignored old source is labeled accurately. PV rows repeat the same Quote-level Estimate, not a new per-PV estimate or summed profit. Difference preserves the existing raw garment selling price minus estimate pre-markup total (not truncated display or customer-confirmed price).

Trusted generation audit stores bounded source IDs/revisions/PVs/versions, selected keys, row mode/count and file name/bytes/SHA-256 only, not amounts, Estimate object/existence/history or workbook binary. Success means file generated, not proof of user saving to disk. Account-scoped local UI preference holds only column keys/order/width; temporary export settings never overwrite it. Permission dependencies are in `PERMISSIONS.md`.

Explicit Server mode supports temporary cross-page selection by Quote ID/version,
accurate “本页全选”, maximum 25 Quotes/100MB and sequential generation with the
shared customer workbook core. Each default Revision/all PV selection is bound
before generation; no simultaneous global snapshot claim. ZIP contains a verified
minimal manifest and collision-safe names; partial/all-failed results are explicit,
all-failed produces no empty download. Estimate is excluded; no Browser IO.

Linked current selections reuse the same customer-export service and canonical terms→Quote final verification; no second mapping/normalization or batch shared-current writer exists. Missing linked current does not fall back to PV confirmation. History continues to use its own snapshot. Controlled one/multi-PV export conflict tests and actual cross-page ZIP/partial-failure regressions preserve these existing boundaries.

Per-item image/build warnings survive in `export-results.json`; the bounded response and UI show the affected selections/counts rather than silently calling the batch clean. Manifest/audit preserve safe Quote style identity, Revision label and PV ID/name/manufacturing-country snapshots, not internal amounts or Estimate. One-item generation logs remain factual even if a later ZIP stage fails; partial success never claims rollback of generated items. Internal summary is now a separate explicit Server endpoint as documented above. The following legacy Browser batch/summarization behavior is unchanged.

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

2026-10-17 D-145：ZIP、内部汇总和加工推送共用显式选择模式，复选框固定左侧，跨页保持精确Quote及版本；“退出选择”紧邻生成/确认按钮右侧，不在更多里。加工推送移到更多。纯加工内部汇总移除材料/成衣及Estimate列，混合汇总的加工行对应值为空，不输出隐藏金额。列表个人偏好不保存辅助select/action列，原Browser存储不变。
