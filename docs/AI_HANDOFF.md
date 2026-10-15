# 当前接力：G1三CI通过，共用物料身份保护收口

2026-10-15；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；本分支feat/order-effective-attribution，阶段起点b8473b6c39ba371059beab3979eb304c68faf0e1。起点只有同阶段已知红测，无未知dirty。G1已精确1fcc440送达、PR109三CI成功且说明更新，未合并；不要再推同一head。当前G2/G3/G4工程未送达，不沿用旧摘要“开放仅108”。

同批短哈希碰撞修复已应用：完整结构化规范身份比较，保留旧ID/重复行/理论和实际采购语义。原12红测3PASS/9FAIL，最终16/16；根840/840、类型（incremental false）、Server编译与全lint通过。无真实数据或账号访问；原六项真实单位冲突不能归因于合成碰撞。报告tasks/active/material-identity-collision-guard.md、D131及精确V0记录已补。下一步构建、源码checkpoint、D131前向冻结和精确main基线/78项回归，独立commit；旧D130及PNG/hash不改。

随后G2现有工作树order-commercial-versions，head2c6c2315d4b295dba2c6f73f651255f775790b99/clean，共同祖先def98f275。需显式合入G1 b4973670/a40cb7de/1fcc440三笔修复，保护0015、商业版本/权限和双方证据，不自动rebase/reset/clean。重新跑升级/fresh-start/七角色与商业回归、门禁后交付唯一PR；后续G3/G4按依赖继续。

先前准备UI与归一完整恢复点、失败原因和冻结证据见[归档](tasks/completed/2026-10-15-pre-material-identity-ai-handoff.md)。G5排序/事件/num_dyc/6086941仍独立待实施。跨批Browser/hash兼容另行评估，不改长期Browser数据。无真实DB/Source/部署/自动合并授权扩大，整个Goal未完成。