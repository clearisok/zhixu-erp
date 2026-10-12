# AI handoff

当前任务 feat/ainuoke-server-source，核实日期2026-10-12，main基线5215ef75510e4b55ef69b1ae1508816b80fda110；独立worktree起始clean。
用户授权保持UI、按订单展示采购/入库/出运/出库、合成测试/PR/复审；禁止真实账号/DB/部署/自动merge。Ubuntu须待艾诺科持续展示后上线（D-105）。
实现、边界、未来私密凭据条件见[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务](tasks/active/ainuoke-server-source.md)、[冻结工程证据](tasks/active/evidence/ainuoke-server-source/engineering.md)。
G1代码458c8f3b9b1bbb026644070bb47cc5cc290d5ed7；G2补齐Linux CLI、聚合限制、历史迁移断言。来源20 PASS+1 Windows SKIP、Python52、PG261、FreshStart7、typecheck/serverbuild/lint/Browserbuild及G1镜像包装PASS。root测试/基线待冻结绑定后重跑，Linux CI必须过再给最终合并意见。
LOCAL ENGINEERING本地checkpoint；REMOTE DELIVERY待最终精确SHA交付。起始fetch失败，gh API独立确认main与本地对象一致；无共享配置修改。
未激活Source，无scheduler/首次正式订单绑定/生产路由开放；不要把PR完成写成Ubuntu上线就绪。下一步全门禁、PR/CI及复审。旧状态见tasks/completed/2026-10-12-ainuoke-source-predecessor-state.md。
更新时机：checkpoint/main/测试/PR/风险变化。
