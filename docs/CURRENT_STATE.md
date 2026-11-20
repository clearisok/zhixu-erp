# 当前：Issue161 Staging来源暂停恢复，工程0752已通过，真实备份执行中

2026-11-20；feat/ainuoke-source-deleted；起点7f0d85d034bdefdef634096f3179f60c32025dcf clean，main API核实636a5ad0d2d1acbe6b2705696e782dea12ee9f00。用户附件明确授权本次Staging最小修复/正式恢复/自然两轮；PR160保持Draft，不合并、不操作Production。旧状态归档completed/2026-11-20-before-selected-source-recovery。

真实Staging仍c3，五服务健康、0060/四卷及两source_deleted样本保留；enabled/version5、selected_source_invalid、Worker0、45833complete/142failed/20queued/0running/unknown、原heartbeat02:49:40.874Z。真实暂停batch779c8bf5-ff8f-4713-aea5-40abbcc9fb87，02:49:39.794Z；请求均HTTP200/isOk=true、目录629/630行，原失败raw未保存，具体坏行/字段不能还原。当前同五合同正式SDK54报表+1login、全部相关报表只读验证通过，无业务写入。

正式Gate无匹配c3备份终态；原fault=worker_stopped_requires_review，backup-check只支持backup fault而拒绝，已定位代码缺口。最小候选补受审停机备份前置：复用原identity/DB/migration/unknown/lease/单owner验证，只取新备份，不清pause或启动。cleanup最多3次正向采样以处理短暂healthcheck exec，持续/未知exec及超时子进程仍阻断，不改旧回执。Windows19+8+2通过/1POSIX跳过；精确0752 Linux30/30、Docker/PostgreSQL恢复E2E1/1、root1026/1026、baseline182/182及三项CI/质量构建全通过。主机已保存64份回滚资产并正式更新c3 Supervisor/executor；10:51:44Z受控切版前备份20261120T105144Z-a4de43bd执行中，来源pause未解除、Worker未启动、尚未切版app。

[当前任务](tasks/active/staging-selected-source-recovery-2026-11-20.md)；[订单删除及c3部署历史](tasks/active/ainuoke-source-deleted-2026-11-20.md)。下一步隔离Linux/Docker PostgreSQL恢复、工程和正式版本绑定；随后按runbook新备份/完整目录/admin reviewHash/Gate/Supervisor新心跳，两轮自然调度。所有必要安全条件不足继续阻断；不能直接SQL清pause或补任务。
