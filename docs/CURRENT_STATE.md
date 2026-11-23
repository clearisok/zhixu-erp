# Issue165 UI规范整改：批次A实施与验证

2026-11-23；本轮实际main / PR比较基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**，已由GitHub API及受控fetch一致核实。用户已批准原报告v1全部38项明确问题自动分批实施、独立PR及满足现有发布条件后仅Staging；D01–D10暂不实施，不自动合并，不改变业务/数据/权限。

[用户授权](tasks/active/ui-standards-approval-2026-11-23.md)、[执行记录与当前恢复点](tasks/active/ui-standards-remediation-2026-11-23.md)、[报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[上一状态原件](tasks/completed/2026-11-23-before-ui-standards/CURRENT_STATE.md)。

当前fix/ui-standards-a从该main clean创建；M01/G04/Q10/Q03/Q02/Q06/P01七项仅展示/可访问性改动待验证，不预写工程PASS。原报告454675fb已精确送达远端并创建PR166，仍Draft/Open。原迁移分支及工作树完整保留。

实际Staging仍按此前验收为0752，未因本轮授权或Git交付重新部署；原DB/对象/四卷与唯一采集owner继续保护。没有SQL、业务数据、权限或来源采集规则修改；不清暂停、不改未知回执。部署前须新检查和配对备份，不复用历史备份PASS。

当前需完成本批测试、自查、精确路径门禁、PR和受控Staging发布，然后自动推进原批次B/C。默认Git通道失败；7888进程限定通道本轮送达成功，不改共享配置、不承诺永久恢复。

批次A工程收口：5707cd333fbae563b5f3f8f98af94b395ed399bf，root1026/1026、baseline182/182、精确main守卫（9 UI路径）、紧凑页面10/10、排单/物料48/48及类型/lint/前后端build通过。独立PR交付待最终文档commit精确送达。当前Staging已在切版前RECOVERY_BLOCKED/backup_cleanup_unverified，保留原故障与0752，不部署或自行恢复。批次B在另一clean main工作树独立实施，不带入本批产品增量；用户已批准自动推进。
