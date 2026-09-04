# 当前状态

> 状态快照：2026-09-04。这里只保留当前真实状态，不记录开发流水账。

## 当前阶段

- 当前分支：`fix/full-ui-workflow-correction`
- 本轮起点：`65a0cac20991f0c6c2550ddbc7bcd9924377f065`
- 2026-09-01 Full UI / Workflow Correction 已完成 Gate A、Gate B、Gate C；当前没有仍在实施的业务 Gate。
- Gate A：Foundation + Quote + 必要 Master Data Correction，commit `367983925f8e9236a701a71781054f6baaf65e78`，PASS。
- Gate B：Order + Production + Style Progress，commit `9098f903f9d76ff647dcebacbde46ce7ebfe0de4`，PASS。
- Gate C：Closing Center，commit `be464c6476c8a6b596f26229d0022481ffb0fb2b`，PASS。

## 当前可运行边界

- 根路径 ERP 已具备本地 Docker + PostgreSQL 的可运行形态。
- Quote Center、新订单中心、生产排单、款式进度、关账中心和相关设置仍使用浏览器 Repository；尚不是服务端多用户生产实现。
- DEV 固定使用 `127.0.0.1:3001`，PROD Docker 固定使用 `127.0.0.1:3000`，两者依靠 Origin 隔离数据。
- 当前浏览器 local data `schemaVersion = 12`；旧记录只做非破坏迁移，不自动清空或用 Seed 覆盖。

## 本轮完成状态

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

## 验证状态

- Gate A、Gate B、Gate C 的 relevant tests、full tests、typecheck、lint、build 与 `git diff --check` 均已分别通过。
- Gate C 完成时 full tests 为 447/447；最终文档提交前仍需以最终回归结果为准。
- Browser QA 已覆盖 1600、1280、1229、960、768、402 六档宽度；代表页面无 document-level 横向溢出，unexpected console error 为 0。
- 本轮 13 张截图保存在 `docs/ui-redesign/screenshots/full-ui-2026-09-01/`，未覆盖 Legacy Audit。
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
