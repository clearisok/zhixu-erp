# 当前状态

> 状态快照：2026-08-24。更新本文件时只保留当前事实，不追加开发流水账。

## 当前阶段

仓库处于“双路径并存”阶段：根路径 ERP 已具备本地 Docker + PostgreSQL 的可运行生产形态；Quote Center、基础设置和 UI Foundation 已形成较完整的前端业务实现，但仍使用浏览器 mock 持久化，尚未进入真实后端/多用户生产阶段。

当前分支为 `main`。建立本知识体系前，工作树已有大量 Quote Center、基础设置、Foundation 和测试的未提交修改；这些改动属于当前真实实现，但尚未由 Git commit 固化。后续任务必须先检查 `git status` 和相关 diff。

## 已完成模块

- 根路径 ERP：登录、工作台、成衣报价、报价转订单、订单状态、生产排单、用户管理、审计日志。
- 本地运行：DEV `127.0.0.1:3001` 源码/HMR 与 PROD Docker `127.0.0.1:3000` 显式重建验收已分离；两者均有自动 Build Info、页面版本标识和分层缓存策略。
- 数据保护：PostgreSQL dump 备份和带显式数据丢失确认的恢复脚本。
- Quote Center：列表、个人字段偏好、新建/详情、Revision 历史、PriceVersion、面辅料/工价/其他费用、客户确认、删除、保存草稿。
- Quote Center 模型：完整 Revision 快照、默认 Revision、分支命名、聚合状态、成本计算、校验和复制逻辑。
- 基础设置：品牌、客户业务员、面料库、辅料库、默认汇率/辅料/其他费用和供应商建议。
- 权限第一阶段：Quote Center mock User / Role / Permission、25 项权限目录、管理员/报价员/查看员三个测试账号、用户权限页面、统一 disabled tooltip，以及报价/成本/版本/估算/基础设置/全局操作日志的前端权限接入。`audit_log.view` 默认只授予管理员。
- 操作日志第一阶段：复用统一追加式 OperationLog 数据源；保存后记录报价/Revision/PriceVersion/确认/四类成本/附件和估算动作，导出、模板与权限管理在真实操作成功后追加。报价详情保留只读 Timeline，系统设置新增全局 Dense Table，支持搜索、日期/用户/模块/动作筛选和格式化详情。
- 全局搜索第一阶段：AppShell 顶部入口与 Ctrl/Cmd+K Command Palette、权限感知 SearchProvider 注册表、Quote 五字段搜索、键盘导航和按用户隔离的最近访问；结果统一通过 `openSearchResult` 打开，详情 Loader 会随 query `id` 变化重新加载。
- 设置 IA：基础设置只保留品牌、客户业务员、面料库和辅料库；系统设置包含报价设置、模板设置、用户权限和操作日志。Desktop 展开为侧栏内子菜单，Compact/Tablet 使用 Portal Flyout，Mobile 使用现有 Drawer。
- Sidebar：Logo/组织和当前用户固定，中间导航独立滚动并在 Chromium/Firefox 隐藏 scrollbar；已删除“核心业务”和“返回原 ERP / 系统入口”。
- 报价识别：`quoteCode` 继续保留在模型、repository、搜索、日志和导出 fallback 中，但详情标题、Sticky 摘要、搜索/最近访问卡片和移动报价卡不再主动展示；列表“报价编号”列继续保留为可配置列，新用户默认隐藏。
- 报价详情连续功能区：快速导航、报价版本条、Validation Summary 与基础信息之间使用统一 12px Desktop / 10px Mobile 间距容器，不改变 Validation 行为或 Sticky 触发。
- 全局费用：多条维护、同步当前默认 Revision、继承、覆盖保护。
- UI Foundation：AppShell、页面/卡片/按钮、Modal、FormShell、表格、选择器、数字/日期输入、Toast、状态标签，以及通过 body Portal 定位的紧凑侧栏溢出菜单。
- 表单键盘规则：局部表单 Enter 提交、Textarea 与组合输入保护、重复提交保护；整页报价不响应普通 Enter 保存。
- 附件模块：图片/文件上传、批量粘贴/拖放待确认、IndexedDB 保存、图片预览、款式图、下载、删除、历史只读和 Revision 引用快照。
- 报价详情页内快速导航：桌面吸顶导航行、移动端折叠菜单和固定头部避让定位。
- 正式 Excel 报价导出：模板驱动、多价格版本多 Sheet、五区域动态扩行、历史快照、款式图、打印区域、dirty/new guard 和 CNY/USD 工价双列输出。
- 模板设置：客户报价模板的版本、上传校验、默认、复制、启停、下载、支持字段和试导出；用户 Blob 使用 IndexedDB，现有正式模板继续作为 fallback。
- 批量导出：临时 Selection Mode、Foundation Checkbox、报价单 ZIP 和每款/每 PriceVersion 两种汇总表模式。
- Revision 级估算成本：主动生成、固定成本结构、stale/ignore、重新生成归档、历史搜索/只读和 Clone 恢复；与客户报价严格隔离。
- 全局工序说明：单个 Textarea 默认值，未来新报价继承，当前默认 Revision 三向覆盖保护，历史不变。
- Sticky 同步：报价摘要、操作按钮和快速导航共用一个 sentinel/state/container；宽表在宽屏填满 Card，窄屏保留最小宽度与内部滚动。
- 响应式体系：设备模式由 viewport + hover/pointer 共同决定；650–1366px 的细指针桌面窗口保持 Compact Desktop、Table、完整操作和 78px Sidebar，只有 `<768px + coarse pointer + no hover` 的 True Mobile 使用底部导航与轻编辑。Quote Center 三个筛选在全端保持 6:2:2 单行直显，不再使用筛选 Sheet。
- 成本区响应式：报价明细使用 `>=1200px` Full、`700–1199px` Desktop Compact、`<700px` Narrow 的视口密度边界，Card Container Query 作为嵌入式回退。Compact 面料为 `3 + 6`、辅料为 `3 + 4`、其他费用为 `2 + 4` 两行栅格，Narrow 为单列；True Mobile 的面辅料继续使用轻量摘要。renderer 共享同一行 ID、状态、回调和原计算函数，并在宽度切换时交接焦点和数字输入中间态。
- 手机轻编辑：报价列表使用 Card List；详情保留基础信息、备注、工价、客户确认和附件等简单编辑，面辅料改为完整只读摘要卡；次要详情操作收进“更多”。
- 手机附件：相册多选与 `capture="environment"` 拍照入口复用现有 AttachmentRepository，预览使用 contain、安全视口和 44px 触摸目标。

