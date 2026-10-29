# 本地组合发布入口

2026-10-29；此处是 `codex/staging-release-local-integration` 的本地组合验证，包含 #132@015dec7409e6109b9adbd638624d28dfd6ebc7f0、真实来源文档 checkpoint032c553fc4ec2f30e9d4e8402e2ee86d3393c8e5 及 #133@3c481949b9f13306f7901f63cde213f27ccc8370。远端 main 仍是5c8cb8037376288aa71043e799a057e21f1b985d；没有合并 main、更新两个 PR head、构建新镜像或部署。最终 HEAD/工作树及守卫另查。

先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)和[组合证据](tasks/completed/2026-10-29-local-staging-release-integration.md)。[真实来源窗口](tasks/active/real-source-acceptance-current-2026-10-29.md)、[staging协议/宁波路由](tasks/completed/2026-10-29-staging-origin-and-ningbo-route.md)、[旧写边界](tasks/completed/2026-10-29-server-write-boundaries-and-retirement.md)与[大小写修复](tasks/completed/2026-10-29-retired-normalization-route-guard.md)同时保留。旧审计中的归一大小写P2由后者关闭，其余保留限制不变。

## checkpoint032原索引（历史，保留原文）

# 当前任务入口

2026-10-29；main产品源 **5c8cb8037376288aa71043e799a057e21f1b985d**；codex/real-source-acceptance。先读[状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[真实窗口](tasks/active/real-source-acceptance-current-2026-10-29.md)、[业务规则](BUSINESS_RULES.md)及DECISION_LOG D145–D178。旧摘要全文/日期/hash见[归档](tasks/completed/2026-10-29-main-image-staging-profile/input-state.json)。

- [PR131合并、main镜像与staging配置](tasks/completed/2026-10-29-main-image-staging-profile.md)：双父/树、80ff镜像、非空恢复9/9、D178配置与56定向检查；不是部署或真实Source完成。
- [宁波/艾诺科闭环清单](tasks/active/ningbo-server-closed-loop-readiness-2026-10-28.md)、[完整Gate0–8/R](tasks/active/server-convergence-gate0-2026-10-20.md)：原现场日期保留，目标/真实额度另批。
- [trial运维](../ops/quote-trial/README.md)：默认local、显式staging双Origin，同一栈的备份/恢复/目标/镜像保护。
- [前件浏览器验收](tasks/completed/2026-10-29-pr131-browser-route-recovery.md)、[历史路由/网络](tasks/completed/2026-10-28-pr131-route-gate-recovery.md)、[同SO闭环](tasks/completed/2026-10-28-ainuoke-same-order-closure.md)：保留原source、失败及结果。
- [a198最终验证](tasks/completed/2026-10-28-closing-support-final-validation.md)、[完整UI](tasks/completed/2026-10-28-closing-support-complete-ui-engineering.md)、[旧90e恢复/65139](tasks/completed/2026-10-28-closing-support-persistent-runtime.md)。
- [切换预览](tasks/completed/2026-10-28-cutover-preview.md)、[执行工具](tasks/completed/2026-10-28-cutover-execute.md)、[退役预检](tasks/active/server-convergence-cutover-preflight-2026-10-28.md)：尚未切换/删除。
- [月份](features/SERVER_CLOSING_MONTH_PLAN.md)、[年度](features/SERVER_CLOSING_ANNUAL_READ.md)、[来源复核](features/SERVER_CLOSING_SOURCE_RECONCILIATION.md)、[执行归属](features/SERVER_CLOSING_EXECUTOR_MATCHING.md)、[USD工价](features/ORDER_USD_LABOR_ADOPTION.md)。
- [Server来源](features/AINUOKE_SERVER_SOURCE.md)、[货款申请](features/AINUOKE_PAYMENT_REQUESTS.md)、[成衣观察](features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)、[成衣操作者](features/SERVER_GARMENT_OPERATOR_CURRENT.md)：具体授权范围内真实读取。
- [Git协议](tasks/active/git-delivery-resilience.md)：安全交付/PR/CI常设授权，无自动merge/部署；身份/分歧STOP。

- [本机精确main空目标与Linux源码工具](tasks/completed/2026-10-29-main-local-target-and-source-tools.md)：原准备时点54315 READY、发布182/182、CLI与新库只读连通；之后真实窗口结果见当前任务，不沿用原“未运行”状态。
- [staging协议及宁波Tunnel](tasks/completed/2026-10-29-staging-origin-and-ningbo-route.md)：十项本机协议断言、收尾失败/保留、既有Tunnel只读观察和完整Gate剩余项；不是公网部署通过。
- [Server写入边界与旧恢复依赖](tasks/completed/2026-10-29-server-write-boundaries-and-retirement.md)：正式入口/旧命令分流、旧API实际404、9个未运行容器24缺失挂载及canonical恢复候选；未切换、退役或删除旧资产。
