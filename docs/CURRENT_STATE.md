# 当前状态

核实2026-10-15；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。当前feat/order-commercial-versions，从2c6c2315d4b295dba2c6f73f651255f775790b99/clean整合G1最终1fcc440f00eeab962eb766161eab96ed5f67c6b4。本地依赖合入不等于合并main。

G1 [PR109](https://github.com/clearisok/zhixu-erp/pull/109)精确head已独立核实，source/team-access/baseline三CI成功、GitHub可合并，说明更新，未合并部署。修复包括严格旧ledger1–11、精确升级、新组件key与七角色完整UI测试。

G2保留0015独立订单商业版本、精确Quote/CCT候选及显式采用、旧订单共享写价拒绝、字段权限、七角色和只读历史预览。原29商业、19旧商业/API、4浏览器、完整PG261及源码817/基线78为既有分阶段证据，不能写成本次重跑。现显式升级/fresh-start最终ledger1–12/14/15，旧库样本仍1–11；没有漏过0015、动态放松清单或修改SQL。

本次冲突仅AI_HANDOFF/CURRENT_STATE，两方原文均归档保留；产品代码自动整合后需重跑来源升级、fresh-start、商业/身份、类型/lint、候选浏览器及精确发布门禁。未获得本分支最终CI或远端交付结论，下一步验证后独立PR。

G3、G4及后续工作树和提交保留，按各自源码证据阅读，旧文档“未开始”不代表它们不存在。G5独立继续，不阻塞订单身份主线。无真实数据库/账号/Source操作、宁波或18443/18444部署，不自动合并。GitHub为实时工程事实源；随main、PR、测试及授权变化更新。
