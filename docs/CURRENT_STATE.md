# 当前状态

> 状态快照：2026-09-01。更新本文件时只保留当前事实，不追加开发流水账。

## 当前阶段

仓库处于“双路径并存”阶段：根路径 ERP 已具备本地 Docker + PostgreSQL 的可运行生产形态；Quote Center、基础设置和 UI Foundation 已形成较完整的前端业务实现，但仍使用浏览器 mock 持久化，尚未进入真实后端/多用户生产阶段。

正式共享基线为 GitHub `main`；恢复项目状态时必须读取实时 `origin/main`，不得依赖文档中保存的固定 HEAD。当前没有正在实施的业务任务。

从 Delivery Phase 6 开始，必须在阶段开始前记录 Branch / HEAD / working tree baseline，阶段结束后只 stage 本 Phase 增量、创建独立 commit 并报告 commit hash；不得再以 inherited dirty worktree 跨阶段推进。

## 项目治理与交付状态

- Style Progress Logistics Correction：PASS。Correction Commit：`ab1608a7019ff620b29c3d132765104df639cf48`。
- GitHub Delivery Protocol：已启用。Commit：`daa0b47`。
- Repository Hygiene：已完成。PR #1；cleanup commit：`51a427d9de11fa34228286eb03f32c2abd23c6ae`；merged main：`65a0cac20991f0c6c2550ddbc7bcd9924377f065`。
- `artifacts/artifact-tool-qa/node_modules` 已停止 Git 跟踪。
- `.tmp-*`、`tsconfig.tsbuildinfo` 与 nested `node_modules` 已进入 ignore。
- 本地 dependencies 未删除。

## 已完成模块

- UI Redesign QA 数据已通过正式 datasetId `ui-redesign-qa-v1` 做 dataset-scoped cleanup；QA / Demo / Seed 订单不会进入 Ainuoke Matcher，QA Schedule 不进入生产中心。生成器继续只用于独立 test namespace / fixture，不在普通 DEV 启动时恢复 QA 数据。

