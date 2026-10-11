# PR92 整合 PR93 — 2026-10-12

## Gate0 baseline

用户授权只在 D:/workspace/zhixu-order-material-b / feat/ainuoke-order-material-progress 整合最新main，原PR92保持Draft，不新建PR、不部署、不合并PR92。原订单P6/精简详情/只读Control Tower用户人工验收已PASS；本轮为工程回归，不冒称重新人工批准。

正常fetch实际成功：origin/main **070d958008709d06636ba329a3bba0d14e4a023b**；PR93 MERGED，head bfa987ceaa586d97e85d9323d0e47dd4651f0140，merge070d958。B local/origin/PR92起始HEAD均 **03b1078e99ff44ceb875dd0b01a1e22358f4dab6**，relative main21 ahead/12 behind，共同祖先fcf36e5eab6c78254f808c1cba38f3a63a66d4f8，无分歧。GitHub PR92 OPEN/Draft，存在待解决冲突。

唯一继承dirty：docs/tasks/active/order-material-read-gate1.md，30行追加；实际SHA256 **8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E** 与用户基线一致。main未改该文件，因此普通merge无需stash/restore；严禁stage该文件，所有阶段后核对原hash及diff保持。其他工作树只通过git worktree list核对归属，不进入或修改A/其他checkout。

审查现有B执行只读链路与main正式D103：commercial.sale.view/edit、commercial.labor.view/edit已经Active；Quote成本、测算销售价、历史/导出/日志的分离投影和CCT部分PATCH保留。五个共享文件须做语义核对：AI_HANDOFF、CURRENT_STATE、server/app.ts、CCT集成测试、server-sales-order-detail-page.tsx。旧物料安全审计不能继续正向断言泄露；早期commercial-read-policy须查清引用，不能再充当独立运行时授权。

本轮无真实数据库/艾诺科/COS/18443/18444、migration、账号凭据或生产route激活。正常merge、不reset/clean/rebase/force/整文件ours-theirs。当前工程Gate尚未执行，旧测试数量不是本轮结果。
## Gate1 — main 语义合并

正常 merge --no-ff origin/main；真实冲突仅 AI_HANDOFF、CURRENT_STATE、server-sales-order-detail-page。两份文档逐段协调，双方历史恢复信息原文归档至 completed/2026-10-12-pr92-pr93-pre-integration-handoff.md；保留 PR84/PR91 部署证据、D103 Active 及原 P6 人工验收事实。PROJECT_INDEX 自动合并的 PR93 Draft 状态已改为已合并。

五文件审查：server/app.ts 保留可选 Material GET 的 session/order.view/style_progress.read/可信订单范围/固定 Source，以及 CCT commercial-terms-read.v1 投影与部分 PATCH；CCT 集成测试保留共享当前值、精确 provenance、null/0、币种、CAS/事务审计规则。订单详情保留 B 紧凑布局、颜色、物料摘要、技术折叠及 UUID 返回；采用 main ClientDto/四键和部分 PATCH。执行模式不发 CCT GET/PATCH、不挂载金额卡片/编辑器；非执行模式不挂载无权字段输入。统一单一请求 epoch，订单/用户/权限/模式 scope 变化先隐藏旧状态并清空草稿，忽略过期成功/失败及 PATCH/409 reload；物料摘要按同一 scope 重新挂载。

本轮实际检查：typecheck PASS；订单详情定向 ESLint PASS；CCT Client + CCT/商业权限/linked terms/物料 HTTP **52/52 PASS**（随机 disposable PostgreSQL，真实 session，合成数据）；diff-check PASS。完整 PostgreSQL、浏览器及全量质量检查仍待执行。继承 dirty SHA256 保持 8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E，未 stage。
## Gate2 — 负向安全审计及历史 helper

Gate1 普通 merge checkpoint **a252d82791d3b0cf2a216cc2939a64ec9caf50c7** 已正常推送。旧 order-material-security-audit 的泄露正向断言已全部替换为真实 HTTP 负向测试，复用 PR93 disposable fixture。匿名401，viewer/cost/sale/labor/full五种授权，Order/Quote同一CCT字段 envelope、敏感值缺失、no-store、只读不能PATCH、现有session撤权后无缓存值、默认Material503均验证；普通viewer未补商业授权。

rg证明早期 commercial-read-policy 仅有测试引用。它已移到 __tests__/historical-commercial-read-policy.ts，明确 deprecated/历史测试专用；原root测试仅验证历史边界，不充当生产授权。运行时唯一CCT权限投影保持 server/confirmed-commercial-terms/read-projection.ts；Material DTO不接商业字段。

本轮实际：Source/Gate1/Gate1.5/物料纯投影/历史helper **78/78 PASS**（5000需求投影+搜索485.3ms）；Material HTTP+新负向审计 **19/19 PASS**；改动文件定向ESLint PASS。来源日期异步推进、unknown/zero、厂供、BillNo/Inside漂移、缺页/身份冲突、跨订单隔离、价格/事件去重均保持。尚未完成全量和浏览器Gate。继承dirty原hash未改变。