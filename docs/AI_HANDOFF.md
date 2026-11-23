# Issue165 UI规范整改：批次A实施与验证

2026-11-23；本轮实际main / PR比较基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**，已由GitHub API及受控fetch一致核实。用户已批准原报告v1全部38项明确问题自动分批实施、独立PR及满足现有发布条件后仅Staging；D01–D10暂不实施，不自动合并，不改变业务/数据/权限。

[用户授权](tasks/active/ui-standards-approval-2026-11-23.md)、[执行记录与当前恢复点](tasks/active/ui-standards-remediation-2026-11-23.md)、[报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[上一状态原件](tasks/completed/2026-11-23-before-ui-standards/CURRENT_STATE.md)。

恢复分支fix/ui-standards-a，起始HEAD为上述main，起点clean。仅实施既有批次A七项；先完成测试、门禁和checkpoint再交付，结果写执行记录。原审查报告固定454675fb，勿覆写为已整改；原chore/juntao-migration-plan/ecceb144与chore/ui-standards-audit/454675fb保持。

后续沿原B四项及C二十七项自动分批，不扩大到D01–D10。所有PR保持不合并，只在既有门禁满足后部署Staging；Production禁止。当前无本批实机/部署PASS。旧摘要及0752验收历史见归档与原记录，禁止用历史通过替代新候选。

批次A工程收口：5707cd333fbae563b5f3f8f98af94b395ed399bf，root1026/1026、baseline182/182、精确main守卫（9 UI路径）、紧凑页面10/10、排单/物料48/48及类型/lint/前后端build通过。独立PR交付待最终文档commit精确送达。当前Staging已在切版前RECOVERY_BLOCKED/backup_cleanup_unverified，保留原故障与0752，不部署或自行恢复。批次B在另一clean main工作树独立实施，不带入本批产品增量；用户已批准自动推进。
