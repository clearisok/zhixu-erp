# Issue174 v2 Staging 稳定性验收

2026-11-26；本阶段 baseline：feat/issue174-storage-v2 / e6f0066d8b462597faf2dce532f110e8b4f5834d，clean。本轮用户明确批准核心门禁后恢复 Worker、两轮自然调度及24小时观察；自动清理继续关闭。此授权窄替代旧摘要的 Worker hold，不授权删除、结构开发、Production或合并。PR176 Draft / Issue174 Open。

## 当前结果

- e6f0066d 三项 CI 全部 success：Release baseline 45781408449、First team access 45781408515、Ainuoke server source 45781408465。复用第三阶段正式业务/引用/附件/API/管理员UI/权限保护有效证据。
- 08:33:35Z 九项 Recovery Gate 全 true。正式 sync-recover 精确 reviewHash 2abb3eb9457d478be4e1c759758fba553b85cbdc811f962ec73630f3807cc417，未知 jobs/captures 均0，只追加恢复审计；原 pause/fault/config/policy 精确副本保存。仅恢复已批准的原分钟入口，其他 cron 字节不变，现有 pinned plan/policy 显式更新并 check 通过。
- 08:34:01Z 自然 cron 创建唯一 Worker，08:34:02.987Z 启动。目录真实双遍成功并新增5单（636→641）；自动合同任务1a2cdeb4-5606-470a-a004-167763354872成功，businessChanged=false。随后 retry任务5479c582-8bc7-4b44-a4dd-5de6c0ffc5a2于08:34:17Z失败 catalog_diagnostic_write_failed，Worker按原机制退出并暂停；没有人工同步、删故障、未知结果转换或绕过门禁。
- 根因：持久 Python 子进程 stdout 回调继承首个采集的 AsyncLocalStorage 审计上下文。后续任务的 request/recapture/page durable callbacks在旧批次执行。实际旧目录批次 fb329e8a... 被写入后续定向页，下一任务的新页与旧批次同page回执冲突；原错误被既有封闭错误码包装。新的合成双任务上下文回归先稳定失败（first/first），最小修复 AsyncResource.bind 后通过；绑定三种回调，保持所有校验与暂停规则。不改schema、调度、账号或上游请求协议。
- 定向协议/字段校验23项 PASS，目录PG集成9项 PASS，typecheck/server:build/局部ESLint PASS。修复后的协议上下文回归再次PASS。新修复发布回归进行中；不得将e6绿灯冒称修复提交CI。
- 异机完整副本：Windows D:/CodexPrivate/issue174-20261124-v2/stability-20261126/20261126T075529Z-8d50463a，57文件72,764,180bytes逐项size/SHA通过，manifest2bb7c31074e1ff5609d831a5ef1c2e75f5cb8f5eb6c86a0e0aedb8080bea5975。ACL仅Administrator/SYSTEM。Windows独立Docker、PG16.15、network none/无ports/1CPU1GB/tmpfs新目标完成全147表行摘要+全部序列精确恢复，13对象文件hash通过；08:40:55–08:41:43Z，随后停止测试容器。此为07:55配对的恢复实证，不包含后来新增5单，不能盲覆盖现库。原3.843GB迁移前配对正独立复制，不删除任何原件。
- PNG原有68bytes文件libpng read error，旧/新相同503；13原始附件下载完整，候选Linux正常PNG/JPEG/WebP缩略图工程证据有效。保留原文件，分类为已有坏图，不阻塞同步。
- 22.61GB是迁移保全资源：隔离PGDATA13,799,170,048；新活动集群834,981,888（含WAL）；新对象18,755,584；任务根除隔离PG4,114,182,144（含第二盘原配对3.843GB等）；主盘原配对3,843,034,087。合计22,610,123,751bytes。各项采样口径含allocated/apparent差别，不冒称纯业务库增长；不清理任何保全资产。
- 实站仅3账号：两管理员和交付只读验收角色。管理者/报价经理/物控经理/生产经理/财务经理/跟单经理无现成可登录账号证据，已请求现有安全凭据路径或人工登录；不新增账号、不改角色、不伪造验收，不阻塞其他任务。

## 接续

最小修复按精确commit构建并通过必要门禁后，仅Staging匹配发布，取得新一致配对，正常恢复并验证新heartbeat。两轮实际自然周期成功后才开始完整24小时计时；本轮第一次运行不能计两轮成功。目前24小时验收尚未开始/通过。私密原始证据在服务器/data/issue174-stability-20261126及Windows上述私密目录，禁止提交备份/凭据/原始业务JSON。
