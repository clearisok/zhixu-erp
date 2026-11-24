# 接力：Issue174 v2第一、第二阶段实施中

2026-11-24；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**。branch `feat/issue174-storage-v2`，工程起点`dee3d6800d718d67ac91494ec56c76b89ef11caf` clean。[D201](DECISION_LOG.md)与[用户批准转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)授权统一工程＋隔离选择性迁移演练，无需再逐阶段问许可。

先读[实施恢复点](tasks/active/issue174-storage-implementation.md)、[v2](features/Issue174-精简整改决策方案-v2.md)与实际代码。仅两新表：正文、每日汇总/容量；复用目录/任务/FK，业务变化历史长期、无变化仅确认。原始页时间/hash与业务引用必须无损证明，未知hold；不清空FK/换UUID或重建正式业务绕过保护。

未批准实际Staging切换/删除/自动清理启用/Worker恢复/旧库或备份退役，禁止自动合并/Production；旧catalog_diagnostic_write_failed不自动恢复。仅允许新建隔离演练目标的数据筛选/迁移/清理，原备份只读。

原文档dee3的完整发布基线182/182通过，工程server:build及目录followup PG测试16/16通过；其他新存储/TTL/迁移/业务等价验证仍待完成。每个重要Gate独立commit与接力，不能把全部工程留在dirty。

D盘新建私有任务目录和Docker PG16.15独立network none容器；原配对备份58文件hash全部匹配、13对象；恢复进行中。60GB预算/约133GB初始可用。真实备份/原始业务不进Git；只提交脱敏测量和工具。原文档工作树d3f5不编辑，保护精确提交和历史证据。

Git一次批准交付结果LOCAL_PASS_REMOTE_UNVERIFIED/NETWORK_DEGRADED，API独立核对目标分支为空；不重复push、不改认证、不用文件API伪造提交。最终PR须先精确远端验证。最终本地候选发布门禁须重新绑定其HEAD，旧文档182通过不替代工程最终检查。

[实施前摘要原件](tasks/completed/2026-11-24-before-issue174-implementation/AI_HANDOFF.md)保留日期/hash/结果；阶段一/二完成后交简明实际容量、同负载增长/性能、保留放弃清单、业务附件完整性、磁盘/停机估算与恢复、PR/测试和阶段三一次性授权清单，不再扩写方案。
