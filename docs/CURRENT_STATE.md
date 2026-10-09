# 当前状态

> 2026-10-09；Quote Center 原版 UI / Server 收敛：**ENGINEERING PASS / USER UI ACCEPTANCE PENDING**。[审计、能力/权限及本轮验证](tasks/active/quote-original-ui-convergence.md)；[原版/Before/After 截图](tasks/assets/quote-original-convergence/README.md)。部署历史见 [归档](tasks/completed/2026-10-09-windows-trial-delivery-history.md)，不是当前部署指令。

## 当前工程能力

- D-099：PR #64 报价中心是视觉/信息架构基线，当前 Server 是数据、安全和业务能力基线；Server 化不能成为重新设计 UI 的理由。绿色侧栏/暖灰/白卡片、标题/更多/搜索筛选、组合单元格恢复。
- 新用户默认九个信息单元格 + 固定操作；十五个正式业务字段仍独立配置/导出。旧个人列顺序/宽度/可见性和 key 保留，不自动重写；主动恢复默认可切新组合布局。权限过滤包含子字段、tooltip 和 touch records。
- 新建 type-first 卡片主动创建、POST{} / processing CAS PUT、已创建 ID 和未知结果保护保持。共享 Editor 不重写，保留 PR83 常用成本字段、局部滚动/sticky/Portal，以及版本/Estimate/确认/附件/客户文件/内部汇总/日志能力。
- PR #86 原工程验证：Chromium62/62、隔离 API/版本/Estimate/附件38/38、auth/frontend67/67、presentation4/4、SSR2/2、npm674/674 PASS；typecheck/lint/Server及两种frontend build PASS，默认 build-info browser/browser/writable/session。四档桌面 + 390 touch、合成参考/前后截图146张；cleanup PASS。不是人工 UI 定稿，也不是本次 PR #84 合并验证结果。

## 真实环境与下一步

- PR #82/#83/#85/#86 已合并；最新 main `6e40b4318e59f8cc54adfe1aeb3d3e3d90a72613`。PR #84 本轮普通 merge 并人工整合文档，仍待用户合并；PR #88 D-099 新候选仅构建/准备，尚未部署。
- PR #84 已执行的 Windows win01 更新：app/gateway `zhixu-quote-trial-ui:878de323d618`，source `878de323d618b25fca1f51ccf3f024e932641742`，build `quote-trial-ui-20261009` / `2026-10-09T07:20:46Z`；当时真实 HTTPS、CLI READY、三服务 healthy，数据库容器/镜像/卷、TLS和持久业务保持。完整备份、部署身份与管理员/受限账号、2 Quote/Revision/PV及2附件 bytes/SHA验收见[独立更新报告](tasks/completed/2026-10-09-windows-quote-trial-ui-update.md)。这些是原执行证据，本轮未复核真实运行环境。
- 用户新 UI 与完整三张业务卡人工验收 PENDING；旧候选已部署不代表 D-099 新候选已部署。下一步用户审查 #84、人工查看列表/偏好、两类型新建、详情/成本及窄屏/touch；任何后续真实更新需独立授权，不重新 setup/init。
- 明确差异/延期：列表款式图占位，无 country/PV-name summary 接线；Server 新建不是 Browser 未保存整单编辑。整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理仍未支持，不伪造按钮能力。

## 永久边界

- Codex C PR85 已合并，Source/Bridge 修复完成，branch `feat/ainuoke-source-validation`；[报告](tasks/completed/2026-10-09-ainuoke-source-validation.md)。原交付 Python44/44、npm679/679、typecheck/lint/build41 routes PASS；PR85 整合阶段从 clean `8e94221…` 普通合并上述 main，仅人工整合两份状态文档，该阶段重跑 Python44/44、npm679/679、typecheck/lint/build/diff-check PASS，既有 Source 代码/测试/报告未改。6087050 Preview/commit 完整性收紧另属 Material 任务；本地 mock Bridge/上游 HTTP 不满足正式多人 Server 集成。未真实联调、写业务数据或部署。

- D-096 历史导入 NOT REQUIRED；旧数据保留，不导入不是删除授权。D-097 Server 不读旧业务、不回退 mock/IndexedDB；D-098 Quote-first 试用范围保持。可信 session/RBAC、细粒度字段权限、精确 Decimal/null/zero、CAS/事务/审计和历史不可变不变。
- 工程、候选、真实部署、人工验收分开；默认 Browser 保持，正式远程必须认证授权/HTTPS；持久试用数据不得当作 disposable 清理。
