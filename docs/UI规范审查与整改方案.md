# 织序 UI 规范审查与整改方案

2026-11-23（Asia/Shanghai），方案 v1，**等待用户批准具体 UI 整改范围**。关联 [Issue #165](https://github.com/clearisok/zhixu-erp/issues/165)。本轮只固化规范和提交审查报告；未实施任何下述 UI 整改。

## 1. 结论与覆盖口径

| 项目 | 本轮结果 |
| --- | --- |
| 页面入口源码 | 44 个 app/**/page.tsx，逐一核对入口、authority 选择及 Server boundary |
| 当前 Server 范围 | 24 个白名单入口，加单独处理的 /login，共 25 个 |
| 实机访问 | 25 个入口均已请求；23 个看到页面正文，/ 与已登录 /login 跳至报价列表 |
| 独立正文视图 | 去除用户管理及关账别名后为 21 类；并非 25 套不同业务界面 |
| 当前未开放入口 | 19 个，单列，不冒称已做其业务实机验收 |
| 组件扫描 | app、components、features 共 210 个非测试 TSX 做静态信号扫描；重点人工复核可达分支、Foundation、业务表单及样式。扫描不等于逐文件完整人工审阅 |
| 明确问题 | **38 项：P1 2、P2 19、P3 17；未确认 P0** |
| 需用户决定 | **10 项设计争议**，不计作已确认缺陷，不自动撤销旧批准 |
| 应保留设计 | 12 项，防止以极简名义删除必要信息和保护 |
| 全站验收结论 | 完成上述范围的源码审查及单会话桌面主视图只读观察；**未完成全状态、全角色、全尺寸的全站实机验收** |

问题计数按独立整改原因计，不按重复调用点膨胀；例如 G07 涵盖多处复选框，B01 涵盖五个正式页面。48 个整改候选 = 38 个明确问题 + 10 个争议项；12 个保留项不计问题。P1/P2/P3 是本报告建议优先级，不改 Project 的用户优先级字段。

## 2. 授权、版本与隔离

用户本轮授权：核实 ecceb144，将 AGENTS.md 规范与完整审查报告纳入同一个独立 PR，目标 main；不带入均涛迁移或其他任务；只修改规范文档和报告，不修改 UI、业务逻辑、数据、权限，不合并、不部署。后续具体 UI 修改等待用户批准。

- 原工作树：chore/juntao-migration-plan / ecceb144d182fcf88e9b58e5218ba7f11e972ecd，开始时 clean，完整保留。
- 独立工作树：C:/Users/Administrator/.codex/worktrees/ui-standard-audit/zhixu-ainuoke-api；分支 chore/ui-standards-audit。
- 本轮通过 GitHub connector 核实实际 main：**10b9a7d827e1c09f152ead58c21f26712d49a619**，本地对象存在，独立分支从该完整 SHA 创建。
- 仅提取 ecceb144 的 AGENTS.md 24 行 UI 规则，不 cherry-pick 含旧接力的整个提交，不携带 39d78181 的均涛迁移方案。AGENTS.md 最终内容与 ecceb144 完全一致。
- 初始 checkpoint：13d5f0c74fc2efc938466baad86d1f5259f15e9e。最终提交只更新本报告；交付 SHA 以 Git 及最终交付回执为准，不在文件内伪造自引用 hash。
- 差异仅 **AGENTS.md 和本报告**。用户本轮只允许规范及报告，因此 baseline、验证和接力恢复点集中在此，不改 CURRENT_STATE、AI_HANDOFF、PROJECT_INDEX 或 release manifest，不扩大到其他共享摘要。
- 源码证据以该 main 为准。本轮实际浏览器显示运行版本 **0752d64f309d68b6e52afbbd712d28e0d9db9c1e**，构建 staging-material-0752d64f；main 与部署版本分别记录；另以 git diff 核对两者的 app/、components/、features/，没有源码差异，故这些UI证据可以对应。未重查运行镜像完整字节，亦未把其他后端/运维差异宣称为已部署。

源码链接为仓库相对路径及精确一基行号；UI 文件未改，因此可按本轮 main 复核。现有业务事实优先执行代码及有效决策，旧 Browser/候选文案不混作当前 Server UI。

## 3. 检查方法及边界

1. 读取 AGENTS、PROJECT_INDEX、CURRENT_STATE、业务规则、UI_FOUNDATION、发布基线和订单/报价/权限/排单/关账契约，核对既有批准范围。重点保留 PR64/D-099、D-102、P6 及 2026-11-19 紧凑页面的边界。
2. 枚举全部 44 个路由入口；检查 quote-authority.ts 白名单、orderRead 能力开关、QuoteServerBoundary、页面内部 session/RBAC 和 authority 分支。
3. 扫描 210 个非测试 TSX 的说明/标题/表单/原生操作/局部样式信号，人工追踪正式分支。检查 Foundation、报价版本/成本/附件/导出、订单来源/交期/批次、物料交易/到料/货款、生产计划/实际记录、关账来源/执行方/期间/恢复、账号与日志组件。
4. 使用已有登录会话，在 Staging 只读打开清单入口及现有报价、订单、物料详情。使用页面 AX 与实际截图核对主视图；正文表格/资料异步加载不足时再次观察。没有创建账号、退出会话、修改筛选偏好、录入表单、保存、上传、删除、导出、导入、同步采集或重发请求。
5. 截图用于现场视觉判断，未将含业务数据的截图、原始 AX、账号详情或私有导出提交到公开仓库。报告只记录路径、行为和脱敏结论。
6. 现有 Chrome inventory 的请求策略读取失败；IAB 已成功。一次 DOM/CDP 读取超时后改用可用的 AX/截图，没有据此宣称浏览器整体不可用，也没有通过其他方式绕过控制。
7. 共享状态/错误/危险弹窗以源码为主，未通过制造故障、撤权或真实提交来复现。报价详情先查看既有合成验收记录，后查看一个现有多价格方案报价：仅对照编辑按钮Enter/鼠标开窗并取消，未改字段或保存，页面仍显示“已保存”。不代表全部报价类型。

### 3.1 当前 Server 范围逐入口覆盖

“正文”表示至少看到该入口的桌面主结构/已存在状态，不表示所有分页、弹层或所有数据均检查完；用户管理与关账别名分别请求但只算同一类独立视图。

| 路由 | 页面 | 源码入口 | 实机结果与限制 |
| --- | --- | --- | --- |
| `/` | 首页 | [app/page.tsx:1](../app/page.tsx#L1) | 跳至 /quote-center；不计独立正文 |
| `/basic-settings/brands` | 品牌设置 | [app/basic-settings/brands/page.tsx:1](../app/basic-settings/brands/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/basic-settings/customer-salespeople` | 客户业务员 | [app/basic-settings/customer-salespeople/page.tsx:1](../app/basic-settings/customer-salespeople/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/basic-settings/fabrics` | 面料库 | [app/basic-settings/fabrics/page.tsx:1](../app/basic-settings/fabrics/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/basic-settings/outsource-factories` | 外发厂 | [app/basic-settings/outsource-factories/page.tsx:1](../app/basic-settings/outsource-factories/page.tsx#L1) | 正文及空列表；未创建资源，非空记录展示以源码为主 |
| `/basic-settings/production-groups` | 生产组 | [app/basic-settings/production-groups/page.tsx:1](../app/basic-settings/production-groups/page.tsx#L1) | 正文及空列表；未创建资源，非空记录展示以源码为主 |
| `/basic-settings/trims` | 辅料库 | [app/basic-settings/trims/page.tsx:1](../app/basic-settings/trims/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/basic-settings/user-permissions` | 用户管理（旧地址别名） | [app/basic-settings/user-permissions/page.tsx:1](../app/basic-settings/user-permissions/page.tsx#L1) | 正文；与 /system-settings/users 同一 ServerUserPermissionPage |
| `/closing-center` | 关账调整 | [app/closing-center/page.tsx:1](../app/closing-center/page.tsx#L1) | 全年汇总、12个月及明细加载后再次核对；未操作期间 |
| `/closing-center/detail` | 关账调整（同组件别名） | [app/closing-center/detail/page.tsx:1](../app/closing-center/detail/page.tsx#L1) | 正文；与 /closing-center 同一 ServerClosingAdjustmentPage |
| `/login` | 登录 | [app/login/page.tsx:1](../app/login/page.tsx#L1) | 已登录自动跳至报价列表；未退出检查匿名登录屏 |
| `/order-center` | 订单列表/全部合同 | [app/order-center/page.tsx:1](../app/order-center/page.tsx#L1) | 正式列表数据加载完成；目录/接纳/导入弹窗仅源码 |
| `/order-center/server-detail` | 正式订单详情 | [app/order-center/server-detail/page.tsx:1](../app/order-center/server-detail/page.tsx#L1) | 从现有列表“查看”进入；来源/颜色/物料历史状态可见 |
| `/order-center/style-progress/detail` | 正式物料跟进 | [app/order-center/style-progress/detail/page.tsx:1](../app/order-center/style-progress/detail/page.tsx#L1) | 从现有订单链接进入；主表、单位、统计及状态可见 |
| `/production-scheduling` | 生产排单 | [app/production-scheduling/page.tsx:1](../app/production-scheduling/page.tsx#L1) | 正文与无生产组空态；非空队列/实际登记仅源码 |
| `/quote-center` | 报价列表 | [app/quote-center/page.tsx:1](../app/quote-center/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/quote-center/detail` | 报价详情 | [app/quote-center/detail/page.tsx:1](../app/quote-center/detail/page.tsx#L1) | 既有合成报价详情；基础/成本/版本/附件可见，未编辑 |
| `/quote-center/new` | 报价新建/创建恢复 | [app/quote-center/new/page.tsx:1](../app/quote-center/new/page.tsx#L1) | 直接 GET 无 creationRequestId 的恢复/创建入口；未点击创建，不新增草稿 |
| `/system-settings/ainuoke-sync-records` | 艾诺科同步记录 | [app/system-settings/ainuoke-sync-records/page.tsx:1](../app/system-settings/ainuoke-sync-records/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/system-settings/operation-logs` | 操作日志 | [app/system-settings/operation-logs/page.tsx:1](../app/system-settings/operation-logs/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/system-settings/production-infrastructure` | 生产与运输 | [app/system-settings/production-infrastructure/page.tsx:1](../app/system-settings/production-infrastructure/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/system-settings/progress-settings` | 进度设置 | [app/system-settings/progress-settings/page.tsx:1](../app/system-settings/progress-settings/page.tsx#L1) | 直接入口，无订单上下文；未编辑排序 |
| `/system-settings/quote-settings` | 报价设置 | [app/system-settings/quote-settings/page.tsx:1](../app/system-settings/quote-settings/page.tsx#L1) | 正文；现有会话只读，未操作保存 |
| `/system-settings/roles` | 角色权限 | [app/system-settings/roles/page.tsx:1](../app/system-settings/roles/page.tsx#L1) | 角色列表/未选中详情；未切换权限或提交角色 |
| `/system-settings/users` | 用户管理 | [app/system-settings/users/page.tsx:1](../app/system-settings/users/page.tsx#L1) | 正文；现有会话只读，未操作保存 |

开放边界证据：[features/quote-center/authority/quote-authority.ts:15](../features/quote-center/authority/quote-authority.ts#L15)、[features/quote-center/components/quote-server-boundary.tsx:21](../features/quote-center/components/quote-server-boundary.tsx#L21)、[features/order-center/server/read-capability.ts:11](../features/order-center/server/read-capability.ts#L11)。除 /login 外，Server 页面需要可信会话；订单/物料/排单/关账还依赖 snapshot 能力及各页面权限。没有用当前管理员可见页面推导普通角色同样可见。

### 3.2 当前被拦截的19个入口

这些页面已检查路由入口及对应 authority/boundary，部分旧组件也纳入静态扫描；**没有进行其业务实机审查，也不建议借本轮规范工作重新开放**。

| 路由 | 对应旧/候选页面 | 源码入口 | 当前 Server 状态 |
| --- | --- | --- | --- |
| `/ainuoke-sync` | 旧艾诺科同步 | [app/ainuoke-sync/page.tsx:1](../app/ainuoke-sync/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/ainuoke-sync/contracts` | 旧合同查找 | [app/ainuoke-sync/contracts/page.tsx:1](../app/ainuoke-sync/contracts/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/basic-settings/server/brands` | 品牌候选 | [app/basic-settings/server/brands/page.tsx:1](../app/basic-settings/server/brands/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/basic-settings/server/customer-salespeople` | 业务员候选 | [app/basic-settings/server/customer-salespeople/page.tsx:1](../app/basic-settings/server/customer-salespeople/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/basic-settings/server/fabrics` | 面料候选 | [app/basic-settings/server/fabrics/page.tsx:1](../app/basic-settings/server/fabrics/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/basic-settings/server/trims` | 辅料候选 | [app/basic-settings/server/trims/page.tsx:1](../app/basic-settings/server/trims/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/basic-settings/templates` | Browser导出模板 | [app/basic-settings/templates/page.tsx:1](../app/basic-settings/templates/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/my-settings/ainuoke-account` | Windows个人艾诺科账号原型 | [app/my-settings/ainuoke-account/page.tsx:1](../app/my-settings/ainuoke-account/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/order-center/detail` | 旧Browser订单详情 | [app/order-center/detail/page.tsx:1](../app/order-center/detail/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/order-center/material-progress-preview` | 物料预览 | [app/order-center/material-progress-preview/page.tsx:1](../app/order-center/material-progress-preview/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/order-center/new` | 旧Browser新建订单 | [app/order-center/new/page.tsx:1](../app/order-center/new/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/order-center/server-preview` | Server订单预览 | [app/order-center/server-preview/page.tsx:1](../app/order-center/server-preview/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/quote-center/server-detail` | 旧Server报价详情候选 | [app/quote-center/server-detail/page.tsx:1](../app/quote-center/server-detail/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/quote-center/server-edit` | 旧Server编辑候选 | [app/quote-center/server-edit/page.tsx:1](../app/quote-center/server-edit/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/quote-center/server-new` | 旧Server新建候选 | [app/quote-center/server-new/page.tsx:1](../app/quote-center/server-new/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/quote-center/server-preview` | Server报价预览 | [app/quote-center/server-preview/page.tsx:1](../app/quote-center/server-preview/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/system-settings/closing-settings` | Browser关账设置 | [app/system-settings/closing-settings/page.tsx:1](../app/system-settings/closing-settings/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/system-settings/data-management` | Browser数据管理 | [app/system-settings/data-management/page.tsx:1](../app/system-settings/data-management/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |
| `/system-settings/server/quote-settings` | Server报价设置候选 | [app/system-settings/server/quote-settings/page.tsx:1](../app/system-settings/server/quote-settings/page.tsx#L1) | 不在白名单，由 boundary 拦截；未检查业务实机 |

### 3.3 尚未覆盖，不能称全站验收完成

- /login 匿名登录屏、认证失效、不同角色及金额受限详情：只检查源码；没有退出用户会话、切换真实角色或撤权。
- 非空生产队列、生产结束/重排、非空生产组和外发厂：真实环境对应可用样本不足；没有为审查创建业务数据。
- 所有创建/保存/删除/上传/导出/同步/接纳/支付相关结果；危险确认、并发冲突、待确认回执及故障恢复：源码覆盖，未执行提交或故障注入。价格方案编辑窗口仅做了只读开关对照，不能当作保存流程通过。
- 全部订单、全部报价版本/加工类型、全部合同/日志分页、全部弹窗和历史状态：没有逐条遍历；现有详情只作为代表性阅读样本。
- 移动/平板、200%缩放、屏幕阅读器、键盘全流程、触屏 tooltip、最终 computed style/对比度：未完成实测。不可仅凭 desktop AX 或 CSS 字面量判全部合格。
- 当前被拦截的19个历史/候选入口，不属于本次实机覆盖；主线源码与0752部署之间的全部差异未做逐状态实机对照。

## 4. 规则编号、严重程度与基线

| 编号 | 规则 |
| --- | --- |
| R1 | 删除无增量副标题、Slogan、工程解释、重复标签和教学文案 |
| R2 | 用布局、层级、间距和清晰主操作表达功能，不填充装饰 |
| R3 | 保留字段标签、单位、错误、提交状态、权限及危险操作后果 |
| R4 | Tooltip只承载补充信息，并支持键盘和触屏 |
| R5 | 首次使用者能从操作名称理解下一步和结果 |
| R6 | 优先复用 Foundation/现有业务组件，避免重复实现 |
| R7 | 按钮、表单、表格、弹层及样式一致 |
| R8 | 不自动推翻已批准UI，不修改业务规则/数据/权限 |

P1：关键语义或一类用户无法获取必要信息，优先给出整改样例；不表示已确认业务数据损坏。P2：明显交互/复用/状态问题；P3：常态冗余文案与低风险密度清理。改动风险“低/中/高”描述实施回归面，与问题严重程度不同。

发布基线严格使用现有定义：V0 必须视觉等价，V1 必须有恢复既有批准设计的证据；**删可见文案也不自动属于 V0**。下文新提案默认 V2 局部或 V3 跨页候选，具体原型/对照须用户批准；未把新规则作为自动批准记录。所有后续 UI 路径均须精确记录影响，不自动更新旧截图哈希。

## 5. 明确违反规则的问题（38项）

### 共享基础组件

#### G01 · 未保存修改弹窗（P3，改动风险低）

- 页面与位置：[components/foundation/guarded-draft.tsx:57](../components/foundation/guarded-draft.tsx#L57)；证据：源码；共享调用。
- 当前问题／规则：向用户解释 dirty 检测、默认值加载不会触发提示。 R1：删除冗余解释和工程术语。
- 具体整改：删除弹窗正文“只有真实修改才会出现此提示……”；保留标题、输入丢失后果、继续编辑和放弃修改按钮。
- 预期效果：减少阅读负担，后果仍清晰。
- 既有交互与验收基线：不改 dirty 判定或关闭保护；可见文案变化，V2 候选。

#### G02 · 展开侧栏（P3，改动风险低）

- 页面与位置：[components/foundation/app-shell.tsx:230](../components/foundation/app-shell.tsx#L230)；证据：源码＋Staging 视觉。
- 当前问题／规则：组织区域常驻“报价 UI V1”，与实际跨报价、订单、排单的工作区不符且属工程版本标签。 R1/R2：去装饰性标签，维护清晰层级。
- 具体整改：只删除“报价 UI V1”；组织名及未配置状态保留，避免顺带重做品牌区。
- 预期效果：侧栏更简洁且不把 UI 版本当业务属性。
- 既有交互与验收基线：不改导航；高度可能变化，V2 候选。

#### G03 · 侧栏用户身份（P3，改动风险低）

- 页面与位置：[components/foundation/app-shell.tsx:246](../components/foundation/app-shell.tsx#L246)；证据：源码＋Staging AX。
- 当前问题／规则：用户菜单详情直接显示“Server identity / Trusted Server identity”，普通用户无须了解 authority 类型。 R1：工程解释不进入常驻业务文案。
- 具体整改：保留姓名和账号；删除界面中的 identity 后缀，可信身份检查及必要的会话错误照旧。
- 预期效果：身份信息更直接。
- 既有交互与验收基线：仅显示格式；不改登录、角色或会话，V2 候选。

#### G04 · 无权限操作按钮（P1，改动风险中）

- 页面与位置：[components/foundation/button.tsx:11](../components/foundation/button.tsx#L11)；证据：源码；未切换角色实测。
- 当前问题／规则：权限原因只在 disabled 按钮外层 span 的 title/data-tooltip；外层不可聚焦且没有触屏展开机制。 R3/R4：权限限制是必要信息；补充提示支持键盘与触屏。
- 具体整改：为现有权限包装增加可访问的说明关联和具名 info 触发器，支持聚焦/点击/Escape；对主要受限操作保留可见的简短“无权限”。不改变 can() 或 disabled 判定。
- 预期效果：键盘和触屏用户也能知道为何不能操作。
- 既有交互与验收基线：共享组件波及多页，V3 候选；先做统一交互样例。

#### G05 · SearchableSelect 弹出搜索（P2，改动风险中）

- 页面与位置：[components/foundation/searchable-select.tsx:75](../components/foundation/searchable-select.tsx#L75)；证据：源码；普通表单实机，弹出读屏未测。
- 当前问题／规则：弹出的搜索输入只有“输入关键词搜索”占位符，未显式关联所属字段；aria-controls 指向外层 popover，而 listbox 本身无对应 id。 R3/R6：保留明确可访问名称并统一选择器交互。
- 具体整改：扩展既有组件的字段名/labelledby 支持，将命名传给搜索框，把 listboxId 放在实际 listbox；保持选项、创建、IME 和 Enter 规则。
- 预期效果：读屏能区分是在搜索品牌还是业务员，关联语义完整。
- 既有交互与验收基线：不改业务选择；可访问语义及键盘需回归，跨页 V3 候选。

#### G06 · FormItem 错误及提示（P2，改动风险中）

- 页面与位置：[components/foundation/form-item.tsx:4](../components/foundation/form-item.tsx#L4)；证据：源码；错误场景未注入。
- 当前问题／规则：error/hint 元素没有可供控件引用的 id，FormItem 的 error API 不提供 describedby/invalid 关联契约；不能仅靠红字及广播完成字段归属。 R3/R6：必要错误必须与输入关联。
- 具体整改：在现有 FormItem 建立稳定 label/help/error id，给原生与复合控件提供显式关联接口；逐个调用点接入 aria-describedby/aria-invalid，不删除错误文字。
- 预期效果：读屏聚焦时可定位该字段的具体错误。
- 既有交互与验收基线：共享 API 扩展，V3 候选；避免强行 clone 多个子控件。

#### G07 · 报价/角色/批次等复选框（P2，改动风险中）

- 页面与位置：[features/quote-center/components/production-quote-list-page.tsx:113](../features/quote-center/components/production-quote-list-page.tsx#L113)；证据：源码；相关提交未操作。
- 当前问题／规则：多处直接使用无 qc-checkbox 的原生 checkbox，绕过现有 Foundation Checkbox：还见角色页53、加工批次77、报价页面设置42及内部汇总12。 R6/R7：组件复用、统一选择控件样式。
- 具体整改：逐点改用 components/foundation/checkbox.tsx，保留 aria-label、checked、disabled、事件和选择上限；不改权限及选中集合。
- 预期效果：样式、聚焦轮廓和尺寸统一。
- 既有交互与验收基线：可见样式变化；跨模块 V3 候选，不能当作无差异 V0。

#### G08 · 放弃草稿/重读确认（P2，改动风险中）

- 页面与位置：[features/basic-settings/components/basic-settings-pages.tsx:321](../features/basic-settings/components/basic-settings-pages.tsx#L321)；证据：源码；危险确认未点击。
- 当前问题／规则：基础资料、报价设置、角色及关账原请求重试仍混用 window.confirm 与现有 Foundation Modal，确认样式、按钮名称及焦点行为不同。 R6/R7：统一弹窗及交互。
- 具体整改：先用 UnsavedDraftDialog 替换真实放弃草稿确认；重发原请求使用独立的现有 Modal，明确“继续核对/重发原请求”，不能复用成放弃草稿。相关位置：global-quote-settings-page.tsx:97、server-role-page.tsx:27、server-closing-source-dialog.tsx:42。
- 预期效果：确认体验一致且不混淆放弃输入与重试写入。
- 既有交互与验收基线：保留原 guard、busy、pending 条件，跨页 V3 候选。

### 报价中心

#### Q01 · 报价详情基础/成本区（P3，改动风险低）

- 页面与位置：[features/quote-center/components/quote-base-info.tsx:35](../features/quote-center/components/quote-base-info.tsx#L35)；证据：源码＋Staging AX。
- 当前问题／规则：基础信息、成本区、辅料区反复解释“整张快照”“独立报价快照”“不会修改基础库”；底部还有 QuoteRevision/价格方案的概念说明。 R1：去重并避免教学段落。
- 具体整改：删除基础信息标题下的快照解释、quote-editor.tsx:1307 成本标题区的独立快照教学句、cost-table.tsx 内重复引用说明，以及 quote-editor.tsx:1322 底部纯概念句；只在历史版本状态及实际修改影响处保留必要的一次说明。
- 预期效果：业务字段更靠前，版本与只读状态仍可识别。
- 既有交互与验收基线：报价详情既有 PR64/D-099 基线，可见删文案须按 V2 审批，不改快照逻辑。

#### Q02 · 更新报价版本确认（P2，改动风险中）

- 页面与位置：[features/quote-center/components/revision-manager-modal.tsx:146](../features/quote-center/components/revision-manager-modal.tsx#L146)；证据：源码；未触发创建。
- 当前问题／规则：确认按钮仅“是/否”，必须读整段解释才能知道两条路径分别做什么。 R2/R5：主操作名称应自解释。
- 具体整改：按现有 continueUpdate(true/false) 分别命名为“复制后更新”“直接更新”；说明保留历史版本不被覆盖的后果，不增删步骤。
- 预期效果：首次使用者从按钮即可理解选择。
- 既有交互与验收基线：不改两条业务流程；已批准更新流程，局部交互文案 V2 候选。

#### Q03 · 附件选择控件（P2，改动风险中）

- 页面与位置：[features/quote-center/components/attachment-panel.tsx:311](../features/quote-center/components/attachment-panel.tsx#L311)；证据：源码＋Staging AX。
- 当前问题／规则：三个视觉隐藏 file input 仍暴露为三个相同的“选择文件”按钮；Staging AX 中实际出现三个重复入口。 R3/R6：可访问名称与清晰操作。
- 具体整改：对应已有“从相册选择/拍照上传/上传文件”按钮时，将底层 input 设为真正隐藏并移出焦点序列，继续通过 ref 激活；若需直接操作则分别提供明确名称。
- 预期效果：消除读屏和 Tab 顺序中的无意义重复入口。
- 既有交互与验收基线：不改文件处理、上传次数或权限；辅助交互变化 V2 候选。

#### Q04 · 附件粘贴区（P3，改动风险低）

- 页面与位置：[features/quote-center/components/attachment-panel.tsx:309](../features/quote-center/components/attachment-panel.tsx#L309)；证据：源码＋Staging AX。
- 当前问题／规则：“聚焦粘贴区”是实现动作名称，旁边已有“点击这里后直接 Ctrl+V”区域，并重复说明焦点机制。 R1/R2/R5：减少解释，以动作名称传达用途。
- 具体整改：删除重复的“聚焦粘贴区”按钮；保留可聚焦粘贴区域，标题用“粘贴或拖入图片”，快捷键作为简短补充。不隐藏上传状态或错误。
- 预期效果：附件区更紧凑且仍可发现粘贴入口。
- 既有交互与验收基线：减少一个入口但保留能力，V2 候选。

#### Q05 · 款式图删除确认（P3，改动风险低）

- 页面与位置：[features/quote-center/components/attachment-panel.tsx:326](../features/quote-center/components/attachment-panel.tsx#L326)；证据：源码；未删除。
- 当前问题／规则：危险操作说明暴露 styleImageAttachmentId，且两段重复说明删除后没有款式图。 R1/R3：后果保留，工程字段删除。
- 具体整改：合并为“从当前报价移除此图片后，将暂无款式图；不会自动替换。”保留明确确认删除与取消，不宣称物理对象销毁。
- 预期效果：后果更易理解。
- 既有交互与验收基线：不改 unlink 或历史引用行为，V2 候选。

#### Q06 · 价格版本删除提示（P2，改动风险低）

- 页面与位置：[features/quote-center/components/quote-editor.tsx:1331](../features/quote-center/components/quote-editor.tsx#L1331)；证据：源码；未触发删除。
- 当前问题／规则：Server 共用确认框仍写“mock 阶段允许删除”，把真实已保存版本的操作描述为开发模拟。 R1/R3：危险操作后果必须准确。
- 具体整改：删除“mock 阶段允许删除”，保留当前报价移除、不可撤销及已有客户确认警告；按实际 Server 能力描述，不降低后台限制。
- 预期效果：避免误判为测试操作。
- 既有交互与验收基线：仅危险提示文案，不改变删除能力或接口；V2 候选。

#### Q07 · 内部报价汇总（P2，改动风险低）

- 页面与位置：[features/quote-center/components/server-summary-modal.tsx:11](../features/quote-center/components/server-summary-modal.tsx#L11)；证据：源码；未生成文件。
- 当前问题／规则：选项及说明直接使用 PriceVersion、Estimate、Quote active、PV，用户需要理解内部模型名。 R1/R5：自解释字段与操作。
- 具体整改：选项改“每个价格方案一行”；说明用“估算成本按整张报价保存，在每个价格方案行中重复展示，不参与重复合计”。保留当前估算范围和25张/500行/20MB限制。
- 预期效果：导出范围和重复值含义明确。
- 既有交互与验收基线：不改导出计算/列权限/预算，V2 候选。

#### Q08 · 导出报价弹窗（P3，改动风险低）

- 页面与位置：[features/quote-center/components/quote-export-modal.tsx:51](../features/quote-center/components/quote-export-modal.tsx#L51)；证据：源码；未导出。
- 当前问题／规则：常驻解释“Server 来源/Browser 自定义模板”，对正常导出决策没有额外帮助。 R1：去工程来源说明。
- 具体整改：删去 Server/Browser 对照句；保留模板名、版本、全部/当前价格方案范围，以及“未保存修改不包含在导出中”的警告。
- 预期效果：导出窗口聚焦实际可选项。
- 既有交互与验收基线：不改模板或读取来源，V2 候选。

#### Q09 · 报价操作记录弹窗（P3，改动风险低）

- 页面与位置：[features/operation-logs/components/operation-log-modal.tsx:30](../features/operation-logs/components/operation-log-modal.tsx#L30)；证据：源码。
- 当前问题／规则：标题“操作记录”下重复写“查看这份报价的操作与修改记录”。 R1：重复解释。
- 具体整改：删除 description，保留具体事件、筛选及关闭。
- 预期效果：减少无信息增量的副标题。
- 既有交互与验收基线：不改日志与权限；V2 候选。

#### Q10 · 价格方案卡片内的编辑键盘操作（P2，改动风险中）

- 页面与位置：[features/quote-center/components/price-version-selector.tsx:22](../features/quote-center/components/price-version-selector.tsx#L22)；证据：源码＋Staging Enter/鼠标对照；未改字段，取消后仍已保存。
- 当前问题／规则：父 article 的 Enter/Space 处理不区分事件来自自身还是内部“编辑”按钮；preventDefault 会拦截子按钮的默认键盘激活。Staging 同按钮 Enter 未开窗，鼠标点击开窗。 R3/R5/R6：可访问操作与一致的键盘交互。
- 具体整改：在既有 keySelect 中仅处理 event.target===event.currentTarget 的卡片按键，或为内部编辑阻止按键冒泡；保留卡片切换与编辑两套现有回调，不改报价版本命令。
- 预期效果：键盘和鼠标均可编辑价格方案，不会把“编辑”误作切换。
- 既有交互与验收基线：局部事件处理V2候选；须回归Tab/Enter/Space、卡片切换、只读及无权限场景，不保存任何真实编辑。

### 基础资料与设置

#### B01 · 品牌/业务员/面辅料/报价设置（P2，改动风险低）

- 页面与位置：[features/basic-settings/components/basic-settings-pages.tsx:90](../features/basic-settings/components/basic-settings-pages.tsx#L90)；证据：源码＋Staging AX。
- 当前问题／规则：正式页面常驻 PostgreSQL 来源说明和不回退 Browser 声明，并提供第二个“退出 Server 会话”入口；报价设置 global-quote-settings-page.tsx:99 同样存在。 R1/R2：去工程说明和重复操作区域。
- 具体整改：生产正式模式移除常态信息横幅及其中退出按钮；保留统一用户菜单退出、权限错误和异常提示。候选调试模式单独保留必要诊断，不改权威数据源。
- 预期效果：释放首屏空间，退出操作归一。
- 既有交互与验收基线：跨5页可见布局变化，V3 候选；不改 session/logout guard。

#### B02 · 面料库/辅料库及编辑抽屉（P3，改动风险低）

- 页面与位置：[features/basic-settings/components/basic-settings-pages.tsx:307](../features/basic-settings/components/basic-settings-pages.tsx#L307)；证据：源码＋Staging AX。
- 当前问题／规则：英文 eyebrow、稳定 ID、库不保存用量、引用形成快照等说明在页头和抽屉重复出现。 R1：删除次要标签和模型教学。
- 具体整改：删除 MATERIAL LIBRARY 和稳定 ID 句；保留供应商列，使同名可区分；用量、单耗、成本仍在具体报价维护，不新增库字段。对应辅料353、抽屉321/365。
- 预期效果：列表和编辑表单更直接。
- 既有交互与验收基线：不改数据模型；局部 V2 候选，字段布局不顺带重做。

#### B03 · 生产组/外发厂列表（P3，改动风险低）

- 页面与位置：[features/operations-settings/components/server-production-resource-page.tsx:196](../features/operations-settings/components/server-production-resource-page.tsx#L196)；证据：源码；当前真实资源为空。
- 当前问题／规则：名称下常驻技术 UUID，正常选择对象主要依赖名称、简称和地点；占用每行第二行。 R1/R2：技术标识按需披露。
- 具体整改：将 UUID 移至既有编辑抽屉内的技术详情，保留名称、简称/地点及状态以区分记录；不改稳定ID。
- 预期效果：提高同屏有效业务信息比例。
- 既有交互与验收基线：行密度会变化，V2 候选；重名样本需验证。

### 订单中心

#### O01 · 列表/详情权限失败（P2，改动风险低）

- 页面与位置：[features/order-center/components/server-order-center-page.tsx:327](../features/order-center/components/server-order-center-page.tsx#L327)；证据：源码；未撤权复现。
- 当前问题／规则：同一缺 order.view 分支同时渲染 AlertBanner 和 ErrorState；详情页199附近重复。 R1/R2：避免同一状态双重提示。
- 具体整改：保留一个带简明权限原因和联系管理员路径的 ErrorState；可保留已登录身份，不重复展示403和技术权限键。
- 预期效果：无权限时也能明确下一步。
- 既有交互与验收基线：不改权限判断；异常视图 V2 候选。

#### O02 · 全部合同目录空态（P2，改动风险低）

- 页面与位置：[features/order-center/components/server-source-catalog.tsx:57](../features/order-center/components/server-source-catalog.tsx#L57)；证据：源码；未用真实合同枚举测试。
- 当前问题／规则：已有目录但搜索无结果时，仍显示“目录接入后可在这里查询全部资料”，与“没有匹配的合同”标题矛盾。 R5：空态应指向正确下一步。
- 具体整改：按已有目录/筛选无匹配/首次未同步三种既有状态选择文案；无匹配时显示“调整搜索或范围”，未接入时保留真实未接入说明，不触发采集。
- 预期效果：不把查不到记录解释成系统未接入。
- 既有交互与验收基线：不改查数或接纳行为，V2 候选。

#### O03 · 物料读取失败提示（P2，改动风险中）

- 页面与位置：[features/ainuoke-material-progress/order-material-summary.tsx:22](../features/ainuoke-material-progress/order-material-summary.tsx#L22)；证据：源码；实机查看了历史来源状态，未故障注入。
- 当前问题／规则：读取异常一律转为“未接通或不可读取；不会回退 Browser”；无法从提示区分已有来源读取失败与未接入。 R1/R3/R5：必要错误原因及明确的下一步。
- 具体整改：使用已知且脱敏的错误分类做展示映射，区分权限、网络和来源未就绪；重读入口只调用已有 state.reload，不把“刷新来源”采集命令当读取重试。未知原因如实标未知。
- 预期效果：用户不会为读取错误误发真实同步。
- 既有交互与验收基线：需复核客户端保留的错误分类；不改采集/重试策略，V2 候选。

#### O04 · 取消加工下单批次（P2，改动风险低）

- 页面与位置：[features/order-center/components/processing-batch-dialog.tsx:83](../features/order-center/components/processing-batch-dialog.tsx#L83)；证据：源码；未取消。
- 当前问题／规则：“确认取消批次”为默认主色按钮，而同系统危险动作有既有 danger 变体；现有后果文字应保留。 R3/R7：危险操作后果及样式一致。
- 具体整改：仅对确认取消使用 Button variant=danger，保留原因、已生成订单不受处理和不能再导入的提示。
- 预期效果：降低与正常保存的视觉混淆。
- 既有交互与验收基线：不改取消流程或业务记录，V2 候选。

### 物料跟进

#### M01 · 物料需求表单位列（P1，改动风险中）

- 页面与位置：[features/style-progress/components/material-control-tower-read-only.tsx:262](../features/style-progress/components/material-control-tower-read-only.tsx#L262)；证据：源码＋Staging 视觉/AX。
- 当前问题／规则：列头仅“单位”，实际是已核实关联采购单位；不能推断为需求单位的关键限制只写在 th 的 title。实机该列紧挨需求数量。 R3/R4：关键单位语义不能只靠悬停。
- 具体整改：列头明确“采购单位”或“关联采购单位”，可访问名称一致；每笔采购/入库/出运/出库仍保留自己的单位。详情保留不可据此推断需求单位的规则，不换算或补齐未知量。
- 预期效果：避免把采购单位套到需求数量，触屏也可识别。
- 既有交互与验收基线：涉及关键业务展示，V2 候选；列宽与不同单位样本需对照批准，不能改计算口径。

#### M02 · 货款申请明细入口（P2，改动风险低）

- 页面与位置：[features/style-progress/components/material-control-tower-read-only.tsx:18](../features/style-progress/components/material-control-tower-read-only.tsx#L18)；证据：源码；未逐行打开货款明细。
- 当前问题／规则：页签称“对账”，实际 PaymentRequestsReadPanel 展示未经逐行物料关联的合同申请来源，未形成对账结论。 R3/R5：名称不能暗示未具备的业务能力。
- 具体整改：将该页签命名为“货款申请”或“申请记录”；保留“申请不等于实付、不能重复合计采购量”的可见限制。
- 预期效果：用户能预期打开的是来源明细。
- 既有交互与验收基线：不新增对账功能、不改取数；已批准来源模块局部 V2 候选。

#### M03 · 进度设置单一页签（P3，改动风险低）

- 页面与位置：[features/style-progress/components/material-progress-settings-page.tsx:33](../features/style-progress/components/material-progress-settings-page.tsx#L33)；证据：源码＋Staging AX。
- 当前问题／规则：只有“辅料排列”一个 tab，随后又有“辅料关键词优先级”标题，制造了不存在的分类选择。 R1/R2：避免无用途标签和装饰导航。
- 具体整改：将单一 tab 改为普通区块标题，并合并重复标题；保留关键词输入、顺序与保存状态。
- 预期效果：页面层级更短。
- 既有交互与验收基线：去掉无实质切换的导航外观，V2 候选。

#### M04 · 无订单上下文的进度设置（P2，改动风险低）

- 页面与位置：[features/style-progress/components/material-progress-settings-page.tsx:42](../features/style-progress/components/material-progress-settings-page.tsx#L42)；证据：源码＋Staging 直接入口。
- 当前问题／规则：直接从系统设置进入时 back=/order-center，但正文按钮固定叫“返回物料”；顶栏却已正确叫“返回订单列表”。 R5：按钮应准确表达目的地。
- 具体整改：复用本页已有 route 判定设置正文按钮名称；无上下文时用“返回订单列表”，有上下文时用“返回物料跟进”。不改目标地址。
- 预期效果：正文和顶栏预期一致。
- 既有交互与验收基线：仅文案，V2 候选；应覆盖有/无orderId。

#### M05 · 订单物料来源时间（P2，改动风险低）

- 页面与位置：[features/ainuoke-material-progress/order-material-summary.tsx:35](../features/ainuoke-material-progress/order-material-summary.tsx#L35)；证据：源码＋Staging AX。
- 当前问题／规则：来源读取时间直接输出 ISO/UTC 字符串，而物料详情及同步记录以北京时间展示，普通阅读需自行换算。 R3/R7：必要时间语义和格式一致。
- 具体整改：采用显式 Asia/Shanghai 的展示格式，保留原 dateTime/来源时间；在一处写明北京时间，不改 fetchedAt 值、陈旧判断或来源时效。
- 预期效果：跨页面核对来源时间更直接。
- 既有交互与验收基线：仅格式展示，V2 候选；保留原始时间于技术详情。

### 生产排单

#### P01 · 排单数量及平均日产表单（P2，改动风险低）

- 页面与位置：[features/production-scheduling/components/server-production-plan-fields.tsx:33](../features/production-scheduling/components/server-production-plan-fields.tsx#L33)；证据：源码；真实无生产组，未创建排单。
- 当前问题／规则：“排单数量”“平均日产”没有明确显示件/工作日单位；计划队列表的数量列也未统一标单位。 R3：单位属于必要信息。
- 具体整改：经现有成衣数量契约核实后，标签使用“排单数量（件）”“平均日产（件/工作日）”；工作日仍显式显示，队列表头统一标件。不重算工期或数量。
- 预期效果：录入和阅读时不依赖经验猜单位。
- 既有交互与验收基线：局部字段文案/列宽 V2 候选；保留最后编辑字段的既有联动。

#### P02 · 无生产组空态（P3，改动风险低）

- 页面与位置：[features/production-scheduling/components/server-production-scheduling-page.tsx:290](../features/production-scheduling/components/server-production-scheduling-page.tsx#L290)；证据：源码＋Staging AX。
- 当前问题／规则：没有生产组时，主从布局左侧和右侧分别显示相同空态；用户收到两次“请先维护生产组和日历”。 R1/R2：避免重复提示和空卡。
- 具体整改：只在主内容显示一个 EmptyState；左侧选择区保持空导航或隐藏，提供到现有生产组设置的真实入口，仍按现有权限显示。
- 预期效果：空环境下一步清晰。
- 既有交互与验收基线：空态局部布局 V2 候选；不自动创建资源。

### 关账调整

#### C01 · 显示范围筛选（P3，改动风险低）

- 页面与位置：[features/closing-center/components/server-closing-adjustment-page.tsx:65](../features/closing-center/components/server-closing-adjustment-page.tsx#L65)；证据：源码＋Staging 筛选首屏。
- 当前问题／规则：“范围同时影响明细和汇总，不改变订单或账本”常驻筛选旁，前半是必须理解的范围，后半是重复的不变性说明。 R1/R2：结构表达关联，减少无必要说明。
- 具体整改：把筛选与全年汇总及明细置于同一视觉范围，字段名用“汇总及明细范围”；删除“不改变订单或账本”。金融范围事实不能仅藏在tooltip。
- 预期效果：范围作用直接可见，减少一整行说明。
- 既有交互与验收基线：不改 scope 查询或金额，局部布局 V2 候选。

### 账号与权限

#### U01 · 用户管理页头（P3，改动风险低）

- 页面与位置：[features/permissions/components/server-user-permission-page.tsx:70](../features/permissions/components/server-user-permission-page.tsx#L70)；证据：源码＋Staging AX。
- 当前问题／规则：副标题“管理登录账号、角色和启用状态”重复标题、列名和操作。 R1：无增量副标题。
- 具体整改：删除该 description；保留账号不可修改、格式、恢复需重置密码和操作后果。
- 预期效果：用户列表更靠前。
- 既有交互与验收基线：仅文案，V2 候选。

#### U02 · 角色权限页头与详情（P3，改动风险低）

- 页面与位置：[features/permissions/components/server-role-page.tsx:50](../features/permissions/components/server-role-page.tsx#L50)；证据：源码＋Staging 角色列表。
- 当前问题／规则：页头“先配置角色…再到用户管理…”及普通详情“保存才会生效”常驻教学；与控件和保存按钮重复。 R1/R5：用明确结构和操作名表达流程。
- 具体整改：删普通角色的教学句；保留系统管理员保护说明、权限定义及新授予/撤销预览。不要全删每项权限解释。
- 预期效果：角色编辑聚焦实际权限和影响。
- 既有交互与验收基线：不改角色模型或默认授权，V2 候选。

#### U03 · 删除角色确认（P2，改动风险低）

- 页面与位置：[features/permissions/components/server-role-page.tsx:58](../features/permissions/components/server-role-page.tsx#L58)；证据：源码；未删除。
- 当前问题／规则：同一确认框用于保存和删除，删除时确认按钮仍为默认主色。 R3/R7：危险动作视觉一致。
- 具体整改：按 confirm 类型给删除确认使用 danger、保存保持主色；保留仍有用户使用时的阻断及历史保留后果。
- 预期效果：保存与删除可区分。
- 既有交互与验收基线：不改保护角色/引用校验，V2 候选。

### 日志与同步审计

#### L01 · 同步记录页头（P3，改动风险低）

- 页面与位置：[features/ainuoke-sync-audit/page.tsx:27](../features/ainuoke-sync-audit/page.tsx#L27)；证据：源码＋Staging AX。
- 当前问题／规则：“查看来源读取、业务提交及失败恢复记录”重复页面内容；北京时间信息仍必要。 R1/R3：删除泛化描述，保留时间口径。
- 具体整改：删除前半句，把“北京时间”放到时间列头或筛选区一次显示；保留统计口径及历史非实时标识。
- 预期效果：首屏更紧凑，时间语义不丢。
- 既有交互与验收基线：不改审计定义和统计口径，V2 候选。

#### L02 · 正式操作日志页头（P3，改动风险低）

- 页面与位置：[features/operation-logs/components/server-operation-log-viewer.tsx:81](../features/operation-logs/components/server-operation-log-viewer.tsx#L81)；证据：源码＋Staging AX。
- 当前问题／规则：“查看团队操作与修改前后的记录”与“操作日志”及详情内容重复。旧 Browser 页另有 OperationLog 说明，不能混作当前 Server 页面证据。 R1：去重复副标题并区分可达分支。
- 具体整改：删除 ServerGlobalOperationLogPage 的泛化 description；保留北京时间、修改前后差异和技术详情折叠。
- 预期效果：日志页更直接。
- 既有交互与验收基线：仅文案，V2 候选。

## 6. 存在设计争议，必须先由用户决定（10项）

这些不是“批准后自动全部实施”的清单。先决定目标，再给对应原型及准确路径，不与明确问题批量混做。

### D01 · 登录：已验收的动画登录、三句 Slogan

- 位置：[features/server-auth/components/animated-login-page.tsx:63](../features/server-auth/components/animated-login-page.tsx#L63)。
- 事实与争议：确有“一针一线，各有其序”“欢迎回来……”及“安心有序”常驻文案；它们符合新规则的精简方向，但登录页曾获用户明确接受。
- 可评审提案与效果：建议只删除三句 Slogan，保持四角色动画、蓝色分栏、表单标签和登录流程；是否保留有趣风格由用户决定。
- 风险、优先级与基线：低风险，建议P3；影响已批准登录视觉，V2；本会话为已登录状态，/login 自动跳转，未退出验证登录屏。 适用R2/R8；业务口径和权限保持。

### D02 · 物料跟进：概览数字与六个页签重复

- 位置：[features/style-progress/components/material-control-tower-read-only.tsx:277](../features/style-progress/components/material-control-tower-read-only.tsx#L277)。
- 事实与争议：实机看到六个统计入口及下方六个同范围页签，名称和数量多处重复；统计同时承担导航，不能仅凭“卡片多”认定无用。
- 可评审提案与效果：提供两版对照：保留可点击统计并去重复页签，或把数量合并到页签后移除统计行；两版都保留自购/厂供及四流边界。
- 风险、优先级与基线：中风险，建议P2；改变已用信息架构与首屏密度，V2，不在本轮选择。 适用R2/R8；业务口径和权限保持。

### D03 · 报价列表：组合列宽、截断与默认密度

- 位置：[features/quote-center/components/production-quote-list-page.tsx:104](../features/quote-center/components/production-quote-list-page.tsx#L104)。
- 事实与争议：1280宽实机存在列头折行、款名省略和尾部字段拥挤；列宽/组合列及用户偏好已有受审规则，不能用一次截图推定全局默认错误。
- 可评审提案与效果：先对默认/现有用户偏好、不同缩放和长文本做对照，再决定扩大关键身份列、折叠次要列或调整默认组合；保留完整详情入口，不清用户宽度存储。
- 风险、优先级与基线：中风险，建议P2；已批准紧凑报价列表与稳定偏好，V2；本轮未改缩放或偏好。 适用R2/R8；业务口径和权限保持。

### D04 · 共享运行标识：完整 SHA 常驻及 PROD 标签

- 位置：[components/foundation/build-info-indicator.tsx:25](../components/foundation/build-info-indicator.tsx#L25)。
- 事实与争议：底部覆盖层常驻完整40位SHA；environmentLabel由构建development/production产生，Staging也显示PROD。它有验收追踪价值，但可能被理解成真实生产环境。
- 可评审提案与效果：可选短SHA常驻、完整构建信息放可点击详情；若要显示Staging/Production部署环境，须先明确其可信来源，不按域名猜测，也不删除追踪能力。
- 风险、优先级与基线：中风险，建议P2；跨页诊断与布局，V3；不把构建production模式判成误部署。 适用R2/R8；业务口径和权限保持。

### D05 · 生产与运输：四类资源工作区和卡片密度

- 位置：[features/operations-settings/components/server-production-resource-page.tsx:237](../features/operations-settings/components/server-production-resource-page.tsx#L237)。
- 事实与争议：地点、日历、集货仓、运输方案分别有标题、搜索、状态及列表；存在重复工具区，但各自有独立资源和分页/错误状态。
- 可评审提案与效果：先画同页分组与按资源切换两种原型；优先收纳已完成配置，保留跨资源引用编辑。不得仅为“少卡片”合并四类业务模型。
- 风险、优先级与基线：中风险，建议P2；工作区结构V2，相关共享布局变化可能V3。 适用R2/R8；业务口径和权限保持。

### D06 · 排单/关账/物料表格：专用表格是否替换为 DataTable

- 位置：[features/production-scheduling/components/server-production-scheduling-page.tsx:292](../features/production-scheduling/components/server-production-scheduling-page.tsx#L292)。
- 事实与争议：存在手写table、池行和自定义状态样式，但也承担编辑对照、分组展开、固定操作列和精确数值语义；并非全部重复造轮子。
- 可评审提案与效果：先比较现有DataTable的row、分组、移动视图及编辑能力；只提取已重复的表壳/状态映射，保留专用业务渲染，不强行重写大表。
- 风险、优先级与基线：高改动风险，建议P3后置；多模块V3，需具体组件差异和原型审批。 适用R2/R8；业务口径和权限保持。

### D07 · 关账调整：全年汇总和12个月卡片占据首屏

- 位置：[features/closing-center/components/server-closing-adjustment-page.tsx:69](../features/closing-center/components/server-closing-adjustment-page.tsx#L69)。
- 事实与争议：实机订单明细位于全年汇总和月份卡片之后；首屏大面积显示待完善。月卡本身是期间管理入口，金额未知和锁定状态是必要信息。
- 可评审提案与效果：请用户确定“先看期间”或“先调订单”。若以后者为主，可将月卡压成可展开月份条、保留CNY/USD及期间状态，再将明细提前；不自动填0或合并币种。
- 风险、优先级与基线：中风险，建议P2；已批准关账模型/视觉，V2。 适用R2/R8；业务口径和权限保持。

### D08 · 全站样式：小字号、间距和圆角的多层覆盖

- 位置：[app/quote-center/quote-center.css:256](../app/quote-center/quote-center.css#L256)。
- 事实与争议：源码有7px/9px的helper字体定义及多次覆盖，不同模块另有局部CSS；这些不是最终computed值的完整证明。仅看字面值不能批量替换。
- 可评审提案与效果：先在桌面/紧凑/触屏及缩放下记录最终字号、行高、对比度和点击区域，再决定使用哪些现有token；必要错误/单位必须优先可读。
- 风险、优先级与基线：高回归风险，建议P2规划、后置执行；跨页V3；本轮未完成多分辨率像素/对比度测试。 适用R2/R8；业务口径和权限保持。

### D09 · 报价附件：普通附件即时移除是否统一确认

- 位置：[features/quote-center/components/attachment-panel.tsx:276](../features/quote-center/components/attachment-panel.tsx#L276)。
- 事实与争议：非款式图直接unlink，款式图单独确认；当前移除含持久化关系变化。尚未执行删除验证，也不能凭“删除”推断物理对象及历史是否被销毁。
- 可评审提案与效果：建议普通附件也用既有Modal先说明“从当前报价移除”的确切范围；先核实controller及历史契约，再由用户决定是否统一确认。不新增未要求的撤销/回收站。
- 风险、优先级与基线：中风险，建议P1决策；与既有确认范围有冲突，V2；需要用户批准后才能改变。 适用R2/R8；业务口径和权限保持。

### D10 · 角色权限：每项权限的说明能否收起

- 位置：[features/permissions/components/server-role-page.tsx:53](../features/permissions/components/server-role-page.tsx#L53)。
- 事实与争议：权限定义可能很长，但成本、售价、工价是独立授权，部分说明是正确授权的必要信息，不能整批移进hover提示。
- 可评审提案与效果：保留涉及金额/管理能力的关键限制；仅把重复的普通定义移到键盘/触屏可用的info触发器，先选一组权限做对照。
- 风险、优先级与基线：中风险，建议P3；不改任何权限键和授权矩阵，V2；未用不同真实角色对照。 适用R2/R8；业务口径和权限保持。

## 7. 符合规则、不建议修改的设计（12项）

| 编号 | 模块/证据 | 保留内容及原因 |
| --- | --- | --- |
| K01 | 报价主操作与已精简列表 · [features/quote-center/components/production-quote-list-page.tsx:126](../features/quote-center/components/production-quote-list-page.tsx#L126) | 保留顶栏新建/更多及列表筛选，不重新加hero、统计卡或装饰标题；服从已批准紧凑报价基线。 |
| K02 | 订单P6与后继紧凑布局 · [features/order-center/components/server-sales-order-detail-page.tsx:224](../features/order-center/components/server-sales-order-detail-page.tsx#L224) | 保留概况、颜色、商业历史、物料及默认折叠技术详情；不恢复已退役款式进度/风险列表导航。 |
| K03 | 订单删除与独立异常 · [features/order-center/components/order-alert-tags.tsx:1](../features/order-center/components/order-alert-tags.tsx#L1) | 来源删除标签及数量/单位/来源时效异常不能当冗余状态删掉；来源删除不等于本地业务取消。 |
| K04 | 物料未知、空记录和计量单位 · [features/style-progress/components/material-control-tower-read-only.tsx:59](../features/style-progress/components/material-control-tower-read-only.tsx#L59) | 保留“单位待核实”、缺来源、完整空结果及各交易自身单位；不把未知改0，不跨单位合计。 |
| K05 | 货款申请限制 · [features/style-progress/components/payment-requests-read-panel.tsx:67](../features/style-progress/components/payment-requests-read-panel.tsx#L67) | 保留未逐行关联物料、重复采购量不可合计及申请不等于银行实付；属于必要业务边界。 |
| K06 | 关账币种、待完善与冻结 · [features/closing-center/components/server-closing-adjustment-page.tsx:22](../features/closing-center/components/server-closing-adjustment-page.tsx#L22) | 保留CNY与USD分别汇总、已知小计、待确认项、开放/确认/锁定区别；不能为了简洁掩盖缺证。 |
| K07 | 原请求与未知结果 · [features/order-center/components/server-delivery-plan-maintenance.tsx:64](../features/order-center/components/server-delivery-plan-maintenance.tsx#L64) | 保留核对原请求、忙碌/待确认、冲突和禁止重复提交提示；移除工程话术不能改原请求保护。 |
| K08 | Foundation弹层基础能力 · [components/foundation/overlay.ts:80](../components/foundation/overlay.ts#L80) | 保留焦点约束、Escape、关闭后焦点恢复、嵌套弹层及滚动锁；没有必要另造一套弹窗。 |
| K09 | 表单标签与单位 · [features/quote-center/components/cost-table.tsx:1](../features/quote-center/components/cost-table.tsx#L1) | 保留成本表单价/单耗/金额单位、输入名称、错误和权限状态；视觉隐藏的可访问标签不能当冗余文案删。 |
| K10 | 账号危险操作后果 · [features/permissions/components/server-user-permission-page.tsx:82](../features/permissions/components/server-user-permission-page.tsx#L82) | 保留删除用户后禁止登录、可恢复、重置密码使原会话失效等后果；不得仅放tooltip。 |
| K11 | 审计计数与时间口径 · [features/ainuoke-sync-audit/page.tsx:37](../features/ainuoke-sync-audit/page.tsx#L37) | 保留读取/提交区分、历史非实时、未知计数/时点、完整分页和来源证据；不将其当教学说明批量删除。 |
| K12 | 角色/路由/数据权威边界 · [features/quote-center/components/quote-server-boundary.tsx:21](../features/quote-center/components/quote-server-boundary.tsx#L21) | 未开放页面继续阻断，不恢复Browser旧业务数据；保留必要未配置、只读、权限不足、历史和合成验收标识。 |

现有小字号、手写表格、英文字符串、说明段落或卡片的存在本身不是统一删除依据。只删除本报告明确识别的无增量内容，保留真实业务风险、复杂交易口径及已批准模式。布局/密度争议先做对照，不以追加长文案代替结构调整。

## 8. 按模块整改汇总

| 模块 | 明确问题 | 具体范围 | 不应越界 |
| --- | --- | --- | --- |
| 共享Foundation/导航 | G01–G08，8项 | 删dirty/版本/identity话术；权限提示可访问；选择器和字段错误关联；复选框及确认统一 | 不改权限判断、Enter/IME规则或退出保护 |
| 报价 | Q01–Q10，10项 | 去重复快照教学；版本按钮具名；附件选择可访问；粘贴入口精简；删除后果准确；汇总/导出/日志文案业务化 | 不改计算、币种、Revision/PV/CCT或上传/导出预算 |
| 基础资料/资源/报价设置 | B01–B03，3项 | 移除正式页面工程横幅及重复退出；精简库文案；资源ID按需披露 | 不改主数据/稳定ID/默认值与历史快照 |
| 订单 | O01–O04，4项 | 合并权限提示；修正目录空态；只读重读与真实采集区分；取消批次危险样式 | 不改自动建单、来源身份、暂停/回执及批次状态 |
| 物料/进度设置 | M01–M05，5项 | 明确采购单位；货款入口准确；去单页签；修正返回文案；统一时间展示 | 不推断需求单位、不合计异单位、不将申请当实付 |
| 生产排单 | P01–P02，2项 | 数量/日产单位明确；合并无生产组空态 | 不改联动工期、计划/实际记录或重排范围 |
| 关账 | C01，1项 | 筛选名和结构表达明细/汇总同范围 | 不改税率、分月、价格采用、锁定与不同币种 |
| 账号/权限 | U01–U03，3项 | 去普通教学副标题；危险按钮一致 | 保留逐项关键权限解释和管理员/引用保护 |
| 日志/同步审计 | L01–L02，2项 | 去泛化副标题；北京时间在明确位置保留 | 不改计数定义、审计来源、历史及权限 |

## 9. 建议优先处理的前10项

以下顺序是讨论及原型准备建议，不是执行授权。共享组件先完成统一样例，再迁移调用点，避免各模块自行造tooltip或确认框。

| 建议顺序 | 编号 | 原因与最小交付 |
| --- | --- | --- |
| 1 | M01 物料需求表单位列 | 列头明确“采购单位”或“关联采购单位”，可访问名称一致；每笔采购/入库/出运/出库仍保留自己的单位。详情保留不可据此推断需求单位的规则，不换算或补齐未知量。 |
| 2 | G04 无权限操作按钮 | 为现有权限包装增加可访问的说明关联和具名 info 触发器，支持聚焦/点击/Escape；对主要受限操作保留可见的简短“无权限”。不改变 can() 或 disabled 判定。 |
| 3 | Q10 价格方案卡片内的编辑键盘操作 | 在既有 keySelect 中仅处理 event.target===event.currentTarget 的卡片按键，或为内部编辑阻止按键冒泡；保留卡片切换与编辑两套现有回调，不改报价版本命令。 |
| 4 | Q03 附件选择控件 | 对应已有“从相册选择/拍照上传/上传文件”按钮时，将底层 input 设为真正隐藏并移出焦点序列，继续通过 ref 激活；若需直接操作则分别提供明确名称。 |
| 5 | Q06 价格版本删除提示 | 删除“mock 阶段允许删除”，保留当前报价移除、不可撤销及已有客户确认警告；按实际 Server 能力描述，不降低后台限制。 |
| 6 | Q02 更新报价版本确认 | 按现有 continueUpdate(true/false) 分别命名为“复制后更新”“直接更新”；说明保留历史版本不被覆盖的后果，不增删步骤。 |
| 7 | O01 列表/详情权限失败 | 保留一个带简明权限原因和联系管理员路径的 ErrorState；可保留已登录身份，不重复展示403和技术权限键。 |
| 8 | P01 排单数量及平均日产表单 | 经现有成衣数量契约核实后，标签使用“排单数量（件）”“平均日产（件/工作日）”；工作日仍显式显示，队列表头统一标件。不重算工期或数量。 |
| 9 | B01 品牌/业务员/面辅料/报价设置 | 生产正式模式移除常态信息横幅及其中退出按钮；保留统一用户菜单退出、权限错误和异常提示。候选调试模式单独保留必要诊断，不改权威数据源。 |
| 10 | G08 放弃草稿/重读确认 | 先用 UnsavedDraftDialog 替换真实放弃草稿确认；重发原请求使用独立的现有 Modal，明确“继续核对/重发原请求”，不能复用成放弃草稿。相关位置：global-quote-settings-page.tsx:97、server-role-page.tsx:27、server-closing-source-dialog.tsx:42。 |

## 10. 分批整改计划与验收方式

### 批次A：关键语义与可访问样例

范围建议 M01、G04、Q10、Q03、Q02、Q06、P01。先提交单位列/权限说明/具名按钮/附件焦点的具体前后对照，用户批准精确范围后实施。仅改变展示和现有操作可达性，不改请求、运算及权限。

验收：触屏无需hover也能理解单位和权限原因；键盘可获取补充信息，隐藏file input不再产生三个重复焦点；两条报价版本路径名称明确但回调不变，价格方案卡片及内部编辑的Enter/Space各自生效；删除后果准确，保存/上传/采集次数不增加。按适用页面与金额权限、不同单位/未知值样本验证。

### 批次B：共享组件与确认交互

范围建议 G05–G08。先扩展现有Foundation并制作一个调用点样例，再分模块迁移。保留Select创建/IME/Enter、原生字段与复合控件命名、未知结果和busy条件。需要跨页V3原型批准，不新引入另一套UI库。

验收：字段错误与控件关联、权限说明键盘/触屏可达、checkbox统一聚焦/禁用样式；放弃草稿与重发原请求分别确认，不因换Modal改变关闭、提交或原请求保护。测试真实交互契约，避免只测试新实现的内部细节。

### 批次C：确定的文案与重复区域清理

范围建议 G01–G03、Q01/Q04/Q05/Q07–Q09、B01–B03、O01/O02/O04、M03–M05、P02、C01、U01–U03、L01/L02。按模块小PR，先删除报告点名内容，再判断是否需要微调原布局；不要批量扫描删除所有description或small。

验收：必要标签、单位、错误和危险后果仍可见，主操作不丢；既有用户偏好和组件回调保持。桌面/紧凑/触屏对照，长名称、空态、只读、无权限及历史状态各有代表性检查。每个UI路径按精确基线申报，不能冒用V0。

### 批次D：待用户选定的结构调整

D01–D10 分别决定，不整体捆绑实施。先明确物料统计/页签保留哪套、关账首屏以期间还是订单为主、登录品牌风格、运行标识展示方式；再决定表格/token的共享扩展。跨页大改最后做，禁止为统一而改业务模型、删状态或清偏好。

验收：获批原型与对应日期/范围一致，有多尺寸实机材料；source guard/CI只证明工程，不代替用户视觉接受。本轮未提供可用于直接实施V2/V3的最终原型，须在用户选范围后补齐。

## 11. 验证、发布基线与远端交付

### 已完成

- 当前main、ecceb144增量、原/新工作树及范围隔离已核实；AGENTS规则与用户批准内容一致。
- 已创建独立Issue #165，product自动加入既有Project；读取实际19个字段及7个当前项目条目，先将本需求Status从Idea调整为Research并读回，报告v1形成后仅将本需求调整至Design并再次读回，等待用户选定整改范围；没有进入Ready。未改其他字段、选项、视图、自动化或其他任务。
- 锁文件离线安装648个本地依赖，使用 --ignore-scripts，未改依赖清单或锁文件。依赖不提交，不擅自修改共享环境。
- 正式交付脚本DryRun绑定13d5f0c74fc2efc938466baad86d1f5259f15e9e：pushes=0，Git uncertain_transport，独立API可读，NETWORK_DEGRADED。没有实际push；没有使用文件API重建提交或创建空PR。
- 精确main门禁已执行：`npm run check:release-baseline -- --base-sha 10b9a7d827e1c09f152ead58c21f26712d49a619`，结果 **FAIL**，唯一错误 **BASE_SHA_MISMATCH**。仓库继承的manifest仍指向4e1f9a514c8ff6e9cf7289d724df33c32bc05368，13页/68能力/0 UI文件变化。该错误与本轮UI业务变更无关，也不能写成发布PASS。
- 不为消除失败修改release manifest、冻结证据或共享状态。用户只批准规范和报告；真正PR交付前需要单独获准并按协议协调基线，或明确接受文档PR暂保留这个既有门禁失败。本报告不自行批准例外。

### 待最终记录

发布回归 `npm run test:release-baseline` 已启动，最终结果将在本报告收口时更新。报告链接/行号、计数、diff范围及原分支保全检查将在最终commit前完成。未运行无关业务构建、真实PG/Source/备份/部署测试。

### 远端状态与恢复

**REMOTE DELIVERY PENDING：尚未创建本任务PR，不能提供虚构链接。** GitHub connector/API可用不等于Git通道长期恢复；按协议不反复尝试同一失败通道，不自动执行恢复命令或切换认证。开放PR查重为#164和#136，均非本任务。待精确Git交付成功后创建唯一PR到main，标题/正文围绕规范和本报告，使用 Refs #165，不使用关闭关键词，不合并。

正常网络与检查条件满足后，仅使用正式脚本，完整ExpectedHead由最终本地提交提供；原工作树和迁移方案不参与交付。一次性人工恢复命令在最终回执中给出，不由本轮自动重试。最终commit/测试/dirty记录以实际工具结果补充。

本轮不改变运行环境，不更新能力标签或旧验收事实。部署不适用。等待用户批准具体UI整改编号、方案版本和范围。
