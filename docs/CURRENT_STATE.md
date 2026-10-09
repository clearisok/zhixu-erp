# 当前状态

> 2026-10-10；Quote Center 原版 UI / Server 收敛：**ENGINEERING PASS / USER UI ACCEPTANCE PENDING**。[审计、能力/权限及原工程验证](tasks/active/quote-original-ui-convergence.md)；[原版/Before/After 截图](tasks/assets/quote-original-convergence/README.md)。部署历史见 [归档](tasks/completed/2026-10-09-windows-trial-delivery-history.md)，不是当前部署指令。

> PR #89 原修复及 P2 验证为历史工程证据：可见性引用释放、列表2MiB/1M像素单图、8MiB/4M像素总预算，大图详情占位，上传规则未改。[阈值与原测试](tasks/active/d099-list-acceptance.md)。本轮单 Codex 整合 main、重新验证及有条件的18444更新尚在进行，**USER ACCEPTANCE PENDING**；不操作18443。

## 当前工程能力

- D-099：PR #64 报价中心是视觉/信息架构基线，当前 Server 是数据、安全和业务能力基线；Server 化不能成为重新设计 UI 的理由。绿色侧栏/暖灰/白卡片、标题/更多/搜索筛选、组合单元格恢复。
- 新用户默认九个信息单元格 + 固定操作；十五个正式业务字段仍独立配置/导出。旧个人列顺序/宽度/可见性和 key 保留，不自动重写；主动恢复默认可切新组合布局。权限过滤包含子字段、tooltip 和 touch records。
- 新建 type-first 卡片主动创建、POST{} / processing CAS PUT、已创建 ID 和未知结果保护保持。共享 Editor 不重写，保留 PR83 常用成本字段、局部滚动/sticky/Portal，以及版本/Estimate/确认/附件/客户文件/内部汇总/日志能力。
- PR #86 原工程验证：Chromium62/62、隔离 API/版本/Estimate/附件38/38、auth/frontend67/67、presentation4/4、SSR2/2、npm674/674 PASS；typecheck/lint/Server及两种frontend build PASS，默认 build-info browser/browser/writable/session。四档桌面 + 390 touch、合成参考/前后截图146张；cleanup PASS。不是人工 UI 定稿，也不是本次 PR #84 合并验证结果。

## 真实环境与下一步

- 本轮 fetch/GitHub 已核实 main `7ed9204d552384730bf93c992b500c530d639c38`，PR #87 已合并；在 #89 原独立工作树正常整合。PR #84 已合并，原部署不代表 #89 已部署；#88 不在本轮范围。
- PR #84 已执行的 Windows win01 更新：app/gateway `zhixu-quote-trial-ui:878de323d618`，source `878de323d618b25fca1f51ccf3f024e932641742`，build `quote-trial-ui-20261009` / `2026-10-09T07:20:46Z`；当时真实 HTTPS、CLI READY、三服务 healthy，数据库容器/镜像/卷、TLS和持久业务保持。完整备份、部署身份与管理员/受限账号、2 Quote/Revision/PV及2附件 bytes/SHA验收见[独立更新报告](tasks/completed/2026-10-09-windows-quote-trial-ui-update.md)。这些是原执行证据，本轮未复核真实运行环境。
- 用户新 UI 与完整三张业务卡人工验收 PENDING。18444 独立 Preview 只有通过隔离、可恢复备份及0009兼容检查后才可按本轮授权更新；18443和旧环境保持，不重新 setup/init。
- 明确差异/延期：合法款式图列表读取本轮已接通（现有原图按48px展示，不新增缩略图服务），country/PV-name summary 仍未接线；Server 新建不是 Browser 未保存整单编辑。整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理仍未支持，不伪造按钮能力。

## 已合并订单工程（历史验证，非激活指令）

- 并行订单 C4.3 Server 领域已实现：独立 0009、集合 CAS/永久人工所有权、稳定默认行/null 恢复、drift 与专属 GET/PATCH。只 disposable PG；真实 0009、计划 UI、通用订单写入未执行，不增加 D-098 Quote-first 前置。原实现见 [独立报告](tasks/completed/2026-10-09-order-c43-delivery-plan.md)；本轮 #87 集成 DeliveryPlan17/17、PostgreSQL152/152、npm679/679、质量/构建及合成 session API 演示/清理 PASS，见 [集成报告](tasks/completed/2026-10-10-pr87-delivery-plan-integration.md)。0009 应用/旧库双向不兼容，必须独立 Activation Gate。以上试用部署状态保持不变。

## 永久边界

- Codex C PR85 已合并，Source/Bridge 修复完成，branch `feat/ainuoke-source-validation`；[报告](tasks/completed/2026-10-09-ainuoke-source-validation.md)。原交付 Python44/44、npm679/679、typecheck/lint/build41 routes PASS；PR85 整合阶段从 clean `8e94221…` 普通合并上述 main，仅人工整合两份状态文档，该阶段重跑 Python44/44、npm679/679、typecheck/lint/build/diff-check PASS，既有 Source 代码/测试/报告未改。6087050 Preview/commit 完整性收紧另属 Material 任务；本地 mock Bridge/上游 HTTP 不满足正式多人 Server 集成。未真实联调、写业务数据或部署。

- D-096 历史导入 NOT REQUIRED；旧数据保留，不导入不是删除授权。D-097 Server 不读旧业务、不回退 mock/IndexedDB；D-098 Quote-first 试用范围保持。可信 session/RBAC、细粒度字段权限、精确 Decimal/null/zero、CAS/事务/审计和历史不可变不变。
- 工程、候选、真实部署、人工验收分开；默认 Browser 保持，正式远程必须认证授权/HTTPS；持久试用数据不得当作 disposable 清理。
