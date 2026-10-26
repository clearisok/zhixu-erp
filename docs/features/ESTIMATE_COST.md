# 估算成本

## Purpose

为内部成本判断提供 **Quote 级独立快照**（D-018），从某个 QuoteRevision 的 PriceVersion 复制成本来源。它不属于 Revision，不是 PriceVersion，也不能进入客户报价 Excel（D-017）。

## Current behavior

### Server 当前加工模式的命令边界（2026-10-24，本地前向候选）

D-145 的加工仅工价投影已隐藏 Estimate；对应 Server 写入口按已保存的 `defaultRevisionId`
判断类型。当前默认 Revision 为加工时，生成、重新生成、编辑、恢复和忽略均返回
`409 estimate_not_applicable`，不生成身份、不保存版本或成功审计。请求的来源 Revision、
历史查看状态和 `currentRevisionId` 不能改变这个判断。旧 Estimate 与材料/成本事实完整保留，
普通资料保存不得清空它们，读取继续省略 Estimate 字段并标为 restricted。

这是既有8ce227d0切片的当前main前移，不把此前允许隐藏写入的行为冒称已受保护；
不改变 Browser。下述 Server 通用生命周期适用于当前默认为经销的报价，历史中含加工
不导致整单被封禁；来源 PV 已删除后的历史恢复规则继续有效。未合并或部署。

### 通用生命周期

- 报价版本 Modal 顶部顺序为：成本、V1、V2…、更新报价版本。
- 新 Quote 的 `activeEstimateCost` 为 `null`；只有用户主动选择某个 QuoteRevision 生成时才创建。
- 生成时选择来源 PriceVersion（显式 ID；未指定时选基础价格，再回退首项），深复制面料、辅料、工价、其他费用和报价参数，并为 Estimate/成本行生成新 ID。Server 显式来源 ID 不属于所选 Revision 时拒绝，不静默回退。
- 当前估算允许编辑原面板字段值，但不允许增删/重排面料、辅料或其他费用行、替换行身份，也不提供保存到基础库入口。pricingParameters、来源/创建信息不属于编辑输入权威。
- 重新生成会把当前估算归档；历史支持按来源 Revision、创建人和时间搜索，只读查看。
- 恢复历史会 Clone 为新的 active EstimateCost/成本行身份和可信创建信息，归档之前 active；历史对象本身不变，`basedOnRevisionId` / `sourcePriceVersionId` 保持原来源。来源 PV 后来被删除仍可独立查看/恢复，不重新计算历史。
- 查看历史 Revision 不等于 Quote 级当前估算只读；当前估算按自身权限可编辑，真正的历史 Estimate 始终只读。

## Stale rules

当 `activeEstimateCost.basedOnRevisionId !== quote.defaultRevisionId` 时显示过期提醒。忽略只记录当前 `defaultRevisionId`；再创建新的默认 Revision 时会重新提醒。按当前 Revision 重新生成前必须确认。

## Data model and persistence

`Quote` 持有一个 `activeEstimateCost` 和多个 `estimateCostHistory`。默认 Browser 路线的 mock repository 随 Quote JSON 保存它们；旧存储读取时补成 `null`/空数组，namespace 与旧真实数据不变。

显式 Quote authority=server（masters=server、writer=writable）已接正式 RevisionManagerModal / EstimateCostPanel / QuoteEditor 日常闭环。复用 `0005_quote_foundation.sql`、既有 Quote repository 和快照表，无新 migration。Server 复制/持久化使用精确 decimal-string，null 与零区分，不以 JS Number 转换历史快照；Editor 沿用无损 adapter/precision gate，无法无损写回时阻止保存，不舍入后提交。

## Server commands and compatibility

`POST /api/v1/quotes/:id/estimate-workflows` 使用 typed client、trusted service 与既有 repository transaction：

| Action | Input beyond action/expectedVersion | Boundary |
| --- | --- | --- |
| `estimate.generate` | sourceRevisionId、可选 sourcePriceVersionId | 已保存来源，必须尚无 active；已有 active 返回409，不隐式归档 |
| `estimate.update` | 当前 estimate mirror | 仅原面板字段值；结构、ID、来源、创建信息、pricingParameters 必须与保存值一致 |
| `estimate.regenerate` | sourceRevisionId、可选 sourcePriceVersionId | 必须已有 active，完整归档后建立独立快照 |
| `estimate.restore` | 历史 estimateId | 绑定本 Quote 历史；克隆，不改历史，不要求来源 PV 仍存在 |
| `estimate.ignore` | 当前 estimateId | 只记录当前 defaultRevisionId，下次新默认版本再次提醒 |

