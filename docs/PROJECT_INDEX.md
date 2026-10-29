# 当前入口：宁波固定Source窗口已完成

2026-10-30北京时间；main562fbf07。先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[宁波三合同固定来源验收](tasks/completed/2026-10-30-ningbo-fixed-source-initialization.md)。三单/三轮物料/两单货款/一单成衣已发布并公网读回，无持续调度，不造生产/价格/关账。下面入口保留各自时点，不能将历史“未开始”作为当前状态。

# 历史入口：宁波staging已部署及固定Source初始化

2026-10-30北京时间；产品main562fbf07。先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[宁波部署/恢复/公网验收](tasks/completed/2026-10-30-ningbo-isolated-staging-deployment.md)。部署已批准且完成，新三合同有限初始化另获明确批准、尚未开始；旧资产和本机历史保持。以下为原阶段入口，保留原日期与事实。

# 历史入口：main562与C1成衣真实发布

2026-10-29，产品main **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**。先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)与[本片验收](tasks/completed/2026-10-29-main562-real-garment-acceptance.md)。#134已合并、本机C1出货已发布；宁波尚未部署。以下为前片入口，保留日期/范围，不覆盖历史事实。

# 当前入口：最终main与C1成衣完整首页兼容

2026-10-29；比较main **e11b3c3cbd1dcf751b6fa5cb16e9323fdc67ac9e**，分支codex/garment-collection-first-page-proof。#132/#133已按具体批准merge commit，原历史保留；当前新兼容修复尚未合并或部署。

先读[状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[本片事实/验证](tasks/completed/2026-10-29-garment-first-page-compatibility.md)及[新兼容契约](features/SERVER_GARMENT_FIRST_PAGE_COMPATIBILITY.md)。原状态和全链接完整保留在e11的同路径Git blobs，以下仅列当前恢复入口，不复制过期结论。

- [完整Gate0–8/R](tasks/active/server-convergence-gate0-2026-10-20.md)、[宁波闭环清单](tasks/active/ningbo-server-closed-loop-readiness-2026-10-28.md)：全目标继续，范围/日期不冒进。
- [真实两合同窗口](tasks/active/real-source-acceptance-current-2026-10-29.md)、[133合并与固定证明](tasks/completed/2026-10-29-approved-pr133-and-garment-proof.md)、[本片C1接纳及失败](tasks/completed/2026-10-29-garment-first-page-compatibility.md)：原始额度、部分成功与新修复分开。
- [Server来源](features/AINUOKE_SERVER_SOURCE.md)、[货款](features/AINUOKE_PAYMENT_REQUESTS.md)、[成衣观察](features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)、[操作者](features/SERVER_GARMENT_OPERATOR_CURRENT.md)、[完整首页补充](features/SERVER_GARMENT_FIRST_PAGE_COMPATIBILITY.md)。
- [staging Origin/宁波路由](tasks/completed/2026-10-29-staging-origin-and-ningbo-route.md)、[trial运维](../ops/quote-trial/README.md)、[旧写边界/恢复依赖](tasks/completed/2026-10-29-server-write-boundaries-and-retirement.md)：不是部署/切换/旧资产清理批准。
- [关账月份](features/SERVER_CLOSING_MONTH_PLAN.md)、[年度](features/SERVER_CLOSING_ANNUAL_READ.md)、[来源复核](features/SERVER_CLOSING_SOURCE_RECONCILIATION.md)、[执行归属](features/SERVER_CLOSING_EXECUTOR_MATCHING.md)、[USD工价](features/ORDER_USD_LABOR_ADOPTION.md)。
- [业务规则](BUSINESS_RULES.md)、[决策](DECISION_LOG.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)、[Git交付](tasks/active/git-delivery-resilience.md)。既有安全交付常设授权不等于自动merge、部署或新Source授权。
