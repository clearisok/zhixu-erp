# 当前状态

核实日期：2026-10-12；GitHub main/任务基线：5215ef75510e4b55ef69b1ae1508816b80fda110（PR97已合并）。GitHub是实时事实源，本文为阶段快照。此前日期/hash/结果见[归档](tasks/completed/2026-10-12-ningbo-preflight-predecessor-state.md)。

- 已合并PR91–95及PR97。六角色账号管理已实现/合并；PR97精确head的基线和六角色CI通过。真实账号、宁波部署、人工验收、Source激活仍未完成；[能力清单](release/baseline.json)分维度记录。
- 宁波只读预检已完成：[现场报告](tasks/completed/2026-10-12-ningbo-readonly-preflight.md)、[上线方案](ops/ningbo-rollout-plan.md)。旧legacy为f0c252b…/127.0.0.1:3000；旧Server为7cd43b6…/127.0.0.1:3002；均healthy，两个DB/网络/卷隔离。Server schema仅0001–0007（已应用checksum与main一致），main至0011；Server用户/角色均0。
- 公网staging.weaveops.top：宁波请求403，Windows请求502；localhost健康正常。Cloudflared运行，但实际远程ingress映射和根因未确认。当前真实发布NO-GO。旧每日备份任务success，仅证明dump/list/hash检查；独立恢复、异地副本及新候选附件保护未验证。
- 用户已确定六角色、Ainuoke已授权来源团队全可见、织序金额分角色；管理员私下创建真实账号。Linux Source未接，Order/Material/Production/Closing生产路由继续关闭；保持现有UI。
- 下一PR建议chore/ningbo-release-candidate：正确Server/session候选、独立空账本/卷/对象归属、Linux安全操作入口、合成六角色与备份恢复演练；真实DB/账号/部署/切域名仍须另行明确授权。不得Preview与业务共库，不把全部ERP延期项塞入Quote-first前置。
- 18443/18444本轮未重查或修改。历史source/image/dates仍保留在清单及归档；用户不要求迁移其数据，不等于本次删除，更不决定宁波旧数据可删除。PR91/P6人工PASS仅覆盖历史候选。
- 本次仅授权并执行PR97合并及只读预检；新文档PR不自动合并。真实账号、数据库内容、服务和部署配置均未修改。完整UI像素回归、Source/team scope、类型切换/Intake、转单、DeliveryPlan UI、生产/关账Server仍属独立后续范围。

更新时机：main/PR、权限、来源、运行环境、入口、schema、备份或验收变化；新任务先实时核查。