- 根路径 ERP：登录、工作台、成衣报价、报价转订单、订单状态、生产排单、用户管理、审计日志。
- 本地运行：DEV `127.0.0.1:3001` 源码/HMR 与 PROD Docker `127.0.0.1:3000` 显式重建验收已分离；两者均有自动 Build Info、页面版本标识和分层缓存策略。
- 数据保护：PostgreSQL dump 备份和带显式数据丢失确认的恢复脚本。
- 款式进度 / 面辅料跟进：订单中心已增加款式进度、风险预警与艾诺科同步二级导航；真实 Excel 使用 ImportBatch + Raw Snapshot + 分离的 MaterialDemand / Purchase / Inbound / Shipment / Outbound Event，Source / Effective / Actual 严格分层。万行级事实存于 IndexedDB，schemaVersion 11 的现有 Backup / Restore / Reset 已纳入该数据库并支持失败回滚。
- 逐物料物流：复用现有 ProductionSite、SupplyHub、SupplyRoute、TransportMode、ScheduleAssignment 与 `material-logistics-service.ts`，支持最慢可行方式、加快/仅最快/全部失败，并精确区分无排单、缺集货仓、缺生产地点、缺指定路线和路线无运输方式；物料/排单变化通过 Projection 重算，不复制或反向覆盖事实。Style Progress Detail 已提供紧凑“物流依据”，生产弹窗对未持久化 SupplyHub 明确显示“未设置”，不推断第一个启用仓。
- 真实 Excel 与 DEV Import：`面辅料申购统计.xlsx` SHA-256 `9DBEBF05FDC2EE201E4A1A7F24B3B5E9585AA4B5BE4C3C49C6CB64EF0B88675E`；Raw 17,016、有效 17,015、无效 Trace 1、需求 12,853、采购 11,269、入库 14,601、出运 13,140、出库 14,620、合同 474。当前真实 DEV Repository 为 1 个正式批次、17,016 个 Raw Snapshot、上述需求与事件；396 个合同投影到正式订单，78 个合同尚无订单。同文件再次正式提交全部业务事实新增为 0。
- Quote Center/新订单、排单、关账与款式进度浏览器数据保护：`zhixu.erp.local.*` 稳定命名空间、`schemaVersion = 11`、旧 v1-v10/sessionStorage/localStorage 非破坏迁移、一次性 Seed、损坏数据拒绝覆盖、test namespace 隔离，以及包含订单、艾诺科、排单、关账、生产与运输设置、附件、用户模板 Blob 和 Style Progress IndexedDB 的备份恢复。v8→v9 将旧 ProductionPlan owner 提升到原 ScheduleAssignment，v11 纳入 Material ImportBatch、Raw、Demand、Events 与 Override，稳定保留旧业务关系。
- Quote Center：列表、个人字段偏好、新建/详情、Revision 历史、PriceVersion、面辅料/工价/其他费用、客户确认、删除、保存草稿。
- Quote Center 模型：完整 Revision 快照、默认 Revision、分支命名、聚合状态、成本计算、校验和复制逻辑。
- 基础设置：品牌、客户业务员、面料库、辅料库、默认汇率/辅料/其他费用和供应商建议。
- UI Redesign Phase 6：品牌、客户业务员、面料、辅料、生产组、外发厂统一为 Foundation DataTable / Responsive Record + Drawer；关账设置与数据管理统一为紧凑 SettingsPage。稳定 ID、同名资料、快照、`null`/`0`、启停、Backup / Restore / Reset 等既有业务语义保持不变。
- 新建报价主数据就地补充：品牌和当前品牌下的客户业务员可在 SearchableSelect 中直接新建并立即选用；品牌默认辅料可嵌套新建正式辅料库记录。所有弹层保留上层报价/配置草稿，权限不足时入口可见但 disabled，主数据保存不会触发空白报价落库。
- 权限第一阶段：Quote Center mock User / Role / Permission、管理员/报价员/查看员三个测试账号、用户权限页面、统一 disabled tooltip，以及报价/成本/版本/估算/基础设置/生产基础资料/订单/排单/关账/全局操作日志的前端权限接入。排单中心消费 `schedule.view/create/edit/complete`，关账中心消费 `closing.view/edit/confirm/lock/reopen`；`order.edit` 不隐含排单或关账编辑。
- 操作日志：复用唯一追加式 OperationLog 数据源；已接入排单、队列重排、完成数量、物料到仓、生产与运输设置及关账全生命周期，新事件使用 `orderId/scheduleAssignmentId/closingPeriodId/closingAllocationId` 和字段级 before/after。`productionPlanId/orderItemId` 仅为旧日志只读兼容。
- 订单/排单/关账第二批共用基础设施：独立 `operations-settings` 领域继续提供生产组、外发厂、默认 13% 销售产值税率和 RMB 月度生产目标；共享术语固定 `OrderType`、`ExecutionType` 和 `ClosingPeriodStatus`。
- 新订单中心架构修正：正式 Runtime Domain 已改为“一张 SalesOrder 只允许一个款式”，不再导出或创建 OrderItem。Quote Revision + PriceVersion 来源、款式与初始数量、执行资料快照、附件引用、append-only 数量/价格历史、多交期和当前价格指针都直接属于 SalesOrder；翻单关系为 `SalesOrder → SalesOrder`。v5 单 Item 保留订单身份，多 Item 逐款拆单并建立确定性来源映射。列表、详情、权限、OperationLog、全局搜索和备份恢复已同步适配；新路径完全使用浏览器 Repository，不混用根路径 PostgreSQL 旧订单。
- 第 5.5 批生产队列：正式关系为 `SalesOrder → ScheduleAssignment[]`，ProductionPlan 已退出 Runtime。内部生产组按 ProductionSite/ProductionCalendar 串行排队，支持日产量或工作日工期、自动队列/手工固定、实际完成与可选后续重排；订单量、排单量、完成量和关账量继续分离。物料到 SupplyHub 后由 SupplyRoute/TransportMode 形成不改排期的运输建议。
- 第 5.6 批产品化 UX：报价与订单列表复用按用户、按表隔离的 Table Preference 列宽基础设施；订单详情以款号为主标题、系统订单号只读，并对未保存离开提供继续编辑/放弃/保存后返回三向保护。报价详情使用滚动后出现的克制 Sticky 摘要。排单中心采用“生产组总览 → 单组队列 → 未排订单/异常”，排单编辑隐藏内部工期口径，平均日产与工作日双向联动；结束排单可直接仅记录，或先预览再应用后续队列建议。外发厂可在排单弹窗内创建并写入统一 OperationLog。
- 第五批关账中心：正式关系为 `SalesOrder → ClosingAllocation[]`，并可选引用稳定 `ScheduleAssignment.id`；`ClosingPeriod` 独立保存月度默认税率与确认/锁定/重开状态。数量、订单类型、价格、币种、汇率、税率和执行方均形成关账快照，开放月份支持 stale 检测与显式同步，锁定月份拒绝普通修改。`/closing-center` 提供月度关账与产值平衡，订单详情、全局搜索、权限、OperationLog 和备份恢复均已接入。
- Quote Detail Header：已移除标题区重复的“基础价格 · 制作国家 / 当前编辑”版本 badge，保留下方正式“当前价格版本”区域；款号与款名保持单行，空间不足时省略显示。
- 全局搜索：AppShell 顶部入口与 Ctrl/Cmd+K Command Palette、权限感知 SearchProvider 注册表、Quote、Order、Schedule 与 Closing Provider、键盘导航和按用户隔离的最近访问；关账支持月份、订单、款式、客户和执行方搜索并执行 `closing.view` 过滤。
- 设置 IA：基础设置包含品牌、客户业务员、面料库、辅料库、生产组和外发厂；系统设置包含报价设置、模板设置、用户权限、操作日志、关账设置和数据管理。Desktop 展开为侧栏内子菜单，Compact/Tablet 使用 Portal Flyout，Mobile 使用现有 Drawer。
- Sidebar：Logo/组织和当前用户固定，中间导航独立滚动并在 Chromium/Firefox 隐藏 scrollbar；已删除“核心业务”和“返回原 ERP / 系统入口”。
- 报价识别：`quoteCode` 继续保留在模型、repository、搜索、日志和导出 fallback 中，但详情标题、Sticky 摘要、搜索/最近访问卡片和移动报价卡不再主动展示；列表“报价编号”列继续保留为可配置列，新用户默认隐藏。
- 报价详情连续功能区：快速导航、报价版本条、Validation Summary 与基础信息之间使用统一 12px Desktop / 10px Mobile 间距容器，不改变 Validation 行为或 Sticky 触发。
- 全局费用：多条维护、同步当前默认 Revision、继承、覆盖保护。
- UI Foundation：AppShell、页面/卡片/按钮、Modal、FormShell、表格、选择器、数字/日期输入、Toast、状态标签，以及通过 body Portal 定位的紧凑侧栏溢出菜单。
- 表单键盘规则：局部表单 Enter 提交、Textarea 与组合输入保护、重复提交保护；整页报价不响应普通 Enter 保存。
- 附件模块：图片/文件上传、批量粘贴/拖放待确认、IndexedDB 保存、图片预览、款式图、图片 metadata 持久化重命名、下载、删除、历史只读和 Revision 引用快照。
- 报价收尾：四项关键价格摘要进入常规与 Sticky 顶部区域，并由同一 `quote-metrics-view-model` 消费当前 PriceVersion 的正式 calculator 结果；面料/辅料同时显示加成前主值与加成后次值，USD 工价显示原币值和按 `USD × 汇率 × 1.13` 得到的 RMB 折合，CNY 工价显示人民币原值与加成后值，成衣显示最终销售价与加成前基数。报价中心工价列按原币种分别展示。面向用户/客户 Excel 的最终成衣报价统一截断至一位小数；系统报价设置维护制作预设，每个 PriceVersion 独立保存预设 ID、名称、国家、币种、汇率、加成率和运费策略快照，计算与导出不再读取 Revision 级制作参数。
- 报价详情页内快速导航：桌面吸顶导航行、移动端折叠菜单和固定头部避让定位。
- 正式 Excel 报价导出：模板驱动、多价格版本多 Sheet、五区域动态扩行、历史快照、款式图、打印区域、dirty/new guard 和 CNY/USD 工价双列输出；每个 Sheet 使用对应 PriceVersion 制作国家/币种/加成快照，面料单耗写入四位 number（`0.0000`）。
- 模板设置：客户报价模板的版本、上传校验、默认、复制、启停、下载、支持字段和试导出；用户 Blob 使用 IndexedDB，现有正式模板继续作为 fallback。
- 批量导出：临时 Selection Mode、Foundation Checkbox、报价单 ZIP 和每款/每 PriceVersion 两种汇总表模式；导出后日志保存全部所选款式、Revision 与 PriceVersion 的结构化最小快照。
- Revision 级估算成本：主动生成、固定成本结构、stale/ignore、重新生成归档、历史搜索/只读和 Clone 恢复；与客户报价严格隔离。
- 全局工序说明：单个 Textarea 默认值，未来新报价继承，当前默认 Revision 三向覆盖保护，历史不变。
- Sticky 同步：报价摘要、操作按钮和快速导航共用一个 sentinel/state/container；宽表在宽屏填满 Card，窄屏保留最小宽度与内部滚动。
- 响应式体系：设备模式由 viewport + hover/pointer 共同决定；650–1366px 的细指针桌面窗口保持 Compact Desktop、Table、完整操作和 78px Sidebar，只有 `<768px + coarse pointer + no hover` 的 True Mobile 使用底部导航与轻编辑。Quote Center 三个筛选在全端保持 6:2:2 单行直显，不再使用筛选 Sheet。
- 成本区响应式：宽表是否可用以成本 Card 的实际内容宽度为准，`>=1040px` 使用单行比例宽表，面料/辅料/其他费用以 `table-layout: fixed` 和业务权重百分比分配列宽，不再用固定最小宽度制造桌面横向滚动；内容宽度低于该阈值进入 Compact。Compact 面料按字段内容长度使用多列 Grid，名称、成分、供应商、段长、门幅、克重、损耗率、单价和采购单位均直接编辑，单耗与成本保持 Calculator-derived read-only；True Mobile 使用轻量摘要与完整资料 Drawer。
- Quote Detail 操作区：Large Desktop 按内容自然横排；全部 Compact/Tablet（包括缩放后实际 CSS viewport 约 1280px 的桌面）普通 Header 与既有 Sticky Header 均使用四列等宽 Grid。顶部常驻操作只保留返回列表、报价版本、创建价格版本、客户确认、导出报价、保存草稿；操作记录和删除报价保留权限/handler/Modal 并收进“更多”。Sticky 的 sentinel、observer 和触发时机未改变。
- AppShell 响应式首帧：服务端继续使用安全的 Desktop fallback，客户端改在浏览器绘制前同步解析真实 viewport/pointer 模式；列表、详情之间切换不再短暂显示 186px 展开侧栏后才回到 78px Compact Sidebar。
- 手机轻编辑：报价列表使用 Card List；详情保留基础信息、备注、工价、客户确认和附件等简单编辑，面辅料改为完整只读摘要卡；次要详情操作收进“更多”。
- 手机附件：相册多选与 `capture="environment"` 拍照入口复用现有 AttachmentRepository，预览使用 contain、安全视口和 44px 触摸目标。

