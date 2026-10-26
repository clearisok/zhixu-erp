# 恢复点：新业务域非空恢复

2026-10-26；核实main 869ee84dd0b31de6161011e4aa560678b244a64d，本地分支 codex/persistent-cumulative-43-main-869e；阶段输入 61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，tree 46900a09200739db4a9e528c33b8fdc5331abac9，开始时工作树干净。唯一草稿[PR130](https://github.com/clearisok/zhixu-erp/pull/130)仍精确指向61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，三项CI首次成功、最终独立复审0P1/P2，未合并。原Git退出1的STOP_AUTH_OR_DIVERGENCE及根因未定保持；独立本地工程不解除远端Git/ref写冻结。

先读[当前阶段](tasks/active/nonempty-domain-recovery-2026-10-26.md)、outputs/domain-recovery-20261026的start/source-checkpoint/验收回执。若实际进程仍live只观察原handle；禁止因观察超时重启或自动重试。

source checkpoint后canonical archive逐blob校验，复用现有依赖不安装；独立预审后一次运行owned合成项目。冷重建及恢复后核对业务表、领域/history/receipt；维护停写后冻结全部public表hash与sequence，在新目标恢复后启动/login前比较。原id、decimal、版本、审计与回执不得丢；要求相关表非空，失败停止保留自有现场。新工程结果尚待真实回执，不提前PASS。

3001/50426/59069/62426及旧账号、库、对象、卷、网络、备份和Browser数据保持；不使用真实凭据或发起Ainuoke请求，不绑定/激活真实Source，不push/API改ref、新PR、CI、merge、正式部署、入口切换或退役。仅本地checkpoint。完整G1–G8/R继续；跨次成衣稳定事件/更正、关账三项口径、真实Source授权和人工接受仍待后续，不把本阶段缩作整个目标。
