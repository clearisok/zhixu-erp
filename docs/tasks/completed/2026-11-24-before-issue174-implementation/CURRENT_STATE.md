# 当前：Issue174精简方案v2，仅评估待审批

2026-11-24；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**，本轮GitHub connector只读复核仍一致。继续原文档分支`chore/issue174-storage-design`，起点`97074255880e8e422793e2ea4bdbc10667b79126`且clean；沿用NETWORK_DEGRADED，不重复Git失败通道。

[精简v2](features/Issue174-精简整改决策方案-v2.md)窄替代[v1.1](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)全量旧历史转换/长期混读路线。D200记录用户新输入：允许不迁入整改前无业务引用/无其他保留义务的旧来源变化及重复过程正文；新起点T后真实变化长期保留。正式业务/人工计划/员工权限/附件、当前来源绑定及业务引用闭包、删除恢复、异常/unknown/在途/幂等和法律保留不变。7/30/90天、专项备份自验收成功起90天及同步频率不变。

建议选择性迁移到独立紧凑库，原则两张新表（正文/每日汇总容量），复用现有目录/任务/FK并固定枚举JSON引用，三阶段一组候选/一次计划Staging切换。不开发通用旧历史重建、pins平台、独立incident系统或通用反向转换；不能取消引用闭包、备份实际恢复、并发/幂等/未知保护。开放新写后不承诺旧程序一键回退，必须保全新写。

沿用旧调查12.336GB/145表/636单；本轮未连接数据库、未重查体积、未做全量去重或新源站请求。1–2GB/95%仍待实测；v2资源示例44.3GB新增＋对象，非容量保证。实际Staging旧调查a0a9c78c（PR172）及未合并PR173等须实施前重新核对。既存catalog_diagnostic_write_failed不在本轮恢复范围。

Issue174保持Open/Design/P0的设计目标；不自批Ready。本轮只做文档与Issue登记，没有代码/SQL、数据删除/迁移、配置/部署、Worker或Production操作。最新提交、文档检查及REMOTE/PR状态见Issue最终评论与AI_HANDOFF；实际PR交付前仍需最新HEAD的完整发布门禁。上轮182项通过不冒称本轮重跑。

[上轮摘要原件](tasks/completed/2026-11-24-before-issue174-simplification/README.md)保留旧日期/hash/结果；[原始调查和v1.1交付](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7126632505)不覆盖。下一步集中评审精简路线；实际放弃清单、资源、窗口/恢复时限和所有不可逆操作另行形成操作单授权。
