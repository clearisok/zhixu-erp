# Quote Center Excel 报价导出

## Current explicit Server export (2026-10-09; not deployment)

`POST /api/v1/quotes/:id/customer-export` accepts only expectedVersion and exact Revision/PV selection. It reads saved snapshots, requires quote.view/export/cost.view (historical sources also quote.revision.view), uses the unchanged built-in template and shared pure ExcelJS core. Browser IndexedDB/custom-template/image IO stays in the original Browser adapter. One Revision is one workbook, one/all selected PVs are separate sheets; dirty UI offers saved-source export or save first, with no export after failed save.

Current linked customer price comes from exact ConfirmedCommercialTerms, not a second editable PV current; an incomplete provenance fails closed. Historical export uses its own confirmation snapshot. Generation rechecks Quote CAS and linked terms before recording the trusted generation event. No Quote mutation, Estimate projection or claim about saving to user disk. Audit failure returns no file.

The linked writer and export final verification share canonical context locks: sorted exact PV terms contexts before Quote row. A terms change during generation is a source conflict, not a mixed-current workbook. Linked without configured current leaves customer-confirmed price empty instead of falling back to embedded PV confirmation. Shared labor amounts/currency do not replace system labor, assumptions or calculator outputs. The unchanged template/unique ExcelJS builder is regression-parsed from actual Chromium download bytes/SHA-256, including shared price 88.25 with independent system costs; history and null/zero remain covered.

Images use legal Server relations/storage and byte/SHA checks; PNG chunk CRC/decompression/dimensions and bounded JPEG structure are checked. Missing, corrupt or unsupported formats (including WebP without a Server conversion adapter) warn and omit the image; 401/403 do not become warnings. Server templates are not user-uploadable in this phase. Customer downloads are verified/parsed in isolated Chromium; exact executed counts are in AI_HANDOFF. The sections below describe the preserved Browser exporter unless explicitly stated otherwise.

## Purpose

从已保存的 Quote Revision 生成正式 Excel 报价文件。导出以仓库模板为唯一视觉基准，不改变 Quote、QuoteRevision、PriceVersion 或 Repository。

## Current behavior

- 顶部“导出报价”打开导出弹窗，可导出当前价格版本或当前 Revision 的全部价格版本。
- 一个 Quote Revision 对应一个 Workbook；每个 PriceVersion 对应一个 Sheet。
- 默认导出全部价格版本；Sheet 名经过 Excel 非法字符清理、31 字符截断和重复名消歧。
- 历史 Revision 直接导出选中的只读快照。
- 当前 Revision 有未保存修改时，用户可选择“导出已保存版本”或“保存并导出”；新建报价只允许先保存再导出。
- 浏览器端按需加载导出模块及 ExcelJS，不进入报价页首屏 bundle。
- 模板设置可提供占位符模板；正式导出优先读取当前启用的默认模板，读取失败时回退内置正式模板。
- Quote Center 批量报价单导出复用同一构建器，一个 Quote 使用自己的 `defaultRevisionId` 后写入 ZIP。

## Business rules

- 一个 Revision 仍生成一个 Workbook，一个 PriceVersion 生成一个 Sheet。每张 Sheet 的制作国家标题、加工币种、加成率和工价结果只读取该 PriceVersion 的 `pricingParameters` 快照，不读取统一 Revision 参数或实时系统预设。
- 面料单耗由正式 calculator 先计算原始 kg/meter 公式，再按第五位四舍五入规范为四位业务值。成本、UI 和 Excel 共用该值；Excel 写入真实 number，并为正式模板及动态占位符插入行统一设置 `0.0000`。
- 历史 Revision 本体不会因精度规则被批量改写；历史导出在读取既有输入快照后通过同一 calculator 生成四位单耗。

