# 当前状态

> 状态快照：2026-09-05。这里只保留当前真实状态，不记录开发流水账。

## 当前阶段

- 当前分支：`feat/style-progress-material-control-v2`。
- Material Control Tower V2 Gate 1–5 已完成并推送：Domain / Batch `2890041b`、Parser / Repository `84e309c7`、Service / Projection / Logistics `992d7309`、V4 UI `6d80889f`、真实 D1935 验收与最终收口 `b459df2`。PR #4 已创建并保持未合并。
- 最新真实 `面辅料申购统计 (1).xlsx` 已通过正式 Parser 只读验证，并显式导入隔离的 Codex QA Browser Profile：17,384 Source Row / 17,383 有效；D1935 / PI2607-235 为 261 Source Row，厂供编码 `202608130002` 5 行、需求 3,809，并从 Operational Projection 全部排除。导入没有触碰用户 Chrome / PROD Profile，原始 Excel 未进入 Git。
- 任务分支不自动合并 `main`；PR #4 等待用户审阅，不自动 merge。
- 既有 PR #3 `fix: complete full UI workflow correction` 保持未合并。
- 2026-09-04 Second Acceptance Correction 已完成 Gate D、Gate E、Gate F；第一检查点 commit `3b8f69b27fdd54bc2de900859179f252f5f1aa8a`。
- 2026-09-01 Full UI / Workflow Correction 已完成 Gate A、Gate B、Gate C，没有重新实施。
- Gate A：Foundation + Quote + 必要 Master Data Correction，commit `367983925f8e9236a701a71781054f6baaf65e78`，PASS。
- Gate B：Order + Production + Style Progress，commit `9098f903f9d76ff647dcebacbde46ce7ebfe0de4`，PASS。
- Gate C：Closing Center，commit `be464c6476c8a6b596f26229d0022481ffb0fb2b`，PASS。

## 当前可运行边界

- 根路径 ERP 已具备本地 Docker + PostgreSQL 的可运行形态。
- Quote Center、新订单中心、生产排单、款式进度、关账中心和相关设置仍使用浏览器 Repository；尚不是服务端多用户生产实现。
- DEV 固定使用 `127.0.0.1:3001`，PROD Docker 固定使用 `127.0.0.1:3000`，两者依靠 Origin 隔离数据。
- 当前浏览器 local data `schemaVersion = 13`，Style Progress IndexedDB version = 3；旧记录只做非破坏迁移，不自动清空或用 Seed 覆盖。

## 本轮完成状态

### Material Control Tower V2

- Style Progress IndexedDB version 3 与全局 schemaVersion 13 支持非破坏 Expected Arrival Batch / Allocation；旧单日期、manual/source 语义、重导入、Backup / Restore 与唯一 OperationLog 均保持可追溯。
- 普通 Projection 按销售合同内 Canonical Material Group 展示真实物料；面料按名称 + 门幅 + 克重 + 唯一采购价归一，辅料按标准化名称归一，厂供退出运营统计但保留 Source Trace。
- 每批 Expected Arrival 独立复用正式物流 Service；Shipment quantity 只来自 ShipmentEvent，“距上线”与运输 buffer 分开，buffer 使用 `>7 / 0..7 / <0` 的 green/yellow/red 规则。
- V4 Material Control Tower 已提供 Canonical Material 卡、五项 KPI、Sticky Filter、多事件 Drawer 与 Batch Planner；1600/1280/1229/960/768/402 CSS viewport 无 document 横向溢出。这里记录的是 CSS viewport 验收，不冒充真实 Windows Display Scaling。
- 真实 D1935 验收得到 18 个 Canonical Material（面料 8、辅料 10）；采购 / 入库 / 出运 / 出库分别使用对应 Event。罗马布英文多词颜色保持完整，厂供仅在条件式 Drawer 中出现。隔离 Browser Profile 没有该合同的织序订单，因此物流保持“待排单后计算”，未建立任何 fallback。
- Gate 5 最终门禁：TypeScript PASS、ESLint PASS、Full Tests 480/480、Production Build 29 routes PASS、`git diff --check` PASS、Browser Console 0 error / 0 warning。

### Gate A — Foundation / Quote

- Overlay、Dropdown、Modal、Toast 统一层级与 Portal 行为完成。
- 报价列表普通 token AND 搜索、`/字段 值` structured AND 搜索及制作国家 PriceVersion 搜索完成。
- 款式缩略图、其他费用指标、最终报价 Cost Breakdown Drawer 完成。
- Attachment 区域直接 Ctrl+V、品牌/客户业务员嵌套选择、系统继承实际值展示完成。
- 1229/960/768/402 Header、Back Control 与 Quote 响应式复验通过。

### Gate B — Order / Production / Style Progress