## 正在开发

没有从仓库事实中发现一个被明确标记为“进行中”的单一功能任务。当前主要风险是：上述 Quote Center 扩展仍位于 dirty worktree，当前产品状态与最近 Git commit 不完全一致。

## 尚未开发或尚未落地

- Quote Center 的真实后端、数据库 schema、migration 和 API。
- Quote Center 与根路径 ERP 的客户、报价、订单和用户体系整合。
- Quote Center 报价转正式订单流程。
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
15. Quote Center 操作日志当前使用 localStorage，只是单浏览器 mock；虽已有全局查询页面，但没有服务端不可篡改性、跨设备同步、分页和保留策略。现有 Revision 没有删除 UI，因此删除报价版本日志仅有差异能力预留。
16. 全局搜索第一阶段只有 QuoteSearchProvider；没有服务端全文索引、拼音/纠错、分页或跨设备最近访问，当前浏览器权限不是生产安全边界。

## 数据库 / Alembic 状态

- 当前生产数据源：PostgreSQL 16。
- 当前 schema 来源：`database/001_schema.sql`；初始管理员来源：`database/002_admin.sql`。
- 当前没有 Alembic，也没有 Python backend。
- `db/schema.ts` 为空，Drizzle journal 无业务 migration，D1/R2 未配置。
- 任何引入 migration 框架的工作都属于新的架构任务，不能假定已经完成。

## 测试状态

2026-08-24 Batch 4.1 完成后已完成最终自动化验证：

- TypeScript：通过
- ESLint：通过
- Tests：225 / 225 通过；Batch 4.1 覆盖 quoteNo 展示边界、设置 IA、Sidebar 独立滚动、全局日志查询/权限、搜索统一打开与 query 重载、详情共享间距，并保留全部既有业务回归。
- 生产 Build：通过；静态构建包含 `/system-settings/quote-settings` 和 `/system-settings/operation-logs` 在内的 13 个路由，只有既有大 chunk 体积提醒。
- DEV Build Info：`127.0.0.1:3001/build-info.json` 已返回 `development / 20260824-110600 / 2843e83 / 2026-08-24T11:03:17+08:00`，确认当前 3001 运行实例来自本仓库当前提交。
- Excel 验收：占位符客户报价、每报价一行汇总、每 PriceVersion 一行汇总均已由 artifact-tool 重载、检查并渲染；公式错误为 0。批量 ZIP 含 2 个报价文件，成功 2、失败 0。
- 本轮实体浏览器复验未执行：浏览器控制安全策略此前明确拒绝访问 `127.0.0.1:3001`，不得通过替代浏览器或协议绕过。1920/1366/900/390 截图、点击/Enter/Back 与视觉间距仍需在允许访问本地 DEV 的浏览器会话中补验；自动化测试不能冒充实体浏览器结果。

数据库 API 集成测试未执行，因为仓库目前没有对应自动化套件；以上前端/构建结果不能替代数据库运行时验证。

## 下一步

1. 由用户确认并固化当前 dirty worktree 的 Quote Center 代码基线。
2. 今后 Codex 业务开发先用 3001 验证 HMR；需要 production build 验收时再显式重建 3000，并记录 `/build-info.json`。
3. 在任何“生产化 Quote Center”任务前，先决定真实后端、数据库、认证、多用户和 migration 策略。
4. 若继续根路径 ERP，优先补充 PostgreSQL API 集成测试和可版本化 schema migration。
5. 若继续 Quote Center，按 `features/QUOTE_CENTER.md` 的缺口逐项实施，避免直接复用不兼容的旧 `/api/quotes`。

## 明确不能破坏的内容

- `zhixu_data` 中现有 PostgreSQL 业务数据及备份/恢复保护。
- 根路径 ERP 已有 API、角色权限、报价转单和排单状态联动。
- Quote Center 的 Revision 完整快照与 PriceVersion 并列价格语义。
- 根路径 ERP 与 Quote Center 各自的计算公式边界。
- 空值不等于 0、库资料进入报价后形成独立快照。
- 新建报价未保存直接返回时不产生记录。
- 当前未提交的用户改动；不得通过 reset/checkout 等方式回退。
