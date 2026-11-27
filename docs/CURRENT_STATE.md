# 当前：PR178 Staging集成预检

2026-11-27；独立部署候选codex/pr178-staging-integration，以受审178 36ce6565c414270552e288584423e8db1191c622与已运行220完整源码预整合。main基线10b9a7d827e1c09f152ead58c21f26712d49a619。178最终CI仍运行，尚未merge/deploy。用户已授权只merge178及Staging，其他PR/main范围和Production保持。

两处UI交叉保留双方功能，域API/schema/权限/Worker/ops不改；717证据并集、旧ID/hash与能力状态不改。实际Staging220、Worker运行；配对备份57文件及独立147表/13附件恢复验证通过，无真实业务写入。预检不等于发布或人工验收。

[当前执行](tasks/active/pr178-staging-integration-20261127.md)、[178必要修复](tasks/active/order-workbench-staging-2026-11-27.md)、[合并前178摘要原文](tasks/completed/2026-11-27-pr178-before-staging-integration/pr178-36ce/CURRENT_STATE.md)、[现Staging220摘要原文](tasks/completed/2026-11-27-pr178-before-staging-integration/staging-220ec86c/CURRENT_STATE.md)。