## 当前活动任务

当前没有正在实施的业务任务。Style Progress / Material Follow-up 及 Logistics Correction 均已完成并通过验收。

## 尚未开发或尚未落地

- Quote Center 的真实后端、数据库 schema、migration 和 API。
- Quote Center 与根路径 ERP 的客户、报价、订单和用户体系整合。
- 新订单中心的真实后端、数据库/API、多用户并发和与根路径旧订单的数据整合。
- Quote Center 附件的真实上传 API、对象存储、跨设备同步和服务端权限/安全扫描。
- Quote Center 列表分页和服务端查询。
- PostgreSQL `api_dispatch` 的自动化集成测试和容器端到端测试。
- 正式的数据库 migration 版本/回滚体系。

## 已知问题与冲突

1. 根路径 ERP 与 Quote Center 都有“报价”，但模型、公式和持久化完全不同。根路径使用毛利率除法公式和 PostgreSQL；Quote Center 使用 `markupRate` 乘法公式和浏览器存储。
2. README 主要描述根路径本地生产系统，尚不能单独说明 Quote Center 的 mock 边界。
3. `docs/ui-audit.md` 和 `docs/quote-ui-migration-plan.md` 是历史资料，其中部分现状描述已经过期。
4. 仓库包含 D1/Drizzle 配置，但 schema/journal 为空；它不是当前生产数据库。
5. `worker/index.ts` 没有业务 API；Sites/Cloudflare 静态构建不能替代本地 PostgreSQL API。
6. `app/chatgpt-auth.ts` 当前未被其他代码引用。
7. AppShell 已可切换三个 mock 测试账号，但这不是认证会话；Quote Center 个人偏好尚未全面绑定该账号，权限也没有服务端 enforcement。
8. SQL schema 通过启动脚本重复应用，没有显式 schema version、迁移顺序和回滚历史。
9. 自动化测试偏重前端模型和源码契约，不能证明 PostgreSQL API 或 Docker 运行时正确。
10. 附件当前存在当前设备 IndexedDB；报价删除后的孤儿 Blob 尚无自动回收机制。
11. 3000 按设计只在显式 Docker rebuild 后更新；日常源码验证必须使用 3001。若页面疑似旧版本，应先读取 `/build-info.json`，再判断是否需要常规或 clean rebuild。
12. PriceVersion 当前没有独立的多行外协数据模型；Excel 模板/扩行引擎支持外协区域，但当前导出保持该区空白。
13. ExcelJS 浏览器 chunk 较大；已通过动态 import 隔离，不进入报价页首屏 bundle。
14. 系统相册多选界面与真实摄像头启动依赖实体设备/浏览器实现；自动验收只验证 input 属性与文件注入，仍需在目标手机上做一次设备级手工验收。
15. Quote Center 操作日志当前使用浏览器稳定 localStorage namespace，只是单浏览器 mock；虽已有全局查询页面，但没有服务端不可篡改性、跨设备同步、分页和保留策略。现有 Revision 没有删除 UI，因此删除报价版本日志仅有差异能力预留。
16. 全局搜索已有 QuoteSearchProvider 与 OrderSearchProvider；没有服务端全文索引、拼音/纠错、分页或跨设备最近访问，当前浏览器权限不是生产安全边界。
17. 浏览器备份将附件和用户模板 Blob 编码进 JSON；大量二进制文件会产生较大备份，未来对象存储阶段应升级为流式归档。localStorage 与两个 IndexedDB database 之间没有原生跨存储事务，当前以完整预校验、内存快照和失败回滚保护恢复。
18. 生产组、外发厂、关账设置和关账业务当前仍是单浏览器 mock；同名资料依赖稳定 ID 区分，正式后端需要外键、停用约束、事务并发控制和服务端权限。月度目标用于关账产值平衡投影，不反向修改关账归属。
19. 新订单/排单/关账中心当前仍是单浏览器 mock，没有服务端并发控制。schema v9 保留 v5→v6 单款订单迁移、v8→v9 排单 owner 提升，并以独立记录保存排单与关账；关系损坏、重复 ID 或 owner 损坏会拒绝迁移/恢复并保留原始记录，不能以清空数据处理。
20. 浏览器自动化可调整 viewport，但当前桌面 Chrome 表面不能模拟真实 coarse pointer/no-hover；390px 细指针按 D-023 正确保持 Compact Desktop。True Mobile 的设备级截图仍需真实触屏浏览器补验，这不改变现有响应式规则。
21. `docs/legacy-bs-ui-audit/` 当前保留 129 张 working-environment / mobile 截图，但原 Compact Reference `screenshots/` 目录未出现在工作树中，56 个历史 Markdown 图片引用因此无法解析；consolidated baseline 如实保留该现状，不补造历史截图。

