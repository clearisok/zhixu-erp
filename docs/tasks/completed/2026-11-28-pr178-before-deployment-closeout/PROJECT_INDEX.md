# 当前项目入口

2026-11-28；实际main合并SHA **396b03c443f2170255ea4927e05d5889bdcb4b96**，PR178最终HEAD **c04ef84eb0b980591369b11726bc7dc7c9f24824** 三项必要CI全部SUCCESS，唯一Review P2已解决。仅178普通merge到main，没有合并其他PR。用户人工恢复首次push1/第二次push0，精确远端核实，通道NORMAL；此前NETWORK_DEGRADED是历史时点。

1. [当前集成/发布任务](tasks/active/pr178-staging-integration-20261127.md)、[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)。
2. [订单工作台主线修复](tasks/active/order-workbench-staging-2026-11-27.md)、[订单中心](features/ORDER_CENTER.md)、[商业历史](features/ORDER_COMMERCIAL_VERSIONS.md)、[业务规则](BUSINESS_RULES.md)、[决策](DECISION_LOG.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)。
3. [既有Supervisor与Recovery Gate](ops/ainuoke-catalog-sync-supervisor.md)、[原共享摘要](tasks/completed/2026-11-28-pr178-before-actual-main-integration/candidate-17aa/PROJECT_INDEX.md)。保留现网220完整功能后独立部署；只允许Staging，不动其他PR/Production/业务数据或数据库结构/调度策略。
