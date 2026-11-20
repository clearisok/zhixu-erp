# 接力：Issue159候选已部署Staging，等待人工验收

2026-11-20；branch feat/ainuoke-source-deleted；main基线636a5ad0d2d1acbe6b2705696e782dea12ee9f00；实际部署c3e4251fc9f9a7cc6a18aaa7c2dad8fcc192ea90。Draft PR160保持Open/未合并。用户已授权Staging部署，未授权合并/Production。

[Staging订单中心](https://staging.weaveops.top/order-center)：真实完整双遍6086103（631行/13页）于14:47:30北京时间正式确认PI2611-142/SO629、PI2611-143/SO630删除；run7f8575ba-9a66-45e2-9ecd-7fbdee09ded8，两个不可变source_deleted事件/version1，真实服务器列表模型返回order_source_deleted。订单数量10000/8000及历史保留，createdOrders0；非合成展示、非SQL伪造。

正式机制仅重建app/gateway/objects-tls，五服务健康；原database/objects容器、四卷、旧镜像及64项回滚资产保留。0060/145表完成；新app c29fdf70…、Worker镜像6169a459…（未运行）、Supervisor a0109d4f…、executor62fb2e78…与source/target/collector/policy身份匹配，监管cron已安装。21生产表及两订单历史hash、23手工/报价表、3用户角色、630原订单身份、142失败及20待处理回执均保全。

必要部署修正：完整只读快照实测313.626秒，policy可选预算默认300、严格整数300–600，本Staging450；SQL/哈希/门禁不变。两次300秒失败保留；旧636a预备份061636Z-fc875b32 BACKUP_VERIFIED/独立完整哈希通过，但原cleanup=false保留，后续真实独立清理复核只用于应用部署，未替换Worker门禁证据。未执行新c3完整配对备份。

已有selected_source_invalid暂停保持，control version5、heartbeat02:49:40.874Z、Worker0、142failed/20queued/0running/0unknown。未恢复30分钟自动同步。只读recovery-check缺匹配终态证据，collectionError=backup_terminal_receipt_missing，安全拒绝；不能将缺省false解释为真实DB不健康。后续恢复需调查原来源暂停并按正式状态转换、新版本真实备份/清理证据、Recovery Gate及真实heartbeat处理，不SQL清除/手动补任务。

精确c3三CI全部SUCCESS；root1026/182基线/目录106/PG生命周期10、四桌面两角色Chromium、quality/build通过；Linux备份/监管器/Gate25/25、SDK211/211及显式guard通过。实际Staging公共TLS/版本/CSS和正式服务读取模型已验证；内置浏览器kernel assets路径错误，真实登录页面像素验收未完成，等待用户查看。后续只提交证据文档，不把c3的CI冒称新文档HEAD或重新部署。

[完整阶段证据](tasks/active/ainuoke-source-deleted-2026-11-20.md)。本机脱敏证据：visualizations/2026/11/18/01a1ec55-eaa3-75f0-a103-83b015d43fb4/source-deleted-staging-20261120/REPORT.md。下一步仅用户人工验收；不得自动合并、恢复Worker或再次采集。

主机证据 /home/jackson/weaveops-staging-preview/releases/source-deleted-20261120；active runtime catalog-sync-c3e4251f。完整部署结果/回滚/保全/目录与只读gate已保存；禁止重复执行迁移、目录确认、部署或备份来重做已完成步骤。原98d6工作树在c3起始clean；最终文档阶段仅四文档增量。独立C盘恢复checkout仍6178，仅作为保全资产，不擅自覆盖。
