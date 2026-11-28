# 当前：PR178修复与Staging保全集成候选

2026-11-28；main基线10b9a7d827e1c09f152ead58c21f26712d49a619，独立codex/pr178-staging-integration合并已运行220和178本地c04ef84eb0b980591369b11726bc7dc7c9f24824，不改其他PR分支。原PR远端36ce source失败在catalog旧文案，team-access/baseline成功；新catalog数据断言本地完整通过，CI整job35分钟且所有单项等待保持。当前NETWORK_DEGRADED仅本地checkpoint，等待原脚本人工恢复；新最终HEAD全CI通过才能仅merge178及部署Staging。

集成F7产品保留旧物料读取错误/重读/时区和来源历史语义及新工作台，type/lint/build与受影响UI25通过；另五套H1的51项/root1035/release182/47路径守卫各保留原源码限制。717记录并集，未升级验收状态。实际Staging仍220、原Worker运行、数据库/对象/卷不变；备份哈希与独立147表/13附件恢复通过，无真实业务写入。

[执行及完整历史](tasks/active/pr178-staging-integration-20261127.md)、[主线修复](tasks/active/order-workbench-staging-2026-11-27.md)、[合并前新178摘要](tasks/completed/2026-11-27-pr178-before-staging-integration/pr178-c04/CURRENT_STATE.md)、[原220摘要](tasks/completed/2026-11-27-pr178-before-staging-integration/staging-220ec86c/CURRENT_STATE.md)。尚未部署或用户最终验收。