来源/目标跨 Quote、未知字段、伪造 actor/time/history 等 fail closed。身份与 generatedAt/generatedBy 由 Server 决定；每个有效命令的 active/history、Quote version 和可信 Quote OperationLog（metadata.workflowAction）同事务提交，child/audit 失败全部回滚，并发 expectedVersion 仅一方成功。不改 Quote 状态、默认 Revision、确认、来源 Revision/PV、附件或基础资料。

Runtime generic aggregate PUT **不能改变任何 Estimate slice**，即使调用者有编辑权限也须走专用命令；差异返回409 `estimate_command_required`。内部 repository 合法持久化/测试仍保留，不削弱历史不可变。

Quote / Estimate 权限耦合已在本 PR 内修复，而非新增角色政策。`quote.view` 可读报价及已授权历史，不因他人生成 Estimate 而整体403。可信身份无 `estimate.view` 时，GET、创建、普通保存与 Revision/PV 响应集中投影为 `estimateVisibility: restricted`，完全省略 active/history 字段，不返回存在性、历史条数或汇总；有权限则保留完整 Estimate。Editor 使用独立视图类型保留“未授权返回”状态，不伪造成 null/[]，不加载估算面板/计算/缓存；成本入口显示无查看权限。

普通 PUT 只提交 Quote 内容；Server 在 expectedVersion 校验后合并当前已保存 Estimate，仍对完整领域实体执行原 normalize/validate、细粒度权限、历史不可变与 repository CAS/事务检查。缺失字段不是清空命令；无 Estimate 读权限者注入任何 Estimate 字段（包括 null/[]）返回409 `estimate_command_required`。有读权限者的旧完整请求仅兼容原样切片，任何变化仍拒绝；Estimate 修改只走专用命令，需要 `quote.edit` + `estimate.view` + `estimate.edit`。读权限不授予写权限，默认角色/权限目录不变。

## Draft and failure behavior

- Estimate 与整单保存、附件、Revision/PV 共用每个 Editor 的 expectedVersion、baseline 和排他锁。
- 仅编辑当前 Estimate 时发送一个专用 update；混合 Quote/Estimate 草稿先保存 Quote 内容（Server 保留受保护 Estimate slice），再用最新版本保存 Estimate。它们是分步事务，不是跨两个请求的原子保存。
- 生成/重新生成/恢复前 dirty 必须明确保存后继续或取消；关联成本差异先完成既有同步范围选择并保存，再由用户主动继续，不能自动跳过。
- 前一步保存成功、后一步失败如实分别提示；409/网络未知保留未保存草稿、来源或历史选择，立即提供核对入口。blocked 后不自动重试、不继续后续命令、不落 Browser；成功采用 Server 响应更新 version/baseline/current UI。

## Engineering verification and rollout

本 PR 的权限 follow-up 增加不同可信身份的 API/实际 Chromium 验收：普通报价读取/保存/版本命令不耦合 Estimate 权限，响应/页面/缓存隔离、注入拒绝与并发保护；原生命周期、精度、事务回滚和失败草稿回归保持。最终实测数字统一见 `AI_HANDOFF.md`。

HISTORICAL 工程 tests 在 checkpoint `3da2234b82cca7baebb59febca42c3fdad00352b` 已执行，当时文档收口未重复运行。实际 Chromium 包括两类型完整流程、来源选择、历史只读/克隆、stale/ignore、历史 Revision 下当前估算编辑、dirty 取消/同步、save-first 与保存/恢复409/network；保留下载字节/SHA-256等回归，无 unhandled rejection、cleanup PASS。各 suite 数字统一见 `AI_HANDOFF.md`，不在此重复流水账。

仅 disposable PostgreSQL、合成数据、临时 Chromium profile 与测试 storage 验证；**尚未真实部署，不代表全报价 production-ready**。默认 Browser/旧 runtime 未变，D-096 historical import NOT REQUIRED；无真实 schema activation/DB/Browser/COS/secret 操作。

## Important constraints

- EstimateCost 不属于 QuoteRevision 或 PriceVersion，编辑不能污染来源快照。
- 客户报价 exporter 和模板字段表不得暴露任何 EstimateCost 数据。
- 报价汇总表是内部文件，可以按用户本次选择导出估算总成本、来源 Revision 和销售价差额；这是既有 Browser 导出契约，不表示 Server 导出已接通。
- Server 客户导出 UI/API 仍未接线；复用的客户报价输入模型与模板校验继续排除 Estimate，checkpoint 保留隔离回归，不能将内部估算接入客户报价模型。
