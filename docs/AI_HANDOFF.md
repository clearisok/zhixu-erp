# 恢复点：Gate8C工程通过，待发布门禁与UI

2026-10-27；最后核实main 869ee84dd0b31de6161011e4aa560678b244a64d（本轮未fetch）；分支codex/order-usd-labor-adoption-main-869e。初始源码S 34547801fd818f5f6777809f11c09ddd574688c2；最终源码S4 7afc5bb3a38784bd44dc539dbf1104143ae49fb2，精确归档3043blob/0overlay。父Gate8B f080263ab681afdb79b20df3200ca027a96ec234。PR130原远端仍61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，旧CI不代表本阶段。Git退出1的STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED，远端Git/ref写继续冻结。

D162/D164后端：仅CNY→USD明确采用；原USD只能完整凭据及金额相同no-op，混合越界整单拒绝。可信后继/确认时币种、原产品/售价/批次/关账保护、独立工价来源及幂等回执。0046不回填。

分源192定向及811项目通过，类型/相关lint/Server与前端构建通过；独立静态复审0剩余P1/P2。初始类型、构建runner路径及旧预升级夹具失败原件保留，修正后只补受影响检查。最终release/精确守卫尚待，未宣称交付完成。[冻结工程证明](tasks/completed/2026-10-27-order-usd-labor-adoption-engineering.md)；[契约](features/ORDER_USD_LABOR_ADOPTION.md)。

完整Goal active；尚无USD采用UI、Server关账UI或税率更正，不是正式业务闭环。本次0Hosted CI/远端写/真实Source/现有库/部署/切换。旧50容器/179卷/27网络及111旧refs元数据保持，不是业务内容审计。Gate8B及旧证据继续保留。

恢复时先读阶段与冻结工程证明、canonical-terminal.json及canonical.json，原失败不可删除或改称PASS。停止规则未解除，不尝试新Git/ref写；可继续不依赖远端的UI切片。