- 订单按交期月份筛选、详情字段权威边界、紧凑状态与颜色级部分取消完成。
- 颜色取消采用 append-only adjustment；Ainuoke 重同步更新来源数量但保留人工取消。
- 生产排单按生产组高密度展示，订单/物流入口为真实导航；物料状态直接消费 Style Progress Projection，不再维护重复的手工物料日期。
- 款式进度颜色筛选、面辅料折叠、高密度布局与 `actualConsumption` 正确来源完成。
- 新手工订单默认加工币种由系统设置初始化，正式默认值为 USD；既有订单、报价和关账快照不被回写。

### Gate C — Closing Center

- `/closing-center` 为按年分组、月份倒序的总览，并提供全部/开放中/已确认/已锁定筛选。
- `/closing-center/detail?month=YYYY-MM` 为月份详情；月份路由决定订单行、KPI、筛选和动作。
- 已排、已生产、关账数量保持独立；新增归属只显示当前月份数据。
- `confirmed` 与 `locked` 保持不同状态；锁定后普通编辑被拒绝，高权限重开必须填写原因。
- Modal 内校验错误通过独立高层 Error Layer 展示，不被遮挡。

### Second Acceptance — Gate D/E/F

- `DataTable` 的列宽与稳定列顺序按用户/表保存；旧 width-only 与旧 Quote `style` 偏好非破坏迁移，新增列追加、删除列忽略。
- 主业务列表改为 fit-first；Quote 最大字段、Order、Style Progress、Production Queue、Basic Settings 与 Closing Detail 的代表容器均不依赖局部横向滚动。
- Desktop Sidebar 支持 186px/78px 主动切换并按用户持久化；Basic/System 菜单默认关闭，路由切换不自动展开。
- Quote 款式图/款式身份独立可排序，列表组合信息密度、单行“更多”和详情高价值 Sticky 已完成。
- Order Detail 完成身份/客户 PO 去重；正式 Ainuoke Order 不再暴露常驻数量/合同交期人工覆盖模块，但历史 Domain、日志和备份保持不变。
- Production 移除重复 Banner/摘要，组选择项只保留待产指标与必要身份；选择面板在 AppShell 主滚动中固定于顶栏下方且没有独立滚动。

## 验证状态

- Second Acceptance relevant tests 17/17、full tests 455/455、typecheck、lint 与 build 均通过；`git diff --check` 在提交前执行。
- 应用内 Browser 实际 viewport 为 1280×720（与 1229 同属 Primary Desktop 模式）：Quote/Order/Style Progress/Production/Basic Settings/Closing 代表页面 document 无横向溢出，逐容器复验无局部横向滚动，unexpected console error 为 0。
- 用户的真实 1920×1080、Windows 125%、Chrome 125%（约 1229×691 CSS px）仍是 PR merge 前最终视觉复验环境；自动门禁不能替代这一步。
- Second Acceptance 9 张截图保存在 `docs/ui-redesign/screenshots/second-acceptance-2026-09-04/`，没有覆盖上一轮截图。
- Browser QA 使用隔离的 QA profile 追加/调整测试数据；没有清除用户或正式业务数据。

## 已确认的既有稳定状态

- Style Progress / Material Follow-up 与 Logistics Correction 已完成；Logistics Correction commit 为 `ab1608a7019ff620b29c3d132765104df639cf48`。
- missing SupplyHub 不自动猜宁波仓；缺 Hub、Site、Route、TransportMode 分别返回精确原因。
- GitHub Delivery Protocol 已启用，commit `daa0b47`。
- Repository Hygiene 已完成：PR #1，cleanup commit `51a427d9de11fa34228286eb03f32c2abd23c6ae`，merged main `65a0cac20991f0c6c2550ddbc7bcd9924377f065`。
- `artifacts/artifact-tool-qa/node_modules` 已停止 Git 跟踪；`.tmp-*`、`tsconfig.tsbuildinfo` 与 nested `node_modules` 已进入 ignore；本地 dependencies 未删除。

## 尚未落地

- Quote、Order、Scheduling、Style Progress、Closing 的真实后端、数据库 schema/API、多用户并发与服务端权限。
- 浏览器附件的对象存储、跨设备同步与服务端安全扫描。
- 服务端全文搜索、分页、不可篡改审计及正式数据库 migration/rollback 体系。
- True Mobile 的真实 coarse-pointer 设备级复验；当前自动回归验证的是指定 CSS viewport。

## 当前数据保护原则

- 不执行隐式 Reset，不删除本地 dependencies，不用测试清理触碰 DEV/PROD 浏览器真实命名空间。
- Quote、SalesOrder、ScheduleAssignment、ClosingAllocation、Style Progress 与附件继续按既有稳定 Repository/IndexedDB 边界保存。
- 备份恢复在覆盖前校验 owner、指针和跨记录引用；损坏数据拒绝写入并保留原始内容。
