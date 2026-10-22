# 恢复点：固定核验配置修复待精确交付与CI

2026-10-22；fix/garment-filter-metadata-screening，从main996dfedc12da3527343cd3ff2aa5eea35497e10e建立后仅FF到完整31cad6f71dced9f1ad399b13dd1b4871d2234abc。scope16834a286868b095d72b7323cbbb46cdf88b56fc，唯一源码a98e4da5bff5b772bea292abdf33bc179a614fd6。先读[当前任务](tasks/active/garment-filter-metadata-screening-2026-10-22.md)，输入摘要在completed/2026-10-22-garment-filter-screening-inputs/31cad6f7/。root唯一writer、既有reviewer只读，不新增agent。

F前置三CI39694581228/39694584779/39694588911均attempt1/success；原一次Execute STOP和零push DryRun DELIVERED_VERIFIED保留，raw stderr缺失所以不猜根因。旧105失败、c0d镜像和144等冻结历史不改。manifest仍268/57，本阶段没有新能力或UI，故不变更证据或状态标签。

用户已批准call_82b77df8b11943008db22015f0c7a1d1。唯一真实工具调用在00:00:21.957Z→00:00:27.519Z本地candidate失败，0 HTTP/0报表/未读凭据。不要重跑outputs/material-arrival-activation/run-authorized-filter.mjs或删除其wx尝试记录；authorized-filter-attempt.json与receipt.json保留。失败即停，真实合同过滤仍未验证，不自动重试或扩大范围。

root仅离线既有私密reader校验冻结候选，包装ed6f…655/raw a6c5…afa1和旧tooling2688均正确，16行/唯一合同/16id。公开diagnostic-4只有布尔、计数、hash；不读凭据。配置编码后深度13/组合19误触inspect12/screen16。现固定Node/Python局部walker浅键复用原秘密规则，统一组合64，严格解码/重复键/反射/资源异常保持；通用inspect/payment和条件/hash/预算全未改。离线原readFrozenGarmentCandidate通过，未调用collector。

源码a98e：Node17/17（19029.9317ms）、Python全169、typecheck/full lint/Server和显式Server前端build、release116/116（186116.334ms）PASS；独立静态review无P1/P2。buildId server-garment-filter-a98e4da5-20261022/full sourcea98e/声明时间2026-10-22T08:14:40+08:00/session/Server/writable/snapshot。未重跑项目927/PG270或像素；无UI/SQL变化。工作区guard checkedHead16834/main996 PASS，最终文档提交后再做精确guard；不把工作区guard冒称最终HEAD。

下一步只提交本阶段metadata、精确guard和原工具一次Execute；不确定则只读核实，不盲推，站立授权可自行安全交付但不改共享Git配置。核实精确远端后，仅dispatch Source381965110/Team381876271/Release381772612一次并保存消费记录，后续只读poll，不创建重复累计PR或merge/close/deploy。新CI结果不得沿用F成功。随后默认关闭的成衣控制层可合成推进：持久started、唯一worker、发布/成功回执原子或Source-free恢复；不要照搬payment先发布后terminal窗口，也不跨网络持锁。正式extractor严格页号与诊断0 sentinel尚有界限，未取得真实分页证明。

交期UI仍待原具体批准；visualizations/delivery-plan-review.html是合成草图，没有产品改动，更新前读完整visualize skill。Num/outdate不重问；原加工产值/CNY工价/关账stale不默认。保护3001与所有旧环境/卷/账号/Browser/工作树。无新真实请求、业务库/迁移/绑定/激活/调度或运行切换；完整Goal active。
