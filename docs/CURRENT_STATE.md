# 当前状态

> 2026-10-09；Quote Center 原版 UI / Server 收敛：**ENGINEERING PASS / USER UI ACCEPTANCE PENDING**。[审计、能力/权限及本轮验证](tasks/active/quote-original-ui-convergence.md)；[原版/Before/After 截图](tasks/assets/quote-original-convergence/README.md)。部署历史见 [归档](tasks/completed/2026-10-09-windows-trial-delivery-history.md)，不是当前部署指令。

## 当前工程能力

- D-099：PR #64 报价中心是视觉/信息架构基线，当前 Server 是数据、安全和业务能力基线；Server 化不能成为重新设计 UI 的理由。绿色侧栏/暖灰/白卡片、标题/更多/搜索筛选、组合单元格恢复。
- 新用户默认九个信息单元格 + 固定操作；十五个正式业务字段仍独立配置/导出。旧个人列顺序/宽度/可见性和 key 保留，不自动重写；主动恢复默认可切新组合布局。权限过滤包含子字段、tooltip 和 touch records。
- 新建 type-first 卡片主动创建、POST{} / processing CAS PUT、已创建 ID 和未知结果保护保持。共享 Editor 不重写，保留 PR83 常用成本字段、局部滚动/sticky/Portal，以及版本/Estimate/确认/附件/客户文件/内部汇总/日志能力。
- 本轮 Chromium62/62、隔离 API/版本/Estimate/附件38/38、auth/frontend67/67、presentation4/4、SSR2/2、npm674/674 PASS；typecheck/lint/Server及两种frontend build PASS，默认 build-info browser/browser/writable/session。四档桌面 + 390 touch、合成参考/前后截图146张；cleanup PASS。不是人工 UI 定稿。

## 真实环境与下一步

- Windows win01 历史部署 READY，用户已解决密码问题并登录；完整三张人工业务卡未确认。PR82 已合并；PR83 已合并；PR84 在本任务起始核实 OPEN。本轮未复核真实运行镜像，也未访问/更新试用目录、数据库、Browser、COS、秘密或旧3000/3001/3002。不能用本 PR 或 Git merge 声称已部署。
- 下一步：独立 UI PR 审查，并由用户人工查看列表/偏好、加工/经销新建、详情/成本、900 fine-pointer 与 touch。任何真实应用更新仍需独立授权，不重新 setup/init。
- 明确差异/延期：列表款式图占位，无 country/PV-name summary 接线；Server 新建不是 Browser 未保存整单编辑。整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理仍未支持，不伪造按钮能力。

## 并行订单工程

- 并行订单 C4.3 Server 领域已实现：独立 0009、集合 CAS/永久人工所有权、稳定默认行/null 恢复、drift 与专属 GET/PATCH。只 disposable PG；真实 0009、计划 UI、通用订单写入未执行，不增加 D-098 Quote-first 前置。工程验证/checkpoint 见 [独立报告](tasks/completed/2026-10-09-order-c43-delivery-plan.md)。以上试用部署状态保持不变。

## 永久边界

- D-096 历史导入 NOT REQUIRED；旧数据保留，不导入不是删除授权。D-097 Server 不读旧业务、不回退 mock/IndexedDB；D-098 Quote-first 试用范围保持。可信 session/RBAC、细粒度字段权限、精确 Decimal/null/zero、CAS/事务/审计和历史不可变不变。
- 工程、候选、真实部署、人工验收分开；默认 Browser 保持，正式远程必须认证授权/HTTPS；持久试用数据不得当作 disposable 清理。