## 数据库 / Alembic 状态

- 当前生产数据源：PostgreSQL 16。
- 当前 schema 来源：`database/001_schema.sql`；初始管理员来源：`database/002_admin.sql`。
- 当前没有 Alembic，也没有 Python backend。
- `db/schema.ts` 为空，Drizzle journal 无业务 migration，D1/R2 未配置。
- 任何引入 migration 框架的工作都属于新的架构任务，不能假定已经完成。

## 测试状态

2026-09-01 Style Progress + Material Follow-up + Logistics Integration 最终门禁：TypeScript、ESLint、Build 与批次文件 `diff-check` 通过；全量 Tests `426/426`，0 failed、0 skipped；生产构建预渲染 28 个路由。真实 DEV Browser Console 为 0 error / 0 warning，Overview 在 1600/1280/1229/960/768/402 均无 document-level 横向溢出。

2026-08-31 Delivery Phase 6 完成后的当前验证状态：

- TypeScript：通过
- ESLint：通过
- Tests：Phase 6 专项 `5/5`、全量 `402/402` 通过，0 skipped。覆盖生产组稳定 ID 与自然顺序、面料快照隔离、真实 dirty、关账 `null` / `0` 和共享 Foundation 页面契约。
- 生产 Build：通过，预渲染 23 个静态路由；订单、排单、生产与运输设置及 `/closing-center` 均成功。仅保留既有大 chunk 体积提醒。
- Phase 6 DEV 浏览器：品牌、客户业务员、面料、辅料、生产组、外发厂、关账设置、数据管理在 1600 / 1280 / 960 / 768 / 402 / 440 共 48 个模拟 viewport 组合全部无 document-level 横向溢出；Drawer ESC、dirty guard、焦点恢复和 14 个核心页面轻量回归通过，Browser Console 0 error / 0 warning。浏览器未保存、删除或重置长期 DEV 数据。
- DEV 页面验收：已在真实 DEV 3001 完成手工单款创建、同一客户 PO 下不同款分别成单且订单号独立唯一、Quote → SalesOrder、SalesOrder → SalesOrder 翻单、部分取消、全部取消、P1/P2 价格历史与 `currentPriceVersionId`、刷新持久化、订单号/款号搜索、查看员权限和新 SalesOrder OperationLog。多交期业务由自动化验证；本轮浏览器自动化无法可靠驱动原生日期输入，因此未把多交期标记为真实 DEV 人工通过。
- 第 5.5 批 DEV 验证：3001 `/production-scheduling` 与 `/build-info.json` 返回 200；Vite DEV 直接提供当前 `production-scheduling-page.tsx` 与 CSS，已确认包含完成预览和队列预览样式，证明当前源码已进入 HMR 模块。当前会话没有可调用的 Browser 控制运行时，因此未执行可视点击、真实 localStorage v8→v9 迁移观察与 Desktop/Compact/Tablet/Mobile 截图；迁移、日期、队列、权限、搜索、日志、Backup/Restore 与关账兼容以自动化为权威覆盖，目标设备 UI 仍待补验。
- 第五批 DEV 验收：为同一订单建立内部 6,000 件与外发 4,000 件两条关账归属，原币加工产值分别为 ¥39,000 与 ¥26,000，汇总 10,000 件 / ¥65,000；刷新后持久化。已验证警告下确认、勾选并填写原因后锁定、锁定后 mutation disabled、填写原因重新打开；订单详情显示“已关账”，全局搜索返回关账月份，统一 OperationLog 显示创建/新增/修改/确认/锁定/重开动作。1440px、1024px 与 390px fine-pointer 均无 document 横向溢出；True Mobile coarse-pointer 仍建议实体设备复验。
- DEV Quote Header：已在 1440px 桌面与 800px 半屏验证顶部重复价格版本块已删除，下方正式“当前价格版本”仍存在且可切换；款号与款名保持单行，空间不足时 ellipsis，不换行或撑高 Header；返回列表、更多、保存草稿、快速导航、Sticky、价格摘要和报价设置仍正常。
- v5 → v6 迁移边界：自动化已验证单 Item 提升、多 Item 拆单、翻单映射、价格/数量/交期/Quote 来源隔离、幂等与异常保护。真实 DEV 验收开始时订单中心没有旧 v5 订单，因此没有人工观察真实历史数据迁移，也没有向真实 DEV 注入危险旧数据或执行清库。
- DEV Build Info：`127.0.0.1:3001/build-info.json` 当前返回 `development / 20260827-160806 / 3f1749d`。
- Excel 验收：占位符客户报价、每报价一行汇总、每 PriceVersion 一行汇总均已由 artifact-tool 重载、检查并渲染；公式错误为 0。批量 ZIP 含 2 个报价文件，成功 2、失败 0。
- 本轮已在真实 DEV 浏览器完成桌面 1440、Compact 900、Mobile 390 交互复验：主数据嵌套创建、立即回填、默认资料应用、切换保留/应用/取消、权限 disabled、空白报价返回不落库和正式辅料库记录均通过；控制台错误为 0。截图位于 `artifacts/quick-master-data-*.png`。
- Quote Detail 响应式已在 DEV 浏览器复验 1920×1200、约 1230×768 CSS 基准、1280×720 / DPR 1.25 和 785×660 半屏：三类 Wide 成本表 `scrollWidth === clientWidth`；1280px 与半屏均保持 Compact 完整能力且操作区为四列 Grid，document 无横向溢出，Sticky 与快速导航正常。1280px 下列表→详情→列表切换均稳定为 `compact / 78px Sidebar`。当前浏览器为 fine pointer，True Mobile 的 coarse-pointer 分支由响应式模型与自动化测试覆盖。
- 本轮 DEV 浏览器在 1440px 与 900px 复验：常规/Sticky 顶部均有四项价格摘要，基础信息后没有重复摘要，900px fine-pointer 无 Bottom Navigation 或页面横向溢出；中国预设带出 CNY/13%/无预设运费，柬埔寨预设带出 USD/5%/一条可编辑运费。品牌弹窗添加 2 条固定辅料后内容区 `overflow-y:auto` 且可聚焦编辑底部单价，客户业务员弹窗同样可滚动，Footer 均保持可见。全局日志业务标题能展示 Quote/V/PriceVersion/行项目，旧日志缺少新增 ID 时技术详情明确标记“旧日志未记录”。最终干净 DEV 页面控制台错误为 0；未保存或删除任何验收业务记录。
- 价格摘要落地修复已在 1920×1200 DEV 页面复验：展开 Header 与既有 Sticky 均显示 `面料/辅料` 加成前主值和加成后次值、USD 原币工价及 RMB 折合、成衣销售价及加成前基数；切换素色→彩条后两处同步从 `¥10.93 / $2.15 / ¥33.1` 更新为 `¥24.30 / $2.28 / ¥49.0`。Sticky 的 sentinel、observer 与触发时机未修改。截图位于 `artifacts/quote-summary-header-fix/`。

数据库 API 集成测试未执行，因为仓库目前没有对应自动化套件；以上前端/构建结果不能替代数据库运行时验证。

## 下一步

Ainuoke Playwright 自动抓取 / 同步准备是候选下一阶段，尚未启动；只有用户明确授权后才建立正式任务规格并实施。

## 明确不能破坏的内容

- `zhixu_data` 中现有 PostgreSQL 业务数据及备份/恢复保护。
- 根路径 ERP 已有 API、角色权限、报价转单和排单状态联动。
- Quote Center 的 Revision 完整快照与 PriceVersion 并列价格语义。
- 根路径 ERP 与 Quote Center 各自的计算公式边界。
- 空值不等于 0、库资料进入报价后形成独立快照。
- 新建报价未保存直接返回时不产生记录。
- 当前未提交的用户改动；不得通过 reset/checkout 等方式回退。
- v9 非破坏迁移、`operations-settings`、`sales-orders`、`production-scheduling` 与 `closing-center` 稳定记录；不得以换 key、Seed 或全局清空处理升级。任何旧数据迁移失败都必须保留原始 record 并明确诊断。
