# 当前恢复点：Gate4纳入最新依赖，保留D130请求恢复

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5已GitHub核实。原预览树clean/afb71f92切到既有feat/order-effective-attribution@036fe521，原ref保留；merge --no-ff --no-commit纳入G3 4da3590b（含G2 e3ce/G1 7ef），共同祖先f4a1b99。不是合main，无新树/重复PR。

冲突五处：AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX/ORDER_IDENTITY及准备组件。双方摘要/feature原文归档completed/2026-10-15-gate4-before-g3-preparation-retry.md。组件完整保留036原版本：sessionStorage outbox/fresh用户订单scope/刷新恢复/回执核验/稍后核对/离开保护，不能用G1简单修复降级。新丢回执测试需按Gate4行为验证close不能丢请求、稍后核对重开与原payload重试；不是删除测试。SQL及执行/来源代码未改。

旧036三CI成功，但PR112详情connector失败，不报新head/mergeable。本轮实际通过：有效归属/SQL保护45/45、执行/完整证据30/30、准备客户端10/10共85项，身份6/6＋准备10/10＋独立复核11/11共27浏览器，typecheck、Server编译、显式Server/session/snapshot/writable构建、全源码lint（排除继承outputs私有生成物）、root840/840、基线78/78及精确main守卫PASS（10页/26能力/28继承UI路径）。旧PG261等其他组未本轮重跑。本轮报告evidence/order-normalization/gate4-g3-preparation-retry-2026-10-15.md。

真实覆盖和具体permit仍缺，执行/纠正默认关闭；不读凭据/上游，不执行真实归一、迁移、账号/业务DB、首绑/调度/宁波18443/18444或部署。G5树及Source48b63101保持，旧四单窗口不重启。Git NETWORK_DEGRADED，AGENTS禁止自动恢复推送；最终本地commit与远端/CI分开，不自动合并。
