# 当前：Issue161 Staging自动同步真实恢复，2/2自然验收完成

2026-11-20；分支feat/ainuoke-source-deleted。main已核实636a5ad0d2d1acbe6b2705696e782dea12ee9f00；PR160 Draft/Open，未合并。用户明确授权Staging必要最小修复、备份、正式恢复及自然两轮；Production禁止。历史状态保留在tasks/completed/2026-11-20-before-selected-source-recovery。

实际部署代码0752d64f309d68b6e52afbbd712d28e0d9db9c1e，五服务健康，0060/145表，原database/objects容器及四卷不变。Supervisor980fa098…/Worker image d3015e58…/executor0e5c3f00…/collector bf2ff18d…/37个policy pins实际匹配。c3预备份a4de43bd和0752新备份20261120T111255Z-b640f966均正式完成且原cleanup=true，后者56文件完整SHA/size验证。旧失败包/原故障字节保留。

新鲜6086103完整双遍631行/13页及相关54报表全部业务验证通过；空unknown集合正式previewHash恢复控制version5→6、保留旧暂停事件，九项Gate全PASS。自然cron/Supervisor19:36:03启动唯一Worker，19:36:05真实PG心跳、19:37 RUNNING/heartbeat_verified。无手动Worker启动/补任务/改时间。

当前255高频合同：首轮19:36:05.599–19:52:09.288、第二轮20:06:39.721–20:23:21.144，北京时间，各255成功/0失败；510唯一任务/发布，每合同第二次计划精确前次完成+1800秒，实际start延后1.569–153.026秒正常节流。原142failed hash完整保留，旧20queued自然完成，最终queued/running/unknown0。两source_deleted订单version1/事件2/无新任务、数量历史不变；23手工报价表/630原订单/3用户角色完整hash保全。Worker和Scheduler继续RUNNING。

工程0752：root1026/1026、baseline182/182、Linux30/30、真实Docker/PostgreSQL恢复E2E1/1、typecheck/lint/前后端build及三项CI成功，同SHA不重复。后续仅四份证据文档。远端最新dfcd文档HEAD baseline/team通过，Source CI约25分钟后cancelled（疑预算、非已证明断言失败），不写PASS；实际0752完整CI绑定独立保留。

Git：0752/c915/dfcd已精确送达；0c5/b1a及最终证据本地checkpoint，git-delivery DryRun uncertain_transport/pushes0，NETWORK_DEGRADED，禁止继续重复push同通道。PR正文/Issue可通过原GitHub插件记录事实，但不冒称未交付源码已在远端。恢复通道后用正式单条精确HEAD命令送达并补齐相应CI。

[完整恢复证据与限制](tasks/active/staging-selected-source-recovery-2026-11-20.md)。旧失败原raw缺失，具体坏行/字段无法还原；未猜测修改来源比较器或关闭保护。下一步等待用户验收；不合并、不进一步改动Staging或Production。
