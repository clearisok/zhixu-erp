# 当前状态

> 核实日期：2026-10-12。任务起点 / GitHub main：`4adbc30845f99368caa77d3431cc67a6440ac623`（PR94合并点）。这是有时间戳的状态快照；下一任务仍须实时核对main、PR与运行身份。

## 已合并工程与验收范围

- PR91、PR92、PR93、PR94均已MERGED；PR88为closed未merge。原“PR92 Draft”是历史状态，见[完整归档](tasks/completed/2026-10-12-release-baseline-predecessor-state.md)。
- PR91：D-102普通电脑直接保留草稿、制作方案→默认值、原版列表铺满与偏好保持；2026-10-11人工PASS只覆盖该候选范围。
- PR92：订单P6/精简详情/只读Control Tower有用户PASS及后续联合工程回归；**真实Source、可信账号/团队scope、生产路由未激活**。executionOnly不访问CCT，不回退Browser。
- PR93：D-103 sale/labor四键与成本/测算销售价/历史/导出/日志保护在main；不能据此声称运行环境已修复。
- PR94：单次Git交付、精确SHA核验和NETWORK_DEGRADED规则已合并；不改变ERP功能或运行环境。
- [基线/能力清单](release/baseline.json)分别记录实现、合并、隔离测试、两环境部署、人工验收和来源激活；[检查说明](features/RELEASE_BASELINE_GUARD.md)。

## 运行环境（沿用历史证据，本任务未访问）

| 环境 | 最后记录source / image | 范围 |
| --- | --- | --- |
| 18443 | 878de323d618b25fca1f51ccf3f024e932641742 / sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4 | 较早Quote试用；[2026-10-09更新证据](tasks/completed/2026-10-09-windows-quote-trial-ui-update.md) |
| 18444 | eb9530ac9a2e1b7f68299d97c4d424662a6622f7 / sha256:1707a8e54159928330b4d223f5db4646a6d4696e3684e9615055fb9bd9c33e23 | PR91已验收候选；[部署/恢复历史](tasks/active/quote-two-step-creation.md#second-acceptance-preview-deployment-pass-2026-10-10) |

前轮2026-10-12审计只读元数据与上述版本吻合；本工程任务未重新核验runtime/ledger/账号/对象，不将旧计数称为当前值。两环境独立DB/对象与旧环境继续保留；合并不等于部署。两个记录镜像不含PR92/93。

## 当前任务与验证

`chore/release-baseline-guard`仅实现清单、来源/样式/证据/状态阻断检查和隔离PR检查；不改页面、权限业务规则、路由白名单、SQL或部署。工程与远端交付的实际结果见[任务证据](tasks/active/release-baseline-guard.md)，不沿用历史测试数量冒充本轮PASS。

## 风险与下一步

先完成最小门禁，再独立建设真实构建的像素/几何回归和安全候选/兼容回退演练。D-023文字与600/1100/1440实际断点关系待收口，保持当前行为。Order/Material真实来源及团队scope、DeliveryPlan UI、Intake、已有报价类型切换、正式转单、生产/关账Server化仍有缺口，不增加D-098 Quote-first首版前置。关账币种汇总/文字冲突、双环境Cookie/TLS及正式账本归属保留为后续独立核查，不能在本任务顺便修复。

D-096历史导入NOT REQUIRED、D-097无Browser回退、D-099原版加后续批准变更、D-102/103保持。历史测试/部署/人工证据见归档和对应task；默认Browser与所有业务数据不变。
