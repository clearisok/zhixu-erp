# 恢复点：CI成本控制本地策略已验证

2026-10-25；branch codex/ci-cost-controls-main-9d65，main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf。只有三工作流各六行：PR按workflow/event/number替换旧运行，manual按run_id独立；原setup-node固定SHA启用npm/cache-dependency-path。原触发/permissions/15-20-20超时/7-8-8步骤及所有测试/env原样保留，未用paths或跳过测试节省成本。

三YAML解析/移除新增后结构及LF原文等价/六分组样例通过，未安装/运行Actions；ignored outputs/ci-cost-controls-20261025保留原文hash和policy-checks。按该目录final-checkpoint.json与final-guard.json的实际head核对独立复审/当前base守卫/单次checkpoint；同HEAD成功结果直接复用，缺失不视为通过。不将本地结构检查冒称HostedCI，真实PR前134及三必要检查不省。

完整Goal不变。当前CI分支以main为基线，未携带本地累计业务；b611c61f65227113b6203d23a1a0fe46cce4537b保留完整G1–G8/R就绪审查，7da954545bd9b720bfc28edbd313bc387dd5c195保留成衣工程终态。62426仍旧8175构建、50426未观察到监听且原因未知；仅原轮只读观察，当前不重复查询或改变运行环境。

PR129仍唯一草稿、三项原CI通过，具体合并确认待答复。Git STOP不清除，不上传其他分支、不合并部署、不操作真实Source/账号业务库/卷。关账三问、来源额度/启用、目标切换、用户接受和旧环境退役分别保留边界。

读[当前CI任务](tasks/active/ci-cost-controls-2026-10-25.md)。main原交接在[精确main版本](https://github.com/clearisok/zhixu-erp/blob/9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf/docs/AI_HANDOFF.md)，所有原hash/失败/结果保留；不是当前待执行步骤。Goal仍active。
