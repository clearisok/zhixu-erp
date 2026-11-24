# 当前：Issue174 v2第一、第二阶段实施中

2026-11-24；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**。独立分支`feat/issue174-storage-v2`，起点`dee3d6800d718d67ac91494ec56c76b89ef11caf` clean。用户已批准v2第一/二阶段，见[D201](DECISION_LOG.md)及[Issue授权转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)。Project按实际字段进入In Progress，未改其他配置。

范围：共享目录/正文、真实变化版本与确认分离、差异写、引用保护、受控TTL和汇总；现有配对备份隔离恢复和选择性迁移演练。原则仅两张新表，统一工程PR；v2优先于v1.1的全历史迁移/长期兼容/新增平台。全部正式业务、当前来源/绑定、业务引用闭包、删除恢复、异常/unknown/在途/幂等/附件保全，保留期限和调度不变。

未批准实际Staging切换/历史删除/自动清理启用/Worker恢复/旧库或备份退役；不得自动合并、部署Production或覆盖其他Staging整改。catalog_diagnostic_write_failed仍暂停。PR172实际版本与PR173备份修复须在未来组合切换时整合，工程与部署验收分开。

原文档提交完整发布基线182/182通过；工程候选server:build与目录followup PG集成16/16通过，新的存储/保留/迁移检查进行中。不得提前声称第一/二阶段完成。D盘私有隔离恢复进行中，原备份58文件hash匹配、13附件对象；60GB预算，Docker PG16.15独立network none，未连接艾诺科。

一次明确获批Git交付失败，NETWORK_DEGRADED；API独立核对原文档远端分支不存在。继续可靠本地checkpoint，不重复失败通道，不冒称PR送达。待阶段一代码/测试及阶段二实际容量、增长性能、业务/附件等价、恢复资源全部验证后提交简明阶段三审批材料。

[实施恢复点](tasks/active/issue174-storage-implementation.md)、[接力](AI_HANDOFF.md)、[实施前摘要原件](tasks/completed/2026-11-24-before-issue174-implementation/CURRENT_STATE.md)。历史调查12.336GB/145表/636单是11-24调查时点，不冒充演练实测。
