# PR92 整合 PR93 — 2026-10-12

## Gate0 baseline

用户授权只在 D:/workspace/zhixu-order-material-b / feat/ainuoke-order-material-progress 整合最新main，原PR92保持Draft，不新建PR、不部署、不合并PR92。原订单P6/精简详情/只读Control Tower用户人工验收已PASS；本轮为工程回归，不冒称重新人工批准。

正常fetch实际成功：origin/main **070d958008709d06636ba329a3bba0d14e4a023b**；PR93 MERGED，head bfa987ceaa586d97e85d9323d0e47dd4651f0140，merge070d958。B local/origin/PR92起始HEAD均 **03b1078e99ff44ceb875dd0b01a1e22358f4dab6**，relative main21 ahead/12 behind，共同祖先fcf36e5eab6c78254f808c1cba38f3a63a66d4f8，无分歧。GitHub PR92 OPEN/Draft，存在待解决冲突。

唯一继承dirty：docs/tasks/active/order-material-read-gate1.md，30行追加；实际SHA256 **8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E** 与用户基线一致。main未改该文件，因此普通merge无需stash/restore；严禁stage该文件，所有阶段后核对原hash及diff保持。其他工作树只通过git worktree list核对归属，不进入或修改A/其他checkout。

审查现有B执行只读链路与main正式D103：commercial.sale.view/edit、commercial.labor.view/edit已经Active；Quote成本、测算销售价、历史/导出/日志的分离投影和CCT部分PATCH保留。五个共享文件须做语义核对：AI_HANDOFF、CURRENT_STATE、server/app.ts、CCT集成测试、server-sales-order-detail-page.tsx。旧物料安全审计不能继续正向断言泄露；早期commercial-read-policy须查清引用，不能再充当独立运行时授权。

本轮无真实数据库/艾诺科/COS/18443/18444、migration、账号凭据或生产route激活。正常merge、不reset/clean/rebase/force/整文件ours-theirs。当前工程Gate尚未执行，旧测试数量不是本轮结果。