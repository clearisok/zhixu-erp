# QtyUnit 定向只读复核：来源字段已出现，语义待确认

核实日期：2026-10-13；GitHub main SHA：8b3f3d811d05182ea1a7f3214eae9d530056fa04。PR #104 head b43b78bee72a496219bd4872245ad28109f421c4 仍开放；本页属于其后草稿 PR #105 的增量证据。GitHub 是实时工程事实源，本页是一个有时点的脱敏快照。真实合同号、物料编码、来源行身份和采购单据仅保留在本机受限且 Git 忽略的报告。

## 已确认事实

- 本机发现新受保护报告，schema 为 ainuoke-targeted-diagnostic.v1，结果为 READ_ONLY_TARGETED_DIAGNOSTIC_RECORDED。文件 12085 字节，mtime 2026-10-13T03:24:45.2988793Z，SHA256 3e83eb9d31150981f7796555ff45484935e19c9a36cec4e2e2d2fd2e26698e09。报告继承受保护 outputs/ 目录的当前操作人和 SYSTEM ACL，Git 忽略。本轮未获取凭据、未运行真实登录；文件元数据和脚本结果不能独立证明具体操作者或上游签名。
- 该报告完成一遍当前账号可见 6086103 Discovery（558 合同、12 页），三合同完整 6087050，共 18 次固定报表请求。它生成于本轮把本机私有请求范围缩小至目标单之前；不误称只读取了一份物料合同，也不把它当成两遍 Discovery 或全量物料核对。
- 目标采购单四条 6087050 来源行中，QtyUnit 候选字段四条均有原始值“个”，对应三个预期数量槽位；数量 356 的两条来源行仍归并为一个采购事件。与此前无 QtyUnit 的受保护报告比较，四条来源行身份均变化，但物料名称/编码/颜色/规格、采购单号/日期/数量和三个归并采购事件身份不变。没有把两条来源行数量相加。
- 新报告目标合同的“同一需求非空候选单位冲突”计数为 0；该计数不证明所有来源行都有 QtyUnit，也不证明字段适用于所有业务流。报告自身仍标记 unitFieldMeaning=unverified、humanBusinessAcceptance=not-performed、lineIdentityVerified=0 和 unitMappingVerified=false。当前正式 Adapter 未映射 QtyUnit，页面只读投影单位仍为 null。

## 用户陈述与待确认问题

用户转述 IT 已在《面辅料申购统计》增加 QtyUnit；旧截图三行的界面单位均为“个”。两项与此次原始字段值一致，但字段名称和值本身不能证明它是每条需求的统一来源计量单位。仍需 IT 或业务方确认：QtyUnit 是否同时约束 TotalNum（需求数量）与 cgnum（采购实际数量），以及同一需求的入库、出运、出库数量是否同口径。若仅适用于部分数量，映射范围必须收窄；不能用规格推算单位、默认“个”或改动原数量含义。

当前无需重复真实读取。只有字段语义与三行身份获得确认后，才独立提出最小单位映射 PR；优先用每条需求一个来源单位，空值保持未知，冲突阻止错误汇总且报告，保留理论用量与采购实际数量两个事实，并对缺单位、不同单位、重复行和来源变化做负向测试。不得修改正式齐套公式、真实数据、业务数据库或部署，不自动合并。

代码依据：tools/ainuoke-bridge/ainuoke_bridge/contracts.py 的原始行快照，features/style-progress/source/ainuoke-material-api-adapter.ts 的 rawFields 传递，server/ainuoke-source/targeted-diagnostic.ts 的候选扫描与事件追踪，features/ainuoke-material-progress/projection.ts 的当前 null 单位。前一时点证据见 [原定向诊断](real-results.md)。更新时机：业务语义确认、PR 基线变化、QtyUnit 来源契约变化、最小映射 PR 或真实激活发生时另加证据，不改写本次报告哈希。
