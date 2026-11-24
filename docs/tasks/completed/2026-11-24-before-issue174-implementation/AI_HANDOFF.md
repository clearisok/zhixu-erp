# 接力：Issue174精简决策v2，仅评估

2026-11-24；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**，本轮connector复核一致；branch `chore/issue174-storage-design`，本轮起点`97074255880e8e422793e2ea4bdbc10667b79126` clean。NETWORK_DEGRADED延续，不重复push/自动恢复命令，不用文件API伪造交付。最终HEAD/命令在Issue交付评论，未精确送达前PR pending。

先读[精简方案v2](features/Issue174-精简整改决策方案-v2.md)与最新[Issue174](https://github.com/clearisok/zhixu-erp/issues/174)决定。v1.1原文件/hash保持；D200窄替代D199对整改前无引用旧来源变化一律长期保留的输入。用户只授权评估，没有授权删除/迁移/配置/部署/调频/Worker恢复，不能把新起点理解成清库重采。正式业务、当前来源、业务引用闭包、删除恢复、异常/unknown/在途/幂等/法律hold全保，7/30/90天及专项备份自验收成功起90天不变。

推荐两新表（共享正文/每日汇总容量）、现有目录与任务/FK＋固定JSON保护、只转换当前/受保护集合、三阶段统一候选/一次计划Staging切换；不做通用pins/incident/旧历史重建/反向转换。新写开放后不得冻结旧库覆盖新写。1–2GB/95%和44.3GB资源示例均非实测承诺。本轮没有DB连接/体积重查或源站请求。

源码核对0039 snapshot复合FK、0053 jobs/observations/state、0055目录chunks、0060生命周期run与worker/历史补发。未知引用必须hold；取消pins不取消事务内保护与闭包。现行不可变/verify-only/恢复/权限门禁照旧；运维quote_trial旧调查为superuser，不假定app权限隔离；catalog_diagnostic_write_failed未恢复；PR172/173等实际候选未来另核对。

本轮仅文档/链接/归档原字节/冻结证据前向版本及release guard检查；不把上轮182项通过算成本轮执行。未改守卫/测试或UI，不无理由重跑大套件；在真实PR交付前仍须对届时最新HEAD执行check:release-baseline与test:release-baseline，完整PR门禁未提前记PASS。

[上轮摘要原件](tasks/completed/2026-11-24-before-issue174-simplification/README.md)、[上轮最终182项记录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7126632505)。本轮最终本地commit/checks/Issue版本链接见新交付评论；下一步集中评审，不进入Ready或执行。
