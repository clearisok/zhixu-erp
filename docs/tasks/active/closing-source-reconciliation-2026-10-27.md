# Gate8G2h：来源数量与颜色明确复核

2026-10-27；branch `feat/order-closing-month-plan`，clean输入51e393614ad8418745175793aa3f66d3a0a15326；核实main沿用869ee84dd0b31de6161011e4aa560678b244a64d，无fetch或远端写。原Git/ref STOP未解除。

为既有镜像恢复的真实依赖补齐D169已批准的显式复核。G2g的source78规范准备保持build=0/rehearsal=0；新来源代码必须另建候选身份，不复用78身份或先前镜像结论。实现见[契约](../../features/SERVER_CLOSING_SOURCE_RECONCILIATION.md)，0050不重写旧迁移。

当前源码已经过16项模型正负控、严格客户端及HTTP/PG检查。早期SQL别名冲突、测试误用manifest表名、JSON null前置保护均已复现和修复，原失败日志保留。扩大回归中31/33通过，两项旧升级测试需识别新增nullable列，修复后定向2/2通过，并明确验证旧列完整、观察列为SQL NULL；不把失败原件抹去。最终类型/lint/精确源码/独立复审及发布守卫另行记账，未通过项不预报。

验收只使用新owned合成PostgreSQL。保留旧原身份、完成量、商业/财务快照、冻结manifest和原回执；61104演示及用户输入、现有环境/Browser/卷/备份不停止、不重seed、不替换。无真实Source读取、账号或业务库变化、Hosted、推送、合并、正式部署或资产退役。完整收敛目标未完成；Source复核具体UI、执行方匹配UI和独立USD采用UI仍分别处理。