- 正式模板为 `templates/quote-export-template-v1.xlsx`，源模板不得被运行时代码改写。
- 可维护模板使用 `{{namespace.field}}` 占位符；fabric/trim/labor/otherCost 行按字段命名识别并动态复制，不依赖固定行号。
- 客户报价导出输入模型不含 EstimateCost，且模板验证拒绝 `{{estimate.*}}`，内部估算数据不得进入客户文件。
- 模板区域通过稳定中文标签定位，不把固定行号当作业务契约。
- 面料、辅料、加工费、外协、其他费用五个区域均使用同一动态扩行规划；下方区域、合并单元格、款式图与签字区随之下移。
- 导出数值调用 Quote Center 现有计算函数和汇总结果；Excel 文件写入确定值，不建立第二套公式。
- 空值保持空白，用户明确输入的 0 才写入 0。
- 加工币种为 CNY 时，“RMB/件”写入原始 CNY 工价，“USD/件”留空；加工币种为 USD 时，“RMB/件”写入 Quote Center 现有计算结果中的人民币工价，“USD/件”写入用户原始录入的 USD 工价。导出器不自行执行 USD × 汇率。
- 面料说明只组合非空的成分、净门幅和克重，不导出段长或损耗率；分隔符只在相邻有效内容之间生成。
- 面料数据行的“面料说明”单元格统一使用宋体 9 号，并保留模板换行与动态行高；该规则同样应用于动态扩展行，不修改表头或其他列字体。
- 最终报价按 Active D-033 与共享 formatter 的一位小数截断规则输出 `FOB RMB x.x`，不是四舍五入。
- 款式图仅通过 `styleImageAttachmentId` 读取现有 AttachmentRepository；图片 contain 居中，不拉伸。缺失或损坏时保持图片区空白并给出导出警告。

## Data model

导出不新增持久化业务模型。运行时输入为 `Quote`、精确选中的 `QuoteRevision`、该 Revision 中用户选择导出的 `PriceVersion[]`，以及可选的款式图二进制。导出映射只生成临时 Workbook 数据。

## API and persistence

- 不调用后端 API，不写数据库，不修改 QuoteRepository。
- 模板由构建产物中的静态资源加载。
- 用户模板 metadata/Blob 经 TemplateRepository 存入 IndexedDB；内置正式模板始终保留为 fallback。
- 款式图通过 `AttachmentRepository.get(styleImageAttachmentId)` 读取 IndexedDB Blob。
- 生成的 Workbook 只在浏览器内存中构建并通过下载保存。

## Frontend behavior

- 弹窗：`features/quote-center/components/quote-export-modal.tsx`
- 页面接入：`features/quote-center/components/quote-editor.tsx`
- 构建器：`features/quote-center/export/quote-excel-exporter.ts`
- 占位符构建器：`quote-placeholder-excel-exporter.ts`
- 模板领域与页面：`features/template-settings/`
- 批量报价/汇总：`quote-batch-exporter.ts`
- 模板定位/扩行：`quote-export-template-layout.ts`
- 数据映射：`quote-export-mappers.ts`
- 文件名、Sheet 名和舍入：`quote-export-formatters.ts`
- 图片布局：`quote-image-layout.ts`

## Important constraints

- 不得修改模板文件来适配代码；应修改定位、映射或扩行逻辑。
- 不得从当前编辑状态覆盖历史 Revision 的导出来源。
- 不得重新实现成本公式；映射器必须调用现有计算函数。
- 不得将 ExcelJS 改为静态页面依赖。
- 不得让模板 mapping 接触 Quote.activeEstimateCost；EstimateCost 只允许作为内部汇总表的显式可选列。
- 打印区域固定为正式宽度 `A:L`，高度使用扩行后的最后一行，横向适配一页。

## Tests

- `tests/quote-excel-export.test.mjs` 覆盖模板完整性、Sheet 命名、多价格版本、五区域扩行、面料说明字段组合与宋体 9 号、空值/零值、两种面料单位、CNY/USD 工价双列、计算值、最终报价、历史快照、dirty guard、图片布局和打印区域。
- 验收文件 `outputs/quote-excel-export-20260822/quote-export-test.xlsx` 包含多 Sheet、7 条面料、10 条辅料、5 条加工费、3 条外协、5 条其他费用、超长文字和款式图。

## Known gaps

- 当前 PriceVersion 模型没有独立的多行外协数据；模板和通用扩行引擎已支持外协区域，当前实际导出保持该区域空白。
- 附件仍为本机 IndexedDB 数据，因此跨设备打开同一 mock 报价时可能无法读取款式图。
- ExcelJS 的浏览器导出 chunk 体积较大，但已按需加载，不影响报价页初始加载。
