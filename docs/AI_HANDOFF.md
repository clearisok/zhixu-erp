# 接力：Issue161 Staging来源暂停恢复，工程0752已通过，真实0752已正式恢复，等待两轮自然验收

2026-11-20；feat/ainuoke-source-deleted；起点7f0d85d034bdefdef634096f3179f60c32025dcf clean，main API核实636a5ad0d2d1acbe6b2705696e782dea12ee9f00。用户附件明确授权本次Staging最小修复/正式恢复/自然两轮；PR160保持Draft，不合并、不操作Production。旧状态归档completed/2026-11-20-before-selected-source-recovery。

真实Staging已正式切版0752（11:10:58Z），五服务健康、0060/四卷及两source_deleted样本保留；经正式reviewHash恢复至enabled/version6/pause空，11:36:03Z由自然cron/Supervisor启动唯一Worker，11:36:05Z真实PG心跳、11:37Z RUNNING/heartbeat_verified。历史142failed/两删除订单保留；255当前高频合同首轮已于11:52:09.288Z全部成功（0failed/unknown/缺发布）；等待各自完成+1800秒第二轮，尚未2/2。真实暂停batch779c8bf5-ff8f-4713-aea5-40abbcc9fb87，02:49:39.794Z；请求均HTTP200/isOk=true、目录629/630行，原失败raw未保存，具体坏行/字段不能还原。当前同五合同正式SDK54报表+1login、全部相关报表只读验证通过，无业务写入。

正式Gate无匹配c3备份终态；原fault=worker_stopped_requires_review，backup-check只支持backup fault而拒绝，已定位代码缺口。最小候选补受审停机备份前置：复用原identity/DB/migration/unknown/lease/单owner验证，只取新备份，不清pause或启动。cleanup最多3次正向采样以处理短暂healthcheck exec，持续/未知exec及超时子进程仍阻断，不改旧回执。Windows19+8+2通过/1POSIX跳过；精确0752 Linux30/30、Docker/PostgreSQL恢复E2E1/1、root1026/1026、baseline182/182及三项CI/质量构建全通过。主机已保存64份回滚资产并正式更新c3 Supervisor/executor；c3切版前备份20261120T105144Z-a4de43bd成功且原cleanup=true，11:10:58Z正式切版0752，只重建三个无状态服务；原database/objects及四卷、142failed/20queued/hash保全。0752新备份20261120T111255Z-b640f966于11:29:52Z成功且原cleanup=true；新鲜54报表及631完整目录通过后，空unknown集正式previewHash恢复，九Gate全true，Worker实际运行。当前只读观察两轮自然调度，不补任务/改时间。

[当前任务](tasks/active/staging-selected-source-recovery-2026-11-20.md)；[订单删除及c3部署历史](tasks/active/ainuoke-source-deleted-2026-11-20.md)。恢复链已真实完成；下一步只观察第二轮自然1800秒调度并核对逐单ID/计划/完成/发布及历史保全。所有必要安全条件不足继续阻断；不能直接SQL清pause或补任务。

主机只读证据在/home/jackson/weaveops-staging-preview/releases/source-recovery-20261120，原c3完整部署证据在releases/source-deleted-20261120；私密raw不进Git。当前5个已知增量Python文件和本Gate文档均本轮自有，无继承dirty。不得将当前新成功采样解释为还原旧失败payload。

Git交付：实际部署代码0752及dfcd部署证据已精确送达。0c5db44e心跳文档检查点的DryRun传输失败/pushes0，NETWORK_DEGRADED；后续本地checkpoint，不重复push失败通道。Staging实际运行不受此文档交付故障影响。
