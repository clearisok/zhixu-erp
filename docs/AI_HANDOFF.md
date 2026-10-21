# 恢复点：到料只读浏览器验收的原子激活

当前fix/material-arrival-browser-activation从干净c0d87bcd55fbda58db101f46d6e61b07f77db7df开始；main996dfedc12da3527343cd3ff2aa5eea35497e10e不变。先读[新任务](tasks/active/material-arrival-browser-activation-2026-10-22.md)。只改测试harness和状态文档；静态发现Source completion→arrival reload会在两次CDP enabled检查/click之间禁用按钮，需受控GET屏障复现，不能倒推原CI根因。原c0d镜像阶段精确守卫及发布116通过、精确远端已核，Release另在跑；下文保留其恢复信息，最终本阶段收口再压缩。

2026-10-22；chore/server-current-image-0042，干净输入105cfbfcb336c0c29efe583f9ff09fda52bc07f0，main996dfedc12da3527343cd3ff2aa5eea35497e10e。root唯一writer、既有reviewer只读。先读[当前镜像任务](tasks/active/server-current-image-0042-2026-10-22.md)；本阶段无应用/SQL/ops/测试/UI变化。scope64f7、冻结报告88c2bdd645d7e3a8972a91e507be6ad836554452；manifest267/57，原266/57及其他字段不变，独立证据review无P1/P2，main996/head88工作守卫PASS。最终文档提交后核精确守卫/原工具交付/仅发布CI，不把parent三项归到新文档SHA。

新镜像zhixu-persistent-local:105cfbfc-20261022从独立精确105 archive一次构建，image sha256:646acc4a19b19209009e3b230a107c8ea1bf4ece2fe3a1c2ab7d5ff283578071，build server-candidate-105cfbfc-20261022，时间2026-10-21T22:53:53Z。原actual-image测试一次8/8（317334.7113ms，无skip），41迁移/最大0042；合成quote/PNG、restart/cold、备份、另一空目标恢复及拒绝路径均通过，仅自有成功prepare fixture已清理。日志/精确archive在ignored outputs/current-image-0042，镜像保留、无新运行入口。不可重跑bind-engineering.mjs，不编辑冻结报告。

输入105已远端精确核实：一次Execute返回STOP但remoteSha精确105，原工具后续DryRun pushes=0 DELIVERED_VERIFIED；原STOP保留，未重推。Team39689484921与Release39689490085 attempt1 success。Source39689481386于23:07:03Z failure：material-arrivals-ui第“read-only role…”阶段等待“分批预计到料”超时。原应用源码ff8，新字段是GET只读交期覆盖；尚未判断CI失败根因，先读实际test/component/fixture，不扩大timeout或盲目dispatch。工作流随后quote/Python步骤未运行，不称通过。只读snapshot可用outputs/delivery-coverage/ci-snapshot.mjs；已用ci-dispatch.mjs不可重跑。原[交期覆盖任务](tasks/active/server-delivery-coverage-2026-10-22.md)和[报告](tasks/completed/2026-10-22-current-delivery-coverage-engineering.md)保留15/76/927/116、锚点P2首败与修复，不能编辑冻结报告补CI。

原[DeliveryPlan任务](tasks/active/server-delivery-plan-receipts-2026-10-22.md)144已精确远端且三CI success，原source12cf/report98580不变。[就绪审计](tasks/active/server-convergence-release-readiness-2026-10-22.md)、7d历史整合及其归档仍有效。原PR120–127未合并草稿/heads不变，当前仅验证引用，不新建重复累计PR，不自动merge/close/部署。

新交付计划交互尚未实施：Server目前只有SavedDeliveryPlans GET，Browser writer不可复用。线程visualizations目录有待QA的本地合成草图delivery-plan-review.html，需完整重读visualize skill、修正草图的取消/unknown/全部作废语义并在私密浏览器QA；同轮最终答复须包含内容引用。新按钮/Modal属V2，需要AGENTS要求的具体批准与精确影响记录，不能当V1或已接受。此项不阻塞后台CI修复。

3001、50426/59069/62326/62426及全部旧端口/卷/账号/Browser/工作树保持；旧f469 image不包含0042，新镜像未切旧入口。无真实Source/凭据/私密报告读取、绑定、激活、调度、业务库操作或退役。Num/outdate已确认，不重问；固定C1/C0/C1额度、加工产值/CNY工价/关账stale仍待原问题，不默认。Goal active，不能标完整或因CI修复困难标blocked。
