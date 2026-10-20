# 恢复点：Server 收敛 Gate 1

2026-10-20；Goal active。分支 `codex/server-persistent-empty-target`，7bf3 工作树，初始干净；核实 main `996dfedc12da3527343cd3ff2aa5eea35497e10e`，依赖 Gate 0 `652fed6464b5aea144689480c936a0c5f2d62d90`（草稿 #124 三 CI 通过，未合并）。本轮只有一个实现 owner 和一位只读 reviewer。

实际镜像 `zhixu-persistent-local:8175f628-20261020`，源码 `8175f6280d54b6d4af28cb2ebe6d86741b906b9d`，build `server-g1-8175f628-20261020` / `2026-10-20T00:27:36Z`。运维脚本在后续 checkpoint 继续修正，必须固定另一个完整 SHA；最终环境不能绑定正在变化的工作树。未建最终空目标。真实演练 r4/r5 完整 7/7 通过；r6 新增默认/指定 bundle 的内核只读挂载核验，进行中。42 ops、94 基线、类型及 lint 通过；最终精确门禁、PR 和 CI 待收口。完整结果和失败保留规则在 [Gate 1](tasks/active/server-convergence-gate1-2026-10-20.md)。

下一步：等待 r6 实际结果及 reviewer；不边测边改 ops。固定 reviewed ops 后在全新私有目录/项目/卷及空闲端口准备目标，显式 init/objects-init/start，再只读核对业务零行。证书只给进程显式信任，尚未安装系统信任；用户浏览器接受与工程 HTTPS 检查分开记录。完成最终文档/checkpoint、main 守卫、一次安全交付与独立远端 SHA/唯一草稿/CI。网络不明按 AGENTS 停止重复传输。

保护 3001/50426/59069、旧库/账号/来源样本和所有非本轮合成资产；不迁移旧业务，不切换 50426，不新增来源采集/绑定/激活/调度，不自动 merge/deploy/退役。D-147 CNY 销售／USD 工价是未来 Server 关账目标，不改既有报价公式或历史。Gate 2 固定 #120 `57daca3d` 与 #121 `4e075115`→#122 `349a8458`→#123 `ebe4cb16`，不得把旧 PR 验收当成新组合验收。

此前接力[逐字归档](tasks/completed/2026-10-20-gate0-state/AI_HANDOFF.md)，旧日期、hash、结果和限制均保留。
