# PR125用户批准合并与当前主线核实

2026-10-24，用户明确回复call_59a98c02f2f04ba48165a3c118badf5a：“批准仅合并 #125”。仅将PR125由草稿转就绪、merge commit，未关闭其他PR/删除分支/部署或操作真实业务数据。

## GitHub已核实事实

- 原main e01a11952b648024c0bd6bf4259de429374981e2；PR head 4f721ecd7ec1a0e31805d7d2a5bdb8600d8a477d。
- 2026-10-24T15:40:08Z实际合并 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf，精确双父为上述原main和PR head，代码树 b1abcc6d8d6b7ce6e228d081582c878a3b1cdb61，与已验收head及合并预览一致。
- 独立API 2026-10-24T15:41:08.701Z核实PR merged=true/state=closed、实际main为合并SHA、原分支codex/server-persistent-empty-target仍在原head。原提交历史与分支保留。
- 原head三项PR检查source/baseline/team-access全部completed/success；对应run40072506615/40072506617/40072506633。没有手动rerun/dispatch，不以这三项CI证明后续Server或0044增量。
- 一次git fetch --no-tags origin main退出0并核实origin/main。该次成功只证明当前取回新主线，不宣称Git推送通道长期恢复；NETWORK_DEGRADED下不逐Gate重推。

## 本地前向整合与边界

当前target准备source 747e4783dd0aa56e8806420c2021225e0610565f 已包含原PR head历史；新main与其merge-base为4f721ecd7ec1a0e31805d7d2a5bdb8600d8a477d，只读merge-tree与当前产品树相同。现在以真实双父merge前向保留新main历史，仅状态/证据文件调整。后续累计候选必须对新main重新精确守卫并在交付前完成必要CI，不移用旧N守卫。

本报告只将持久化空目标的merged维度记为已合并；旧隔离重启/恢复测试保持其原source，deployed、user-accepted、source-activated不因此变化。3001/50426/59069/62426、Browser、备份及既有卷均未操作，50426切换和退役另需授权。
