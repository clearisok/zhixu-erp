# 当前状态

核实日期：2026-10-12；GitHub main/任务基线：01694d723cd7b65fcc20e3e79941fef0d57439fc（PR95已合并）。GitHub是实时事实源，此文为快照。旧日期/hash/结果完整见[前序快照](tasks/completed/2026-10-12-first-team-predecessor-state.md)。

- 已合并PR91–95。PR95基线门禁及八类误通过反例已入main；PR91/P6人工PASS仍限历史候选，不代表全部最新功能获验收。
- 当前feat/ningbo-first-team-access：六角色预设、可信session账号API、现有设置页接线与合成测试。无SQL/migration/真实账号变更。[证据](tasks/active/ningbo-first-team-access.md)、[权限](features/PERMISSIONS.md)、D-104。
- 首批团队已确定；Ainuoke已授权来源全可见，织序金额分角色。权限不代表Source激活；宁波Source未接，Order/Material/Production/Closing生产路由继续关闭。
- 宁波：用户确认Ubuntu旧系统、外网域名staging.weaveops.top；本任务未SSH或操作真实DB/部署。未来管理员与真实账号私密配置。
- 18443最后仓内历史：878de323d618b25fca1f51ccf3f024e932641742 / sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4（2026-10-09）；18444：eb9530ac9a2e1b7f68299d97c4d424662a6622f7 / sha256:1707a8e54159928330b4d223f5db4646a6d4696e3684e9615055fb9bd9c33e23（2026-10-10）。未重新观察。用户取消两环境数据迁移必要，不代表已删除，不决定宁波旧数据可删除。
- 下一步：本PR门禁/复审，然后宁波候选只读预检、独立账本与回退；随后Linux受控来源接线。不得Preview与旧业务共库。完整视觉回归、真实Source/team scope、类型切换/Intake、正式转单、DeliveryPlan UI、生产/关账Server仍有缺口，不全作为Quote-first前置。
- 实现、合并、隔离测试、部署、人工验收、Source分别见[能力清单](release/baseline.json)。未自动合并/部署，CI不替代人工验收。

更新时机：main/PR/权限/来源/运行或验收变化；新任务先实时核对。
