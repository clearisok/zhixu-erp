# 当前：2026-11-19 紧凑业务页面候选部署

核实main基线4a8c9bc24b00983d0d79150349adeed5a333a237；开发分支feat/compact-business-pages，Refs [Issue155](https://github.com/clearisok/zhixu-erp/issues/155)，[Draft PR156](https://github.com/clearisok/zhixu-erp/pull/156)。用户批准四截图范围与v2废止两列表功能、候选先部署Staging；未批准合并或Production。

候选90de5b0af2dede0afc820aa1fd38dfe8315e9e7a：重复标题/技术栏移除，原操作迁入顶栏；详情识别信息整合概况；计算价与真实确认价独立，保留多价/未知/权限。仅移除款式进度列表和风险预警，保留共享物料详情、接口与数据。无业务计算/API/SQL/schema变更。范围、授权与失败历史见[任务](tasks/active/compact-business-pages-2026-11-19.md)。

该精确候选三项CI全部SUCCESS：全量1026/1026、release-baseline182/182、紧凑Chromium9/9；typecheck/lint/前后端及两authority build通过。补充浏览器交期14/14、历史9/9、物料/出货/付款/关账43/43通过。四桌面尺寸及等效缩放21组合通过；Windows关闭超时的早期非0运行不计PASS，原失败保留。

Staging已正式切换90de，仅app/gateway/objects-tls重建；五服务健康、原database/objects容器及四卷完全相同、旧镜像/52回滚文件保留，23人工表/3账号权限/630订单身份保全。公网真实浏览器12组合、现存7条服务器报价、原维护/更多操作及正常退出通过，0业务写入/0来源刷新。回滚使用旧镜像/配置和原卷，不恢复旧库覆盖新数据。

发布前配对备份20261119T032302Z-a97b1f27成功且独立核验56文件、11对象、143表、3419126506字节dump；原失败回执未变。新版本配对备份已启动，尚未宣称完成，仍需最终服务/身份/门禁只读核验。

独立现场风险：切版前03:02Z原4a Worker因catalog_identity_or_scope_changed停下，enabled=true但paused_reason非空；Supervisor正确阻断，0Worker。UI任务完整保留该保护状态和原B4故障，未清暂停/改心跳/改last_run/补跑任务，不能宣称自动同步恢复。新备份完成后交用户人工验收，不合并PR。

[当前接力](AI_HANDOFF.md)；[此前main状态](tasks/completed/2026-11-19-before-compact-ui/CURRENT_STATE.md)。
