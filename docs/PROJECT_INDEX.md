# 当前入口：项目复审与全量合同交付收敛

2026-11-04 当前任务：[全项目复审、局部修复与下一阶段目标](tasks/active/project-audit-2026-11-04.md)。从干净00ba继续，修复来源持久暂停、UUID校验、误导性登录提示，校准当前文档；相关合成检查通过，无真实采集、部署或Git写入。先读[当前状态](CURRENT_STATE.md)及[当前接力](AI_HANDOFF.md)。本地候选、远端PR和体验站必须分别核对；旧入口原样保存在[输入归档](tasks/completed/2026-11-04-before-project-audit/PROJECT_INDEX.md)。

此前交付记录：[PR140首轮CI、兼容修复与体验站范围](tasks/active/pr140-ci-and-staging-status-2026-11-04.md)。唯一草稿140的基线/权限CI成功、来源CI失败；00ba中的测试兼容修复已本地验收、未上传，本轮又追加审计修复。staging仍旧f21、3正式订单，隔离550成功不冒充全量上线。[此前Git交付定位](tasks/active/github-delivery-recovery-2026-11-04.md)保留。

当前续作：[来源稳定性、有限恢复与共享证据](tasks/active/ainuoke-sync-resilience-2026-11-04.md)。当前550/608成功，登录拒绝暂停；用户已批准的[固定恢复](tasks/active/ainuoke-login-recovery-2026-11-04.md)在1登录/0报表时再次被拒绝并关闭；两端凭据一致，原因尚未确定。先读当前状态，不重启旧运行中任务。[上一诊断与容量复核](tasks/active/ainuoke-request-diagnostics-capacity-2026-11-04.md)保留原失败。

2026-11-04；新增[宁波备份/恢复/升级准备及容量实测](tasks/active/ningbo-catalog-capacity-2026-11-04.md)。main上次只读核实为cb5cc29baa49ed7115fdb6c9506b6a80356936ea，本轮GitHub API重新核实了该main，未据此宣称Git传输恢复。先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[当前任务/运行清单](tasks/active/ainuoke-full-catalog-followup-2026-11-02.md)、[来源模块](features/AINUOKE_SERVER_SOURCE.md)、D179和[发布守卫](features/RELEASE_BASELINE_GUARD.md)。

用户批准全量可查、全部合同按交期自动分档、每单随时手动刷新；缺失或无效交期30分钟且标注待核对。来源目录不自动创建正式订单。当前在独立分支实施并使用合成隔离库验收；不把工程进展当作宁波已启用。侧栏已部署事实与原资产见[原入口](tasks/completed/2026-11-02-before-full-catalog/PROJECT_INDEX.md)，不回退或删除。
