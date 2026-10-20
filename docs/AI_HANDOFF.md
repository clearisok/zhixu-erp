# 恢复点：Server 收敛 Gate 1

2026-10-20；Goal active。分支 `codex/server-persistent-empty-target`，7bf3 工作树，初始干净；核实 main `996dfedc12da3527343cd3ff2aa5eea35497e10e`，依赖 Gate 0 `652fed6464b5aea144689480c936a0c5f2d62d90`（草稿 #124 三 CI 通过，未合并）。本轮只有一个实现 owner 和一位只读 reviewer。

实际镜像 `zhixu-persistent-local:8175f628-20261020`，源码 `8175f6280d54b6d4af28cb2ebe6d86741b906b9d`，build `server-g1-8175f628-20261020` / `2026-10-20T00:27:36Z`。固定 ops 为 `d084a586586c54222f62df36961c51704a7a6c34`，20 个文件逐字节匹配 Git blob，位于 `D:/zhixu-server-convergence/tools-d084a586`。新空目标 `https://localhost:62426` 已 READY，62 张业务表零行、1 个技术管理员、29 项 schema。真实演练 r4/r5 完整 7/7 通过；r6 内核检查发现 Windows Compose 未落实命令行只读参数，已改为固定最终 Compose 层；r7 完整 7/7 通过（320675ms）。42 ops、94 基线、类型及 lint 通过；最终精确门禁、PR 和 CI 待收口。完整结果和失败保留规则在 [Gate 1](tasks/active/server-convergence-gate1-2026-10-20.md)。

下一步：最终文档/checkpoint、精确 main 守卫、一次安全交付与独立远端 SHA/唯一草稿/CI；最新代码的独立静态复审无阻塞。新空目标已显式初始化并只读核对零业务，不再运行 init。证书只给进程显式信任，尚未安装系统信任；用户浏览器接受与工程 HTTPS 检查分开记录。完成最终文档/checkpoint、main 守卫、一次安全交付与独立远端 SHA/唯一草稿/CI。本轮默认 Git 只读探测 uncertain_transport，两个显式进程级对照通过；无共享配置改动，未 push 本分支，网络根因未证明已修复。按 AGENTS 不自动恢复交付，准备具体最终 SHA 后请求一次恢复授权；等待时可继续同一基线的 Gate 2 本地整合。

保护 3001/50426/59069、旧库/账号/来源样本和所有非本轮合成资产；不迁移旧业务，不切换 50426，不新增来源采集/绑定/激活/调度，不自动 merge/deploy/退役。D-147 CNY 销售／USD 工价是未来 Server 关账目标，不改既有报价公式或历史。Gate 2 固定 #120 `57daca3d` 与 #121 `4e075115`→#122 `349a8458`→#123 `ebe4cb16`，不得把旧 PR 验收当成新组合验收。

此前接力[逐字归档](tasks/completed/2026-10-20-gate0-state/AI_HANDOFF.md)，旧日期、hash、结果和限制均保留。
