# 模板设置

## Purpose

在不改动报价业务模型的前提下维护可版本化的 Excel 导出模板。目前正式落地的类型是客户报价单，领域模型已为订单、排单和出货模板预留类型。

## Current behavior

- 路由：`/basic-settings/templates`。
- 支持查看、上传新版本、下载、设为默认、复制、启用/停用、查看支持字段和试导出。
- 上传只接受 `.xlsx`，创建新 `TemplateDefinition`，不覆盖旧版本。
- 当前正式固定标签模板 `quote-export-template-v1.xlsx` 保留为内置默认/fallback；仓库同时提供可维护占位符模板 `quote-customer-placeholder-v1.xlsx`。

## Data model and persistence

`TemplateDefinition` 保存稳定 ID、类型、名称、版本、文件名、默认/启用状态和审计时间。用户模板 metadata 与 Blob 通过 `TemplateRepository` 存入浏览器 IndexedDB `zhixu-export-templates`；默认模板 ID 使用稳定 localStorage `zhixu.erp.local.template-default` 指针。没有把二进制写入 localStorage；数据管理备份会在用户主动导出时把用户模板 Blob 放入备份文件。

## Placeholder and dynamic rows

- 语法：`{{namespace.field}}`。
- 客户报价字段分为 quote、revision、priceVersion、fabric、trim、labor、otherCost、summary、customer 和 styleImage。
- fabric/trim/labor/otherCost 的占位符必须各自在同一模板行；导出器按该行识别动态区域，并把紧随其后的空白预留行作为可替换容量。
- 动态扩行复制行高、单元格样式、合并关系，并重定位后续行与公式引用。

## Important constraints

- 客户报价模板不允许 `{{estimate.*}}`；验证时直接拒绝。
- 客户导出模型没有 EstimateCost 字段，模板映射不得旁路读取 Quote.activeEstimateCost。
- 当前是浏览器 mock 保存；跨设备模板管理、权限和服务端文件存储尚未实现。

## Tests

`tests/template-settings.test.mjs` 覆盖 xlsx 合法性、必填字段、动态行、内部字段隔离、IndexedDB 契约和设置页操作入口。
