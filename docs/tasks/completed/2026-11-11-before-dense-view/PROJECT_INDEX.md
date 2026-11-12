# 织序当前恢复入口

2026-11-11：PR144已合并并部署staging **6dc17c645215b3eb08e03624effdee2d182b3e1d**。620订单合同日期降序及物料HTTP可读核对通过；257到期任务正常自动采集发布、积压清空，升级前后配对备份及完整离机哈希均通过。不要重复CI/合并/源核验，当前恢复入口见CURRENT_STATE及AI_HANDOFF。

2026-11-10晚间更新：staging/main实际版本 **dbc61af9be80d0a72e8226afa2cefad6e240ef09**。10:16目录一致性拒绝后的全源暂停已通过新固定核验和原恢复服务解除；今日PI2611-091已由正常cron自动建档、发布并HTTP读回。新排序/有限目录重采仍为本地候选，见[晚间任务](tasks/active/ainuoke-directory-recovery-sort-2026-11-10.md)；不以此前00:42结果代表全天运行。

2026-11-10：新增销售合同自动发现已合并PR143，staging实际运行main **dbc61af9be80d0a72e8226afa2cefad6e240ef09**。后台正常cron已启动，619张订单真实物料HTTP全部可读，原617身份保留；139表/9附件配对备份、离机校验及独立恢复通过。第二轮新版本自然目录于00:41成功、26报表/0新登录、无重复订单或任务；完整目标已完成，由宁波后台持续执行。

1. [CURRENT_STATE](CURRENT_STATE.md)：实际运行范围、当前数量、权限、调度与限制。
2. [AI_HANDOFF](AI_HANDOFF.md)：精确提交、宁波运行目录、备份、后台owner和待收尾项。
3. [新合同自动发现交付](tasks/active/ainuoke-order-discovery-2026-11-09.md)：根因、两张真实新增样本、工程/CI/合并/部署及自然周期证据。
4. [物料staging交付与回滚](tasks/active/material-staging-delivery-2026-11-07.md)、[已验收业务/UI](tasks/active/material-business-view-2026-11-07.md)、[物料模块](features/AINUOKE_IT_MATERIAL_SOURCE.md)、[Server来源与D191](features/AINUOKE_SERVER_SOURCE.md)。
5. [业务规则](BUSINESS_RULES.md)、[决定](DECISION_LOG.md)、[本机自动执行历史验收](tasks/active/local-ainuoke-automatic-2026-11-07.md)、[正常登录及本机入口边界](features/SERVER_LOGIN.md)。

应用部署版本与后续交接文档提交分开。采集只在宁波运行，本机网页、617张数据和原暂停队列保留；不得同时启用两端源采集。生产未操作。旧版本390569c4的交付结果仍为对应历史时点，不覆盖当前新版本事实。

[本次更新前状态及hash](tasks/completed/2026-11-10-before-discovery-actual/receipt.json)、[之前共享状态](tasks/completed/2026-11-08-before-staging-actual/PROJECT_INDEX.md)保留原日期、版本、验收范围和限制。不重复已成功且未受影响的测试、CI或全量采集。
