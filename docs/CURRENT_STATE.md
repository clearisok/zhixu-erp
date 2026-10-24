# 当前状态：独立CI成本控制本地候选

2026-10-25；实际main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf，branch codex/ci-cost-controls-main-9d65，从main建立、初始dirty空。三必要工作流自动触发仅PR，保留workflow_dispatch；本次各新增并发控制和npm下载缓存，其他字段/步骤/命令/env经解析与原文双重比较完整保留。类型/数据库/UI/公式没有变化。

本地三YAML解析与策略等价、六个分组输入样例、diff whitespace通过；使用现有锁定js-yaml，不安装。实际缓存命中/取消及费用收益尚未观测，未触发付费工作流。独立复审及最终精确守卫按outputs/ci-cost-controls-20261025的同HEAD回执核对；不存在不视为通过，相同HEAD已通过则复用。真实PR前仍保留134及三必要CI。

完整Goal不变。当前CI分支以main为基线，未携带本地累计业务；b611c61f65227113b6203d23a1a0fe46cce4537b保留完整G1–G8/R就绪审查，7da954545bd9b720bfc28edbd313bc387dd5c195保留成衣工程终态。62426仍旧8175构建、50426未观察到监听且原因未知；仅原轮只读观察，当前不重复查询或改变运行环境。

PR129仍唯一草稿、三项原CI通过，具体合并确认待答复。Git STOP不清除，不上传其他分支、不合并部署、不操作真实Source/账号业务库/卷。关账三问、来源额度/启用、目标切换、用户接受和旧环境退役分别保留边界。

本阶段[契约与证据](tasks/active/ci-cost-controls-2026-10-25.md)。main输入原状态保留于[精确main文件](https://github.com/clearisok/zhixu-erp/blob/9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf/docs/CURRENT_STATE.md)，不把其旧日期/PR125未合并语句当当前状态。
