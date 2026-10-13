# 6087050 QtyUnit 定向确认与最小映射候选

核实日期：2026-10-13。GitHub main SHA：`8b3f3d811d05182ea1a7f3214eae9d530056fa04`；PR #104 开放，head `b43b78bee72a496219bd4872245ad28109f421c4`；PR #105 开放 Draft，head `d8b01171841dbca622dd320808371334a5d87676`，以 PR #104 分支为 base。本文件随真实来源契约、用户业务决定、依赖 PR、CI、Source 激活或合并状态变化更新；旧报告保留原时点。

## 已确认事实

- 用户在本机私密终端再次运行现有定向只读工具。输出为 `READ_ONLY_TARGETED_DIAGNOSTIC_RECORDED`，一合同 6087050 完整分页、14 次固定报表请求、目标采购四来源行与三预期槽位。受限且 Git 忽略的本机报告 SHA256 为 `08370e965531ab55d7edb2ee30a4d9addfb3c76747de0f0681584acd2bc2c744`；仅本机当前操作人和 SYSTEM 有访问控制项。未读取或保存凭据、未访问织序数据库、未激活 Source。
- 四条目标来源行的原始 `QtyUnit` 均为“个”。三需求的采购数量为 118/356/6；其中 356 对应两条来源行和一笔归并采购事件，不能加为 712。物料编码、名称、颜色、规格、采购单号与日期在报告中分别对应；逐行原值/单号/身份只保存在本机受保护报告，不写入 Git。
- 用户确认三组物料编码与艾诺科界面一致，并转述 IT 已确认 `QtyUnit` 是每条需求的来源计量单位，适用于 `TotalNum`、`cgnum`、`rknum`、`CYNum`、`OutStoreNum`。这是用户提供的业务确认，不是 IT 原始书面证据，也不能推断所有合同均有非空或无冲突单位。
- 原诊断工具输出的 `lineIdentityVerified=0`、`unitMappingVerified=false`、`humanBusinessAcceptance=not-performed` 是工具生成时的技术状态，尚未被工具改写；本次人工确认是独立的后续证据，不能将其冒充为工具自动验证。此前 62 合同的未知数量仍未知，不能以本样本改为零或推断全体原因。

## 用户决定与 AI 工程建议

用户授权在三样本身份和语义确认后，提出独立最小单位映射 PR；保持现有 UI，不修改真实数据、账号、数据库、正式齐套公式或部署，不自动合并。工程候选采用 `quantityUnit <- QtyUnit`，共用 Normalize/Dedup 仍保持原事件身份；只读 Projection 逐需求校验单位，一致非空才展示，缺失仍未知，冲突停止该需求的投影数量汇总和状态判定。不同需求/单位不跨行合计，历史 Excel 不凭名称猜列。

## 待确认与依赖

- 这次没有全量扫描所有合同的 `QtyUnit` 完整度、冲突率或业务异常；目标样本不能作为上线验收。真实持续采集/首绑、可信账号权限和宁波环境仍是独立 Gate。
- PR #104 需先处理，PR #105 依赖 #104；本单位映射 PR 以 #105 分支为 base，三者均未授权自动合并或部署。
- 工程证据路径：`features/style-progress/source/ainuoke-material-api-adapter.ts`、`features/style-progress/source/material-source-row.ts`、`features/ainuoke-material-progress/projection.ts`、`tests/ainuoke-material-progress.test.mjs`。私有逐行报告路径不公开、不得提交。
