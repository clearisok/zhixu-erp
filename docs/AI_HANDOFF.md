# 恢复点：原 PR120 的 main 前移整合

2026-10-23；root 唯一 writer，既有 reviewer 只读。先读 CURRENT_STATE、[阶段任务](tasks/active/pr120-main-forward-2026-10-23.md)、AGENTS 和实际 git status。

主基线 `e06162c70c9792895c30030216dc8c2a66368069`；原 #120 `57daca3d3f23f39f0aafff57502f490206b10084`。新 `codex/pr120-main-forward` 从精确 main 干净建立，当前合并原 #120，四处文档冲突由本阶段解决；业务源码/测试保持原 57d，main 守卫/134 项测试保持 e061。不得把这棵树当作累计候选 7c，也不改原运行环境。输入三摘要及单份 UI impact 已逐字归档。

接下来：先提交真实双父 H=[e061,57d]，再为 DECISION_LOG/ORDER_BUSINESS_SOURCE 两条旧侧证据追加 H 的同路径见证；215→217 证据/46 能力，旧节点不变。运行精确 e061 门禁及所需回归，独立复审后收口。若原本地 `codex/price-source-stabilization` 仍精确 57d 且不被其他 worktree 占用，可在本 root 干净切换后 --ff-only 到验收后的整合提交，再使用既有同名工具更新唯一 #120；否则停止该引用更新并保留 checkpoint。不得把新隔离分支送达冒称原 PR 已更新。

站立授权覆盖有界安全 Git 恢复交付，无需再次逐 SHA 询问；NETWORK_DEGRADED 仍须诊断、一次 push 及独立 exact 核对，不改认证/共享配置。不自动 merge/close、正式部署、旧入口切换/退役或真实数据操作。#126 已合并、#127 仍草稿。完整 Goal 继续，不重读已消耗的 Source 固定范围，不默认待决业务规则。当前所有新测试、远端送达和 CI 仍待执行，按任务记录区分旧证据。
