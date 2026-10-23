# 恢复点：原 PR120 的 main 前移整合

2026-10-23；root 唯一 writer，既有 reviewer 只读。先读 CURRENT_STATE、[阶段任务](tasks/active/pr120-main-forward-2026-10-23.md)、AGENTS 和实际 git status。

主基线 `e06162c70c9792895c30030216dc8c2a66368069`；原 #120 `57daca3d3f23f39f0aafff57502f490206b10084`。新 `codex/pr120-main-forward` 从精确 main 干净建立，当前合并原 #120，四处文档冲突由本阶段解决；业务源码/测试保持原 57d，main 守卫/134 项测试保持 e061。不得把这棵树当作累计候选 7c，也不改原运行环境。输入三摘要及单份 UI impact 已逐字归档。

真实双父 H=`5deb87590833de050280f6cfa2163595aaa72511`、parents=[e061,57d] 已保存；两条 H 同路径见证追加至 217/46，旧 215 不变。源码 checkpoint=1b64e27f，显式 e061 门禁、134 发布、其余 804 源码、34 合成 DB/API、6 Chromium 已通过且终态；全部 0 失败/取消/跳过。仓库外精确 Git archive 快照的类型/Server 编译/lint/Server 构建通过。首轮 root 类型检查 48 错均来自保留的 ignored 旧镜像上下文，未删除/改写，也不修改 tsconfig；两次范围分别记录。静态独立复审无 P1/P2。所有测试 handle 已终态，不重复运行。

接下来最终文档 commit/精确 e061 门禁/最终 diff 复审，再核对交付映射。若原本地 `codex/price-source-stabilization` 仍精确 57d 且不被其他 worktree 占用，可在本 root 干净切换后 --ff-only 到验收后的整合提交，再使用既有同名工具更新唯一 #120；否则停止该引用更新并保留 checkpoint。不得把新隔离分支送达冒称原 PR 已更新。

站立授权覆盖有界安全 Git 恢复交付，无需再次逐 SHA 询问；NETWORK_DEGRADED 仍须诊断、一次 push 及独立 exact 核对，不改认证/共享配置。本轮三组 Git 只读对照均通过，但不证明长期 push 可靠。远端送达和新 CI 仍待执行；按任务记录区分旧证据。不自动 merge/close、正式部署、旧入口切换/退役或真实数据操作。#126 已合并、#127 仍草稿。完整 Goal 继续，不重读已消耗的 Source 固定范围，不默认待决业务规则。
