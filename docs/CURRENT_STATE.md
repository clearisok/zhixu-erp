# 当前状态

核实2026-10-15；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。GitHub为实时事实源；共享状态按下列阶段及SHA阅读。

- G1已精确交付[PR109](https://github.com/clearisok/zhixu-erp/pull/109) head `1fcc440f00eeab962eb766161eab96ed5f67c6b4`，source/team-access/baseline三项最终CI成功，GitHub可合并，复审建议作为Gate1合并；未合并或部署。最后修复为精确迁移升级、独立组件key及七角色页面测试覆盖。完整新商业流程仍须G2。
- G2 `2c6c2315`、G3 `39c9f7b6`及G4各工作树/提交保留，本地工程不等于远端送达。G2尚缺G1最后三笔兼容/测试修复；下一步显式整合、重验后独立PR，不自动合并。
- 当前 `feat/order-effective-attribution` 从 `b8473b6c` 继续；准备UI源码b63d6424/证据f96ce65c、26能力/旧27路径及全部旧截图/hash保留。此前23后台、10客户端、10新浏览器、原UI27及完整PG261等均属各自冻结阶段，不冒称本次重跑。[准备模块](features/ORDER_PREPARATION_ADOPTION.md)。
- 新发现并修复同批Normalizer短哈希碰撞误归并；保留全部旧ID、356去重和理论/采购双数量语义。16定向、根840、完整类型/Server编译/lint通过；新V0记录覆盖解析器精确路径，实际main源码基线PASS（10页/26能力/28累计UI路径）、基线78/78及显式Server构建通过（源码8d393605，buildId 20261015-100354）。[证据](tasks/active/material-identity-collision-guard.md)。不证明真实数据受影响；跨批/Artifact hash使用点仍需独立评估。
- G5现有页面调整/排序/事件入口、num_dyc与6086941固定只读来源仍待，身份主线不被其阻塞。真实字段需要独立验证，未将候选或样本公式当业务事实。

无真实账号/业务DB/凭据/Source/调度窗口、宁波或18443/18444操作；未自动合并或部署。自动审批曾连接失败，保护原现场；本次同一审批恢复后仅执行获准的本地修复与合成验证，不视为永久网络恢复。整个Goal尚未完成。上一状态[归档](tasks/completed/2026-10-15-pre-material-identity-current-state.md)。随main/PR、测试、来源或授权变化更新。