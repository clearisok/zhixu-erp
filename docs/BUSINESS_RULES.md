# 已确认业务规则

2026-10-19，工程基线 main `996dfedc12da3527343cd3ff2aa5eea35497e10e`。当前订单/价格规则以 D-145 为准；下文注明 Browser/legacy 的规则不自动应用于 Server。[校准前逐字记录](tasks/completed/2026-10-19-pre-stabilization/BUSINESS_RULES.md)保留已替代描述、日期和证据。

## Server收敛与关账币种目标（D-147，2026-10-20）

用户已批准新Server目标从空业务库开始，无历史业务迁移需求；这不授权清空旧环境或证明其无记录。成衣销售产值目标CNY、工价USD分别保存和汇总，不新增自动换汇，不回写已有Quote/PV/CCT、采购来源或历史快照。Server关账尚未实现，其他待决口径保持。#120已于2026-10-23单独批准合并，以下价格/来源校准与本决定并存；两侧原日期说明逐字保留于本次输入归档。见D-147与Gate0。

## 艾诺科货款申请数量与币种（D-136，2026-10-15）

6086941的OutStoreNum为本次申请关联的实际物料出运分配数量，区别于Num采购数量及6087050同名出库字段。数量不同可以合法；Num不逐行相加恢复采购总数。申请采购金额/应付/本次申请金额沿对应采购合同币种，缺少可信合同币种时保持未知。两个精确样本已确认个与人民币/CNY，不据此统一全表单位或币种；RMB只规范为CNY标签，不新增换汇。

缺预付款、审批日期或银行实付证据不能补0或推定已付。只读观察保留原decimal文本与各独立金额，来源id未核实为稳定分录键前不去重或求和；具体人工确认必须绑定精确来源行/版本证据。详见D-136与独立观察模型任务。

## 采购实际量与理论用量（D-114，2026-10-13）

用户确认：实际采购数量以已形成的艾诺科真实采购合同为准，理论用量另行保留，用于理论成本/差异观察；两者不相等不自动视为冲突、错误或浪费。无采购、多次采购和后续修正尚无全局采购执行目标契约，不把所有requiredQuantity/TotalNum换成cgnum。既有正式需求/入库齐套与四流去重规则保持。

只读来源测算 `Num*(1+Lost/100)*StyleNum` 在三个已确认样本中与理论一致；全量字段语义仍未人工验收，候选值明确标为待核实，不参与正式状态。任何来源行缺字段/不一致或单位冲突时不提供统一测算差值。采购原始执行事实与来源需求TotalNum继续分开显示，不把理论差异作为unit conflict。

## 入库多余仓（D-133，2026-10-15）

用户已核对一张入库单：rknum31条之外另有num_dyc1条，同一单位。两项独立展示；多余仓不加进既有入库齐套。num_dyc缺失不是0，不按采购/理论差值推算；按入库事件可信原行一致性读取，不跨物料或单位汇总。样本确认不冒称全量库存验收。

## 当前正式订单与价格（D-121 / D-122 / D-144 / D-145）

合同类只由可信艾诺科合同接纳产生；加工类由一次真实下单批次创建，独立于艾诺科。同报价版本可服务多个批次/订单，合同/批次唯一防重保持。无负责人、认领、转交或合同前翻单准备；新来源仅报价，独立翻单和公开归一写入口已退役，历史保留。后补报价不改创建历史和执行流水。

报价 CCT / 已确认 PV 提供确认依据；每张订单显式采用自己的不可变商业版本，可按颜色绑定同一 Revision 的不同 PriceVersion。所有订单议价在报价中心，不修改 CCT、不新增原报价方案、不换汇或重新算成本。订单中心只首次匹配及只读成交价/历史，不能重存来源覆盖议价。加工订单仅工价，由批次固定来源，不接受成衣议价或报价上下文换绑。

金额权限、CAS、幂等、审计与冻结保持。Server 完整生产排单/关账尚未实现；Browser 历史不迁入。跟单经理角色定义不代表订单有负责人，也不授予测算成本。当前实现见[商业版本](features/ORDER_COMMERCIAL_VERSIONS.md)及[业务来源](features/ORDER_BUSINESS_SOURCE.md)。

## 上线前受控接纳新增合同（D-112，2026-10-13）

用户决定宁波首轮上线前支持受控接纳当前授权账号新出现的艾诺科合同。必须先完整发现、展示选中合同预览、由操作人提供目标与预览指纹明确确认；不可让持续采集自动建单。已有合同在来源中消失或身份冲突时不硬删、不猜测重绑。此流程已进入 main；原阶段的未交付状态保存在历史文档，真实账号和数据库执行需独立范围；旧订单主信息/颜色自动刷新仍不在此范围。[工程范围](tasks/active/ainuoke-controlled-new-contracts.md)。

## 首批团队与金额边界（D-104，2026-10-12）

用户确认宁波首批六角色；艾诺科已授权采集订单/物料/来源采购价对登录团队全可见，织序内部金额按角色。首版矩阵见[权限系统](features/PERMISSIONS.md)；预设读取授权不等于真实Source激活。先合成测试，真实账号以后由用户用管理员创建，不索取/记录真实密码。下方D-103“角色管理尚未实施”是旧工程状态，现由D-104更新，金额规则保持。

## Server 商业金额独立授权（D-103，2026-10-11 用户批准）

- 销售价与确认工价分别由 commercial.sale.view/edit、commercial.labor.view/edit 控制；每项修改需对应查看及修改授权，加上原 Quote/Order 动作权限。Server 管理员默认四项；其他角色不默认授予，不从 Quote 成本或旧动作权限推导。
- 用户最终确认：测算销售单价和系统最终报价同属成衣销售价展示，Server 必须有 `commercial.sale.view`；仅 `quote.cost.view` 可看内部成本，不授予这些结果。仅 sale.view 不授予内部成本；列表 `garmentPrice` 继续同时要求 cost.view + sale.view。销售价减估算成本的派生汇总另需 sale.view，Estimate/成本原权限不取消。无权显示“无权查看”，与未填/null、零不同。授权成本输入可能被用户自行推算，本规则不声称阻止这种数学推导；公式、精度、历史与默认 Browser 行为不变。
- CCT 部分 PATCH 只处理实际提交字段，未提交保留事务内旧值；有权 null 清空、零有效。报价 CCT 与订单采用版本按 D-122/D-145 分离；Quote/CCT CAS、精确 decimal、币种及审计事务不变，不改历史快照。
- 受限字段在当前值、历史、导出、日志和客户端中都不得泄露或假作空值；普通订单数量/颜色/交期/物料进度不因商业金额权限被取消。Quote 内部成本保留既有独立保护。艾诺科采购价格/金额仍为团队共享执行信息，织序不可改写。
- 经销报价确认按两类金额授权，加工确认只需工价授权；CCT 支持单字段修改。Server 角色管理已存在，不能用 Browser mock 权限代替。颜色级成交价由 D-145 承接。

## 宁波首批上线条件（D-105，2026-10-12）

用户明确决定：艾诺科采购、入库、物料出运、出库持续按正式订单展示后，再上线宁波Ubuntu；当前报价暂时OK，暂不做独立库存台账。来源已授权团队全可见含采购价，织序金额继续D-103分角色。
D106接续授权首次订单绑定、调度和既有UI接线的合成工程实现；真实凭据/绑定执行、调度激活、数据库迁移与部署仍须独立授权。首绑只对空订单账本执行明确确认的预览，后续调度只更新来源快照，不自动追加合同或改订单主镜像，不覆盖手工进度或旧账本。详见[Server Source](features/AINUOKE_SERVER_SOURCE.md)。

## 新系统空业务数据上线（D-096）

- 用户确认全部业务数据从空开始，基础资料/业务设置/Quote/订单/排单/关账/款式进度/附件关系/旧账号与 Browser 日志均不导入；原“不自动同步艾诺科补数据”的后续开发范围由D-105更新，不因此授权真实执行或自动建单。
- 不导入不授权删除旧环境。现有业务功能和计算规则不变，后续新 Quote 的历史 Revision 仍不可变。Q5 历史迁移对当前上线 NOT REQUIRED，数据保护、事务、权限、备份继续有效。
- 无业务设置记录表示未配置，禁止自动填旧汇率、加成、运费或生产预设。Server 路径空列表不回退旧 Browser 数据。新远程/多人环境必须有真实认证授权，不能沿用 D-093 无认证模式。

本文件记录用户明确确认的业务规则及可由当前代码、数据库约束或测试确认的规则；未实现目标必须明确标注。根路径 ERP 与 Quote Center 的同名概念有不同口径，未经明确迁移决定不得互相套用。

## Quote Intake V1：用户确认规则（2026-10-10；D-101）

普通电脑端现按 D-102 改为点击即创建并保留有编号草稿，使用可信 PostgreSQL 默认类型/国家/预设；参数快照不回写、无预设待完善、历史保护及下列六项不变。旧两步取消零创建仅为历史交互，见 [QUOTE_CENTER](features/QUOTE_CENTER.md)；手机 Intake/转换和已有报价类型切换仍 NOT IMPLEMENTED。以下业务规则未改变，实现子集不代表全部目标完成。

D-102 第二轮用户确认：制作方案复用 ManufacturingPreset，代表不同工厂/标准，同国可多 ID；默认方案显式选择，国家随选中方案兼容维护，无方案不自动 Seed/选首个。正式 Server 全局设置只管理方案、通用计价及新建默认，不再自动复制不可见的系统其他费用/工序说明；旧字段精确值、已有 Quote/PV/历史费用和工序不清理。品牌/客户业务员自身费用默认、单张报价编辑及默认 Browser 行为保持。

以下六项来自用户本轮明确确认；实现状态与技术建议见 [Quote Intake](features/QUOTE_INTAKE.md) 和 [实施契约](tasks/active/quote-intake-v1-implementation-contract.md)。不得把确认规则等同于已上线能力。

- **QI-01 加工显示与计算**：加工报价突出工价与工序；面辅料编辑默认隐藏，但已有数据、ID、价格、数量、来源不删除或清零。现有公式保持不变，UI 隐藏不排除内部材料成本，包含材料的成衣价格不能标成纯加工报价。D-145 已批准加工对外报价和内部汇总只输出适用工价；旧面辅料及成衣金额事实保留，不写空。
- **QI-02 类型切换**：QuoteType 属于整个 Revision。未发生客户确认时，经明确确认可修改当前可编辑 Revision；任一价格版本已有客户确认时必须创建新 Revision，再切换类型，保留旧历史及确认事实，新 Revision 沿用现有创建规则。必须检查 linked ConfirmedCommercialTerms 与 SalesOrder provenance，不清空共享当前确认，不允许 generic PUT 绕过。
- **QI-03 权限范围**：Intake 默认本人可见；查看或编辑他人记录须明确授权，不按管理员或前端角色名称推断数据范围。收集权限不授予 Quote 成本、正式报价管理或全局设置权限；actor/创建人仅由可信 Server session 派生。
- **QI-04 转换与保留**：V1 每条 Intake 最多转为一张正式 Quote，具有数据库唯一约束、幂等命令与恢复查询；成功后冻结原始资料、保留原图与来源快照。允许重复款号，不以款号/图片 hash 自动合并；正常转换不物理删除原图或来源。
- **QI-05 成衣交期**：目标交期是成衣完成/应交付日期，转换到 `QuoteRevision.baseInfo.garmentLeadDate`；不自动修改 SalesOrder source date、DeliveryPlan、ScheduleAssignment 或其他订单交付事实。空值保留 null，按合法日历日期校验，不因时区偏移一天。
- **QI-06 无预设草稿**：无有效制作预设时允许正式 Quote 草稿，参数待完善；不擅自选国家、预设、汇率、加成或运费。非空 laborCurrency 技术默认值不代表用户选择，必须有真正配置完成的判断契约；旧 Quote/PV 快照、币种、公式不受损。

## Server排单计划候选（D150，2026-10-24）

2026-10-24 G6C候选按[执行契约](features/SERVER_PRODUCTION_EXECUTION.md)扩展独立实际head/history与技术epoch；本单完成登记和明确联动后续重排的双权限、原产出归属/剩余另建及更正原因均依用户已批准规则。不借计划量补造实际，不将本轮候选写成已验收/部署；以下G6B及Browser段落保留其阶段边界。

当前G6B候选以可信合同/已消费加工批次SO为owner，计划量、客户交付需求、未来实际完成及关账量独立；不要求订单负责人或先采用报价金额。稳定颜色、不可变资源事实、单条/订单集合/组队列版本、明确预览及原请求回执保护见[Server排单](features/SERVER_PRODUCTION_PLANNING.md)。只恢复既有页面的Server owner，不挂Browser账本或Seed；尚无真实开工/完成、物流/关账闭环或部署声明。下文Browser规则和历史日期保留，不据同名字段混用权威。

## 新生产计划与排单路径

- 一张 SalesOrder 只允许一个款式，但可直接拥有多个 ScheduleAssignment；ProductionPlan 已退出正式 Runtime。
- 内部 Assignment 必须且只能引用稳定 `productionGroupId`，外发 Assignment 必须且只能引用稳定 `outsourceFactoryId`。停用资料不能用于新排单，历史引用继续显示。
- 订单有效数量、排单数量、完成数量和关账数量是不同事实。订单数量变化不自动调整排单；超排或超完成保留真实值并显示 warning。
- SalesOrder 不保存执行方式、执行方、排单/完成数量或可编辑生产状态。执行模式、生产状态与全部数量摘要由 Production Scheduling Service 统一投影。
- 完成数量减少必须有原因；已开工排单更换执行方、切换内部/外发或取消也必须有原因，并写入唯一 OperationLog。
- DeliveryPlan 是客户交付需求，ScheduleAssignment 是生产安排。多交期风险按日期顺序比较累计需求与预计/实际累计完成量；没有客户交期时不生成虚假风险。
- OrderExecutionTracking 记录面料、辅料、样品、印绣花和短溢装等轻量状态，并通过稳定 SupplyHub ID 分别保存面料/辅料到仓日期；不复制数量、价格、执行方或排单事实。两类物料都到仓后才形成齐套日。
- 平均日产属于款式参考，保存在 `SalesOrder.averageDailyOutput`；按日产量排单时写入 Assignment 快照并推导工作日。工作日模式只把工作日作为权威输入，不反写订单参考日产。
- 内部生产组按可编辑 ProductionCalendar 串行排队；上一款结束日等于下一款交接开始日，但交接日不计入完整生产工作日。实际完成日期不覆盖计划结束日期，自动顺排前必须预览并确认。
- 运输建议由 SupplyHub、SupplyRoute、ProductionSite 与 TransportMode 投影；封样提前期来自 ProductionSite，推荐满足最晚到厂日的最慢可行运输方式，建议不创建物流订单且不修改排期。

## 根路径 ERP

### 角色与权限

- 用户角色限定为 `admin`、`sales`、`planner`、`viewer`。
- 报价写操作允许 `admin`、`sales`。
- 订单状态写操作允许 `admin`、`sales`、`planner`。
- 排单写操作允许 `admin`、`planner`。
- 用户创建和完整用户/审计数据读取属于管理员权限。

### 会话与登录保护

- 登录会话 cookie 为 HttpOnly、SameSite Strict，有效期 12 小时。
- 15 分钟内最多允许 10 次失败尝试；旧失败记录会被清理。

### 报价、订单与排单

- 报价状态限定为 `draft`、`sent`、`accepted`、`rejected`、`expired`、`converted`。
- 根路径 ERP 报价使用 `报价 = 成本 / (1 - 毛利率 / 100)`；这是旧报价模型的公式，不适用于 Quote Center。
- 报价转单会创建订单，并将报价状态改为 `converted`。
- 订单数量必须大于 0。
- 排单结束日期不得早于开始日期，进度为 0–100。
- 同一订单的计划数量总和不能超过订单数量。
- 排单进入 `running` 时，订单进入 `in_production`；全部排单完成时，订单进入 `quality_check`。
- API 中的重要写操作会记录审计日志。

## Quote Center

### 开发数据保护

- DEV `127.0.0.1:3001` 的 Quote/Revision/PriceVersion、Quote provenance 与相关附件是真实业务数据，必须长期保护；刷新、HMR、Server 重启、Build、Docker rebuild、schema 迁移和 Seed 变化不得删除或覆盖。
- 当前 Browser Order Center / Scheduling 被确认为功能测试数据，不作为未来 PostgreSQL migration/bootstrap authority，也不要求正式 PostgreSQL SalesOrder 继承其 ID；但在独立 Test Business Data Retirement Gate 完成完整 backup、dependency audit、精确 delete/protect scope 并取得用户明确破坏性确认前，仍不得读取后清理、修改或删除。Style Progress/Material 不属于该 retirement 范围；Closing retirement status 尚未决定。
- Seed 只在稳定数据和所有已登记旧数据都不存在时执行一次；非空数据空间不得因默认 fixture 变化重新 Seed。
- Quote Center 浏览器 schema 只能向前迁移，不得通过更换 storage key、IndexedDB database name 或 object store name让旧数据不可见。
- 3000 与 3001 是不同 Origin，默认不共享浏览器数据；复制验收数据必须使用显式备份/恢复。
- 自动化测试只使用注入的 test namespace，不得清理或读写 DEV 浏览器数据。

### 历史本地单用户开发身份（D-093，仅显式本机开发）

当前 Server 正式/多人验收使用可信 session；下列 local-single-user 是保留的受限开发模式，不是默认生产账号策略。

- 当前开发阶段的 Server Authority 使用显式 `local-single-user` 身份模式，不要求用户输入织序账号密码或持有 session cookie；其权限集合为完整 `PermissionKey` 目录。该模式不是生产多用户认证模型，不得在未经单独安全评审的公网部署中启用。
- 所有 Server business service 仍通过可信 `TrustedIdentity`、权限键、事务和 OperationLog 边界工作；请求 body/header 不能选择 actor。现有 `app_users` 兼容行只承担审计 FK，不是当前登录账号。Legacy 根路径 ERP 登录不在本规则变更范围。
- Browser Quote aggregate 暂仍由 mock Repository/localStorage 持有；当前 UI 隐藏 mock 测试用户切换和权限管理，相关历史记录与存储不清理。真实多用户认证未来另立 Gate。

### 第一阶段账号与权限（历史 mock 模式；当前 UX 由 D-093 替代）

- Quote Center mock 权限采用 User -> Role -> Permission；业务授权只判断稳定权限键，不判断角色名称。
- 管理员默认拥有完整权限目录。
- 报价员可创建、编辑、导出、确认报价，更新报价版本并创建价格版本；不能删除报价、修改基础设置或管理用户权限。
- 查看员可查看报价、历史版本、报价成本并导出；不能创建、编辑、删除或确认报价，也不能修改估算成本。
- 无权限业务操作保持可见 disabled，并显示“暂无权限，请联系管理员”。
- 权限记录与当前测试账号不进入 Quote、QuoteRevision 或 PriceVersion。
- 当前权限是 localStorage mock RBAC，不构成生产安全边界；未来真实 API 必须服务端重新鉴权。

### 艾诺科个人账号与只读 Direct API

- 正式关系为 `Zhixu User → 0..1 Personal Ainuoke Account`，不使用公司共享账号或管理员高权限账号；当前只实现 browser-local mock identity 下的本地 Windows 原型，不能称为生产级身份隔离。
- Ainuoke password 只存 Windows OS Secure Credential Store；Ainuoke token/session 只按 mock `User.id` 存 Local Bridge 内存，Bridge 重启即失效。二者不得进入浏览器存储、业务实体、备份、OperationLog、console/file log、telemetry、Git 或 committed `.env`。
- Bridge 只绑定 `127.0.0.1`/`::1`，使用精确 Origin allowlist、HttpOnly bridge session 与 CSRF nonce；每次账号/报表请求从 bridge session 取得 user context，不直接信任请求体中的 userId。该机制不能补足当前 mock user 缺少真实认证的限制。
- 个人账号绑定使用 `ainuoke.account.bind_self`；既有 `ainuoke.bind` 仍只表示业务合同绑定。个人绑定不自动授予 sync、合同绑定或 conflict resolution。
- PUT credential 必须先真实测试登录，成功后才能替换旧 credential；失败保留旧值。invalid credential 不循环 retry，network retry 有上限，auth expiry 最多自动重新登录一次并 replay 原 read 一次。
- Direct API 固定只读 Report Catalog 指向 `6086103`、`6086997`、`6087050`、`6087105`。`order_discovery` 使用真实观察到的 6086103 空条件列表并只返回当前账号可见范围；detail query 必须服从固定 typed kind：`empty`、`sales_contract` 或 `inside_order`，不得混用。Browser 不能传任意 reportId/endpoint/fieldName/compareType/condition，Bridge 不提供 Ainuoke write endpoint，也不得直接 create/update SalesOrder 或 upsert Style Progress。
- Formal clean bootstrap 方向为 empty PostgreSQL → Ainuoke discovery → detail reads → 新建正式 PostgreSQL SalesOrder identity。当前账号完整 Discovery Snapshot 中的全部合同均参与 bootstrap candidate 集合，不按 `Status` inclusion/exclusion；raw lifecycle status 仍作为 source fact 保留。每次以当次完整 Snapshot 为准，观察到的 505 不是固定业务常量。账号 visibility 仍仅为 `current_account_visible`；来源消失不得单独触发 SalesOrder hard delete。
- 正式 bootstrap 组织范围已确认为 `current_account_visible`；任何 505、507、511 等数量都只是观察快照，后续必须以 fresh complete Discovery 为准，不得写死。
- 正式 server `order_no` 由 PostgreSQL/server 全局递增生成，格式为 `SO-00000001`、`SO-00000002`……且用户/业务 input 不可提供或编辑；并发不得重复，transaction rollback 允许留 gap 且已消耗编号不得回收。PostgreSQL UUID 仍是真正技术 identity。`SalesContractNo` / `BillNo` 是 Ainuoke SalesOrder 跨报表稳定业务关联键；`InsideOrderNo` 是可变 source attribute，不得作为长期 source identity。相同 BillNo 的 InsideOrderNo 变化不得新建 SalesOrder、改变 PostgreSQL UUID/order_no、解除 source binding、丢失明细或形成 identity conflict，只记录 `inside_order_no_drift` informational reconciliation evidence。
- 正式 SalesOrder 建立后，Ainuoke source 从后续 Discovery 消失时不 hard delete、不自动 cancel、不更换 UUID、不解除 source binding；标记 source missing 并保留历史，source 重新出现后恢复 seen。
- Ainuoke 长期保留 normalized current source mirror、source/discovery hash、fetchedAt/lastSeen/missing 等必要时间和 reconciliation metadata；默认不长期保存完整 raw upstream payload。
- 6087105 是正式 SalesOrder 颜色/分码来源，固定使用 `BillNo contains <SalesContractNo>` 和 `{ salesContractNo }` query context；返回后按规范化 `row.BillNo === requestedSalesContractNo` exact filter。contains false positive 只能计数，不能混入目标合同 projection。6087105 行的 `insideorderno` 可与 6086103 当前 `InsideOrderNo` 不同，此 drift 不使颜色 slice invalid/missing。6086997 保留为 legacy / historical Phase 2B2 color source，不再是正式当前 SalesOrder color source。
- 6087105 的上游 `id` 不是颜色行 identity。颜色行 trace 使用 normalized whole sanitized source row 的 deterministic SHA-256；不得使用 `id`、数组下标、页码、fetchedAt 或随机值作为稳定 line identity。
- 6087105 的 `SizeRule` 按原 CSV 顺序一一映射 `Size1..Size26`，只允许 trim/Unicode normalize，不排序、不删除中间零值、不猜名称。`SizeNum=0` 且所有 SizeN absent/0 是合法颜色行；颜色必须保留。
- 6087105 是颜色 enrichment，不是 SalesOrder existence gate。没有 exact BillNo rows 时状态为 missing；关键颜色行异常时整个颜色 slice fail closed 为 invalid；两种情况都不能阻止 SalesOrder 创建或主 Candidate 存在。`ContractDate`、`DeliveryDate`、`Status` 继续作为 source facts；可记录 `contractAgeDays`，但在用户定义阈值前不得硬编码“新合同缺颜色正常”的天数规则。
- Direct API 形成带 report/page/query/row identity/schema/hash 的 sanitized source snapshot。正式 SalesOrder bootstrap path 使用完整 6086103 Discovery 建立 normalized unique BillNo index，不再依赖逐单 6086103 InsideOrderNo detail；6087105 以 BillNo 读取颜色/分码。6086997 旧 adapter 与现有 Browser unified sync 留作 legacy/historical 行为，Browser 尚未 cutover。6087050 当前只证明 `insideorderno is` transport query；在未独立证明 BillNo fieldName/compareType 前不得猜测迁移。需要物料读取时可由 Discovery 的 SalesContractNo 找到当前 InsideOrderNo 做 transport lookup，但结果 identity 最终仍绑定原 SalesContractNo / SalesOrder UUID。统一层不得复制领域 pipeline 或以一个超级权限替代既有权限。
- 当前同步以 6087050 Direct API 当次 Snapshot 为业务来源；历史 Excel 是时间点历史快照。两者不要求 row-count、snapshot-hash 或 source-row-identity parity，不得为匹配历史 Excel 人为过滤 API 当前数据；共同约束是同字段语义一致并复用唯一 Domain pipeline。API 字段无法由真实 metadata/rows 证明时必须保持 `null`/empty。
- 旧历史排单/生产预警遗留的 unresolved `schedule_match` / `closing_match` 可由用户在完成 DEV Backup 后，以 `ainuoke.resolve_conflict` 显式清理；不得在 load、validator 或 migration 中静默删除。order/data-anomaly/resolved reviews 与全部已导入业务事实必须保留。未来新的排单/生产录入方式仍为 TBD。

### 操作日志

- 正式前端审计类型统一为 `OperationLog`。品牌、客户业务员、系统报价设置和制作预设保存成功后均追加字段级日志；PriceVersion 选择制作预设与全局预设维护必须是不同动作。
- 批量导出日志必须保留全部所选款式的最小业务快照清单及相关 PriceVersion，不得仅记录数量，也不得存入整个 Quote、附件或工作簿 Blob。

- Quote Center 操作日志是独立追加记录，不进入 Quote、QuoteRevision 或 PriceVersion，也不替代 Revision 历史。
- 日志只在报价保存成功后依据上一次已保存快照生成；未保存的输入不产生操作记录。
- 日志记录稳定 `userId` 和操作时的 `userName` 快照，并以 `quoteId` 聚合该报价下的 Revision、PriceVersion、成本和附件行为。
- 新生成的报价日志同时保存 Quote 编号/款号/款式名、Revision ID/名称、PriceVersion ID/名称和具体行项目 ID/名称；展示标题必须能区分具体报价快照与品牌/客户业务员默认资料，旧日志缺少字段时明确标为未记录而不是猜测。
- 当前记录报价创建/保存/删除、报价版本创建/更新/删除、价格版本创建/修改/删除、客户确认、面料/辅料/工价/其他费用修改、图片/文件上传、附件删除、款式图、估算成本、导出、模板和权限管理动作。
- OperationLog repository 只有追加和读取能力；全局页面与报价详情复用同一数据源，不提供编辑、删除或清空。

## 订单、排单与关账共用基础设施

- `ProductionGroup` 和 `OutsourceFactory` 以稳定 `id` 作为身份；名称不是技术主键，也不设置唯一约束。已被业务引用的资料应停用而不是物理删除，当前 UI 因此只提供启用/停用。
- 外发厂联系人、电话和备注仍是基础资料字符串；外发厂与生产执行的关联保存在排单分配，并在关账时形成执行方快照，不反向把订单/排单数组塞入外发厂。
- 默认销售产值税率当前为 `13%`，属于关账设置默认值；创建关账归属时复制当时值，不能让全局设置变化污染已有归属或锁定月份。
- 月度生产目标按 `YYYY-MM` 唯一维护一条，金额口径为人民币；总加工产值目标和内部加工产值目标均可为空，空值不等于 0。
- `OrderType` 为 `processing | distribution`，`ExecutionType` 为 `internal | outsource`，关账期间状态为 `open | confirmed | locked`。
- 订单数量、排单分配数量、实际完成数量与关账数量是四个独立事实，不能互相覆盖；锁定关账后的重新打开必须有 `closing.reopen` 权限和原因。

## 新订单中心

### C4 已确认的正式所有权边界

- C4.3 用户于 2026-10-09 确认：默认计划数量固定为首次 source quantity（允许 0），后续数量变化只提示、不自动重分配；首次无日期不建默认行，后来出现日期也不补建。已有 untouched 默认日期变为 null 时保留 ID/数量，恢复日期仍使用原 ID。人工计划输入保持既有正数规则；同值人工提交也是介入。既有订单无所有权证据不推定 untouched、不 backfill。技术实现见 D-100/0009；只完成隔离工程验证，未真实激活。

- 对 Ainuoke-backed SalesOrder，经真实 report metadata/rows 证明的 Ainuoke 字段是权威 source facts，织序不得直接覆写。需要不同运营/业务值时，必须放入可与 source mirror 区分的 Zhixu-owned 字段或独立 domain。Source drift/conflict 可显式呈现，不得通过改写用户业务值静默解决。该原则覆盖已证明的 BillNo/SalesContractNo、InsideOrderNo、source lifecycle、contract/process delivery date、source quantity、source style/customer/brand/company 和 6087105 color enrichment；未证明字段不得猜测映射。
- Customer PO 属于 Ainuoke source，织序用户不可编辑，它不是唯一订单身份，也不得成为用户维护的替代值。当前 6086103 `QuotationNo` 已证明不是 Customer PO，具体 Direct API source mapping 仍为 **NOT YET PROVEN**；在真实 metadata/rows 证明前，正式 server/UI 值必须保持 null/只读。
- Ainuoke source order quantity 为正式 Ainuoke-backed SalesOrder 的权威数量且不可由织序用户编辑；不建立可编辑的正式商业数量 baseline。Scheduling quantities 是独立事实，order quantity 变化不自动改写 schedule quantities。后续 source quantity 变化可生成 drift/reconciliation evidence，但不授权人工改写 source quantity。
- 订单业务“业务员”指品牌/客户侧业务员，不是织序 authenticated user，不得映射 `app_users`。未来 server 模型可使用 customer/brand personnel master + order-time snapshot，但具体 schema 尚未实现。理单员若是不同业务语义，仍保持 pending，不得默认归入 `app_users`。
- Production country 只属于 Quote / Quote PriceVersion 上下文；正式 server SalesOrder 不增加 `productionCountry`，也不迁移 Browser 同名字段。Scheduling `ProductionSite`/实际执行地是不同业务概念，不得重命名或混同。
- Ainuoke 工艺单/合同交期是只读 source fact。Zhixu `DeliveryPlan` 是可编辑、可展开多行的客户交付要求/计划 domain，修改计划不得改写 source delivery date；详情后续必须将 source date 以弱化的次要文字另行保留。
- Ainuoke SalesOrder 首次创建且存在有效 source delivery date 时，初始化一条同日期的默认 DeliveryPlan。只要用户从未编辑、拆分、新增或其他手工改动整个集合，该 untouched system-derived default 才可跟随后续 source date 变化。一旦发生任何用户介入，整个 DeliveryPlan collection 转为 Zhixu-owned；后续 source refresh 只更新 source fact，不覆写用户计划，差异只通过 drift/reconciliation 显式呈现。具体 flag/列名由后续实现决定，但必须能确定性区分两种所有权状态。
- 原 D-084/D-087 的订单共享当前金额与订单编辑入口由 D-122/D-145 替代：报价确认源与订单实际采用版本分开，报价变化不得覆盖订单。历史原文见本页归档；金额精度、权限和审计保护继续。
- CCT 仍是独立报价确认领域；销售价 CNY、工价 CNY/USD、NULL 与零严格区分。旧订单 CCT 写入口拒绝，新订单价格读取独立商业版本。
- 未闭环范围（不能由已实现的商业版本推定完成）：Customer/Brand master mapping、orderDate 语义、source style 向 Zhixu Style master 的长期关系、超出当前 source/adjustment 规则的颜色人工模型、settlement/pricing basis、execution snapshots、attachments、process/customer requirement/inspection/remark 语义以及 Browser retirement 细节仍为 pending。

- `SalesOrder` 同时是订单身份和单款执行单位；一张 SalesOrder 只允许一个款式。同一客户 PO 可以对应多张不同订单，但订单号 trim + case normalize 后必须唯一。
- 订单来源为 `manual | quote | reorder | ainuoke`。报价生成订单时，Quote/Revision/PriceVersion 来源 ID 直接保存在 SalesOrder；翻单只保存 `sourceOrderId` 并生成新的 SalesOrder 与 P1，`sourceOrderItemId` 已废弃。
- 当前 Browser legacy Quote 转单会选择明确 Revision 和 PriceVersion，并把款式、执行面辅料、工价、币种、汇率、附件引用等形成订单快照。该历史快照不随后续 Quote 修改而回写，执行资料也不携带报价成本、损耗、单耗或利润字段；但这不取消上述两项共享当前商业条款的特例。
- 当前 Browser legacy `SalesOrder` 仍以 `initialQuantity + quantityChanges[]` 计算有效数量，`OrderQuantityChange` 追加保留原因与历史。该实现不得被照搬为正式 Ainuoke-backed SalesOrder 的可编辑商业数量 baseline；数量变化也不自动改写交期或排单数量。
- 客户交付计划是 SalesOrder 下 0..N 条 `DeliveryPlan`，owner 为 `salesOrderId`。不足、匹配和超额只产生提示，不自动分配或重算；对 Ainuoke-backed SalesOrder 还必须遵守上述 derived-default 与 user-managed collection 的所有权切换规则。
- 当前 Browser legacy `OrderPriceVersion.salesOrderId` 直接归属 SalesOrder，`currentPriceVersionId` 是该 Browser 价格历史的权威指针；未来正式共享当前客户确认价格/确认工价不得依赖 Quote 与 Order 各自指针生成两份可漂移值。
- 生产关系为 `SalesOrder → ScheduleAssignment[]`；`ClosingAllocation.salesOrderId` 直接关联订单，`scheduleAssignmentId` 可空且必须保持稳定。
- 当前 Browser legacy 订单价格历史是 append-only `OrderPriceVersion[]`，`currentPriceVersionId` 是该历史的唯一权威指针；调价必须填写原因，指针损坏时拒绝 fallback。该指针不代替链接 Quote/Order 的共享当前商业条款。
- 翻单只继承来源款式当前有效数量、当前价格和执行/附件快照，并以新 P1 开始；不复制来源数量变化、交期或价格历史，也不修改来源订单。
- 确认订单将状态从草稿变为已确认；确认前执行完整性校验。排单与关账摘要都由对应 Service 从独立事实投影，不在 SalesOrder 保存第二套状态。
- 订单附件复用 AttachmentRepository 中的 Blob，只保存附件 ID 引用；订单引用存在时，Quote 侧不得删除底层 Blob。
- 全局操作日志需要 `audit_log.view`；默认只有管理员具备该权限。
- 当前 localStorage 实现不是生产级不可篡改审计存储；未来服务端必须在业务事务成功后由后端追加。
- 订单列表的交期月份筛选读取有效 `DeliveryPlan` 的月份；不得用下单日期或排单月份代替。
- `salesContractNo`、`factoryStyleNo` 与订单来源由正式 source mirror 决定，订单详情只读；Customer PO 同样是 Ainuoke-owned 只读 source，当前映射未证明时保持 null。客户/Brand 的 server master mapping 仍待决；Quote 制作国家不进入正式 SalesOrder。
- 颜色级部分取消以 append-only adjustment 保存，不覆盖来源颜色行。有效颜色数量 = 来源数量 + 该颜色全部 adjustment；艾诺科重同步只能更新来源数量，必须保留人工 adjustment。
- 系统 `defaultProcessingCurrency` 只初始化新建手工订单、新价格调整和新关账记录，当前默认值为 USD；既有订单价格、Quote 快照与 Closing 快照不得随设置变化重算。

## 关账中心

- 一个 `ClosingPeriod` 对应一个 `YYYY-MM` 月份，月份唯一；状态流转为开放、已确认、已锁定。已锁定月份拒绝新增、编辑、作废或同步归属，重新打开必须记录操作者、时间和原因。
- `ClosingAllocation` 直接归属 SalesOrder，可选引用稳定 ScheduleAssignment；没有排单引用的归属计入“待分配”。内部、外发和待分配可在同一订单同一月份并存。
- 关账保存数量、订单类型、销售单价、加工单价/币种、汇率、税率、执行方以及排单依据快照。基础资料、订单或排单以后变化不能静默污染已保存关账。
- 加工产值原币 = `quantity × closingProcessingUnitPrice`；CNY 直接计入 RMB，USD 按 `fxRateSnapshot` 折算。经销订单销售产值 = `quantity × closingSalesUnitPriceSnapshot`；加工订单销售产值按含税加工产值计算。
- 排单的计划量、完成量或执行方发生变化时，开放月份显示 stale；用户只能显式同步快照或确认保留旧快照。确认/锁定阶段不自动同步。
- 同一订单累计关账量小于有效数量为部分关账，等于为已关账，大于为超额关账；warning 不静默截断真实数量。
- 关账权限、搜索、订单摘要、OperationLog 与 Backup/Restore 都读取同一 Closing Repository/Service，不建立第二套财务事实。
- `/closing-center` 是月份总览：月份倒序、按年分组，并可按开放中、已确认、已锁定筛选；`/closing-center/detail?month=YYYY-MM` 是月份详情，路由月份决定订单行、KPI、筛选与动作。
- `confirmed` 与 `locked` 是不同业务状态，不得合并。已确认仍可取消确认或进入锁定；已锁定拒绝普通 mutation，只有 `closing.reopen` 权限且填写原因后才能重开。
- 关账详情必须并列显示订单数量、已排、已生产、本月关账与累计关账；已生产来自 ScheduleAssignment Projection，不得用已排或关账数量替代。

### 全局搜索

- 全局搜索当前接入 Quote、Order、Schedule 与 Closing Provider；关账搜索字段包括月份、订单号、款号、款名、客户和执行方。
- 报价号保留为内部搜索字段，但搜索结果和最近访问不主动展示报价号。
- 报价搜索必须经过 `quote.view` 权限；无权限时不得查询 QuoteRepository，也不得从最近访问泄露旧结果。
- 搜索结果只包含报价列表级身份和导航信息，不包含面辅料、工价、其他费用、估算成本或确认价格。
- 搜索结果导航继续经过 AppShell 导航回调；当前报价有未保存修改时不得绕过 dirty guard。
- 最近访问按 `userId` 隔离，只保存非敏感结果投影，不复制 Quote 或 Revision。
- Quote Center 普通搜索把空格分隔 token 按 AND 组合；以 `/` 开头的结构化条件也按 AND 组合，并可与普通 token 同时使用。
- `/制作国家` 必须扫描 Quote 下各 PriceVersion 的制作国家快照，不得只读取 Revision 或当前活动版本。

### Revision 与 PriceVersion

- Revision 是一整张报价的完整历史快照，包括基础信息、报价参数、所有 PriceVersion、成本明细和确认摘要。
- PriceVersion 是同一 Revision 内并列的价格口径，拥有自己的名称、数量、面辅料成本、工价、其他费用和客户确认。
- 当前默认 Revision 可编辑；历史 Revision 只读。
- 创建新 Revision 时深复制来源快照、清除客户确认，并用 `defaultRevisionId` 指向新默认版本。
- `currentRevisionId` 仅作为旧数据兼容字段，不是新的权威指针。
- 最后一条 PriceVersion 不允许删除。
- 复制/创建 PriceVersion 会为成本行生成新 ID，并清除复制来的客户确认。
- 总数量内部为各 PriceVersion 数量之和；当全部数量为空时，总数量保持空而不是 0。

### 报价识别展示

- 新 runtime Server Quote 的技术 ID、初始 Revision/PriceVersion ID 均由 Server 生成；业务编号也仅由 Server 生成，Browser/API caller 不得提供或修改。编号创建后 immutable 且数据库 exact unique。
- Server Quote 编号格式固定为 `QT-YYYY-MMDD-NNN`：日期来自 Server creation instant 的 `Asia/Shanghai` 日历日期；数字后缀来自一个 Quote Center 全局 BIGINT sequence，永不按日重置，至少三位、超过 999 自然扩展。失败/rollback 可留下永久 gap，已消费号码不得回收。
- 历史 Browser Quote 的未来 Q5 import 必须原样保留现有 ID 与 `quoteCode`；import 前发现 duplicate legacy `quoteCode` 必须 fail closed，不能重编号、加后缀或静默去重。import 后按最大合法 suffix 校准 sequence，runtime candidate 已占用时跳到下一 sequence 值，不改历史行。
- D-094：Q5 historical Server projection 清空旧 QuoteRevision 附件 ID 关系 `imageAttachmentIds=[]`、`fileAttachmentIds=[]`、`styleImageAttachmentId=null`，并清空旧 URL 兼容字段 `garmentMedia=[]`、`quoteDocuments=[]`；Preview 保留源引用计数与受影响范围。原 Browser Quote、标准备份和 IndexedDB blob 不因此修改或删除；Q4B 共享历史附件改名规则仍待单独确认。
- `Quote.quoteCode` 保留在模型、repository、搜索、日志、调试与导出 filename fallback 中，不删除或改作款号。
- 常规报价详情标题、Sticky 摘要、全局搜索/最近访问卡片和移动报价卡以款号、款式名称和报价版本识别，不主动展示 `quoteCode`。
- 报价中心“报价编号”仍是可配置列；新用户默认隐藏，已有用户个人列偏好不被强制覆盖。

### 计算与空值

- 面料单耗公式不变；kg 与 meter 的原始结果统一按第五位四舍五入为四位正式业务值（例如 `0.7263827 → 0.7264`）。面料成本、UI 和 Excel 必须消费同一个四位值，不能出现“显示四位、计算更多位”的双轨口径。

- 空值与用户明确输入的 0 不等价；展示层不得把未填写成本显示为 `¥0.00`。
- 辅料及通用成本行：`用量 × 单价 × (1 + 损耗率 / 100)`。
- 面料毛门幅为 `净门幅 + 5cm`。
- 千克采购单耗：`段长(cm) × (净门幅 + 5) × 克重 / 10,000,000 × (1 + 损耗率 / 100)`。
- 米采购单耗：`段长(cm) / 100 × (1 + 损耗率 / 100)`。
- 面料成本：`单耗 × 单价`。
- USD 工价按当前 PriceVersion 快照中的 USD/CNY 汇率与固定折算系数 `1.13` 换算为 CNY：`USD 工价 × 汇率 × 1.13`；固定系数不等于、也不得替换为 `1 + markupRate`。
- CNY 工价直接使用用户录入的人民币值，不经过汇率或 USD 固定折算系数。
- Quote Center 加成口径为 `成本 × (1 + markupRate / 100)`，不得替换成根路径 ERP 的毛利率公式。
- 内部计算保留原始精度；面向用户的成衣销售单价/最终报价统一截断保留一位小数，不四舍五入，例如 `41.25 -> 41.2`。

### 制作国家与报价预设

- 制作预设（正式 UI 称“制作方案”）是系统级可维护配置，至少包含名称、制作国家、加工币种、成本加成率、是否带运费、运费名称和可空金额；名称可代表工厂/标准，同国多套且按独立 ID 选择。Browser 历史 Seed 有中国/柬埔寨示例，正式 Server 空库不自动创建这些方案。
- `defaultManufacturingPresetId` 只能为空或引用当前 active 制作预设。停用当前 default 必须由 Server 在同一 transaction 自动清空默认关系；重新启用只恢复可选状态，绝不自动恢复 default，必须由用户显式重新选择。默认解析与新 Quote 初始化遇到 inactive reference 时一律按无默认预设处理。
- 每个 PriceVersion 独立保存预设 ID、预设名称、制作国家、加工币种、USD/CNY 汇率、`markupRate` 与运费策略的完整报价参数快照；同一 Revision 的不同 PriceVersion 可以采用不同制作口径。
- 应用预设只更新当前 PriceVersion 及其预设专属运费行，不得修改其他 PriceVersion，也不得删除人工费用或其他来源的全局费用。
- 报价详情只允许为当前 PriceVersion 选择/重新应用制作预设，国家、币种、加成率和运费规则只读；预设内容只能在系统设置维护。系统预设后续变化不得污染已有 PriceVersion 或历史 QuoteRevision。

### 保存、确认与删除

- 新建报价页面必须保持 Lazy Create；仅打开页面不创建记录。隔离 Server 新建页也只有用户明确点击后才调用 runtime POST。
- Production Browser Quote 保存当前仍使用 mock repository/localStorage；Q2B2B 的隔离 Server 新建/编辑工作区写 PostgreSQL，但不构成 production cutover。
- 客户确认属于单个 PriceVersion，保存报价值和确认值快照。
- 确认状态可汇总为报价中、部分确认、已确认。
- 当前 mock repository 可以硬删除报价，但接口已预留 soft delete 语义；不要把硬删除行为推断为未来后端规则。

### 全局费用和个人视图

- System、Brand、CustomerSalesperson 每个作用域最多保存一个 nullable `DefaultOtherCost`；非空默认只包含业务名称和 nullable 金额，不拥有启用状态、备注或 Quote 行身份。
- 默认费用优先级在 Browser 兼容路径为 CustomerSalesperson > Brand > System；D-102 第二轮正式 Server 只使用 CustomerSalesperson > Brand，不再自动套用隐藏系统费用。应用时复制独立 `OtherCostLine` 快照，后续变化不得回写已有 Quote。
- 单张 Quote 的 `OtherCostLine` 仍允许 0..N 条；历史 Quote 已保存的多条明细必须原样保留。
- 旧版 0..N 全局费用只作为 legacy migration source，兼容投影只取首条 enabled 且 name 或 amount 有效的记录作为新 `DefaultOtherCost`。
- 报价列表字段偏好按 `userId` 隔离，不是系统唯一全局配置。
- 全局工序说明旧字段为一个字符串；Browser 兼容路径未来新报价继承，正式 Server 按 D-102 第二轮不再自动继承。单据级说明编辑保留；旧值和历史 Revision 永不删除或修改。

### 估算成本

- EstimateCost 是 Quote 级、基于一个 QuoteRevision 的内部快照，不属于 PriceVersion，也不在创建 Quote 时预生成。
- 同一 Quote 同时最多一个 active EstimateCost；重新生成会归档当前 active，历史记录只读。
- EstimateCost 固定复制来源 Revision 的成本结构，允许调整既有值但不允许增删成本行，且不得反向修改 QuoteRevision。
- stale 判断只比较 `basedOnRevisionId` 与 `defaultRevisionId`；忽略记录只对当时的默认 Revision 生效。
- 恢复历史通过 Clone 生成新的 active EstimateCost，原历史不变并保留其原始 `basedOnRevisionId`。
- 客户报价模板和客户报价导出模型禁止包含任何 EstimateCost 数据；内部报价汇总表可以由用户显式选择估算字段。

### 模板与批量导出

- 用户上传的 Excel 模板形成新版本，不覆盖内置模板或历史版本；当前默认模板失败时回退仓库正式模板。
- 客户报价占位符使用 `{{namespace.field}}`；动态成本行按 placeholder 识别，不以固定行号为业务契约。
- 批量报价单对每张 Quote 使用 `defaultRevisionId`，一个 Quote 一个 xlsx，最终打包为 ZIP；失败项必须明确列出。
- 报价汇总表复用 Quote Center 的单一列定义与当前个人可见列；每款模式使用 aggregate/range，每 PriceVersion 模式读取对应版本自身数据。

### 附件

- QuoteRevision 保存图片附件 ID、文件附件 ID 和款式图附件 ID；附件不属于 PriceVersion。
- 款式图只是当前 Revision 某张图片的引用，不复制二进制文件。
- 第一张成功上传的图片在款式图为空时自动成为款式图，后续图片不自动覆盖。
- 可编辑 Revision 中的 IndexedDB 图片附件允许修改显示文件名；重命名保留附件 ID、Blob、MIME 和原扩展名，刷新后从 AttachmentRepository 读取新名称，历史只读 Revision 不提供重命名入口。
- 新 Revision 复制附件引用数组，但不复制底层 Blob；新版本新增附件不影响旧版本。
- 历史 Revision 只能查看、切换预览和下载，不能上传、删除或修改款式图。
- 删除当前款式图需要二次确认，确认后 `styleImageAttachmentId` 置空。
- 普通文件只允许下载，不提供 PDF、Word、Excel 在线预览。
- 图片/文件二进制存入 IndexedDB，现有 localStorage/sessionStorage 只保存业务结构和附件 ID，不得保存 Base64 大文件。
- 批量粘贴或拖放图片必须先进入待确认列表；取消不产生附件记录，确认后才批量保存。若本批保存中途失败，应补偿清理本批已写入项并允许用户重试。

### 正式 Excel 报价

- 每个 PriceVersion Sheet 独立读取自己的制作预设快照；制作国家标题、加工币种、加成率和加工费结果不得被 Revision 级或实时全局设置覆盖。
- Excel 面料单耗单元格写入已规范的 number，数值格式固定为 `0.0000`；动态插入行和历史 Revision 导出遵守同一规则。

- 一个 Quote Revision 导出为一个 Workbook；每个被选中的 PriceVersion 导出为独立 Sheet。
- 历史 Revision 必须从该 Revision 快照导出，不得混入当前 Revision 或当前页面的编辑值。
- 有未保存修改时不得静默导出为“最新”；用户必须明确选择导出已保存版本或保存并导出。新建报价必须先保存。
- 面料、辅料、加工费、外协和其他费用区域均允许按实际条数扩展；空值保持空白，明确输入 0 才导出 0。
- 导出的成本、小计和报价结果使用 Quote Center 现有计算口径；成衣销售单价数值和 `FOB RMB x.x` 最终报价均使用共享的一位小数截断规则。
- 款式图只引用当前 Revision 的 `styleImageAttachmentId`，不建立第二套图片文件。
- 加工币种为 CNY 时，Excel 的 RMB/件写原始 CNY 工价且 USD/件留空；加工币种为 USD 时，RMB/件复用系统已计算的人民币工价，USD/件写原始 USD 工价，导出层不得再次乘汇率。

## 基础设置

- Brand 使用稳定 `id`，名称经 NFKC、首尾 trim 和大小写归一化后全系统唯一。
- CustomerSalesperson 使用稳定 `id`，姓名按同样规则全系统唯一，并通过 `brandId` 归属一个 Brand；Brand 与 CustomerSalesperson 为 1:N。
- 报价选择品牌后，只能选择归属该品牌的启用客户业务员；切换品牌不能保留不属于新品牌的业务员。
- 面料名称和辅料名称不唯一；`libraryItem.id` 才是身份依据，同名不同供应商记录允许共存。
- 供应商当前是字符串，不是独立主数据；建议从面料库和辅料库历史供应商去重生成，并允许自由输入。
- DefaultTrimConfig 只引用 `trimLibraryItemId`，可覆盖损耗率和单价，不保存本次报价的数量/用量。
- 默认汇率优先级：CustomerSalesperson > Brand > System。费用在 Browser 兼容路径相同；D-102 第二轮正式 Server 不再回退隐藏 System 费用，仍保留 CustomerSalesperson > Brand。
- 默认辅料：业务员配置非空时使用整套业务员配置，否则使用品牌配置；两套不自动合并。
- 非空默认其他费用必须包含业务名称，金额可为 `null` 或明确的数值；`null` 与 `0` 不得混同。
- 默认辅料应用到报价时读取库记录、应用 override、深复制为新成本行并分配新 `row.id`；用量保持 `null`。
- 修改报价成本行不得回写库；之后修改库也不得污染既有 Quote Revision 快照。
- 删除辅料库记录时，相关品牌/客户业务员默认辅料引用一并清理。

## 设置导航归属

- 基础设置只承载业务主数据：品牌、客户业务员、面料库和辅料库。
- 系统设置承载系统级配置：报价设置、模板设置、用户权限和操作日志；模板/权限旧 URL 可继续保留，导航归属以系统设置为准。

## 表单交互

- 局部 Modal/Form 使用 HTML form 提交语义；单行输入 Enter 可提交主操作。
- Textarea 普通 Enter 换行，Ctrl/Cmd+Enter 可提交。
- 下拉选择打开、日期选择打开或中文 IME composing 时，Enter 不提交外层表单。
- 正在提交时禁止重复提交。
- 整页报价编辑普通 Enter 不保存整张报价。

## 业务工作台显示与个人布局

- 主业务表格不得把横向滚动作为正常操作方式；优先使用字段组合、信息层级、合理换行、用户列宽/顺序、侧栏折叠、viewport fit 与窄屏 Record/Card。
- 正式业务 `DataTable` 必须允许用户调整列宽与字段顺序；Preference 按 `User + Table` 保存，不得写入业务实体。
- Desktop Sidebar 必须允许用户主动折叠/展开并按用户保存；Tablet/Mobile 继续使用既有 Drawer 导航。
- Production Group Selector 在桌面主滚动中保持位于顶栏下方，不建立自己的纵向滚动容器。
- 正式 Ainuoke Order 的来源数量与合同交期是权威事实，普通订单详情不得提供人工覆盖入口；历史 Domain 与审计记录继续保留。
- 页面正常状态下，同一业务事实只保留一个主要展示位置；Header 承担对象身份，Summary 只展示需要判断的 Projection。
# 款式进度与面辅料跟进

- 款式进度只按 `salesContractNo` 投影正式 SalesOrder；禁止使用款号、工厂款号、品牌或数量做模糊绑定，禁止由 Style Progress 创建订单。
- 销售合同与成衣分色分码是订单/颜色高权威来源；《面辅料申购统计》是可纠正的 Material Follow-up Source，不得反向覆盖订单品牌、款号、数量或合同交期。
- MaterialDemand 与 Purchase / Inbound / Shipment / Outbound Event 分离并分别去重；禁止对笛卡尔展开的 raw required/purchase 直接求和。
- 普通页面按 Canonical Material Group 展示真实物料，`materialCode` 只作为来源身份进入 Trace。同一销售合同、同一 `materialType` 内，面料和辅料都只按标准化物料名称形成顶层 Canonical identity；编码、颜色、规格、门幅、克重、采购价、供应商和采购单号均保留为组内 Variant / Demand / Event 事实，不参与顶层分组。不同计量单位如有确定性来源必须分口径汇总；缺可信单位时不得猜测、平均或制造统一口径。2026-10-13 用户转述 IT 确认 6087050 `QtyUnit` 对每条需求的 `TotalNum`、`cgnum` 与四流同口径；只读映射只在该需求全部来源行单位一致非空时展示，冲突阻断该需求的投影汇总。历史 Excel 单位仍待独立证明。
- `sourceMaterialDueDate` 是只读 Source；Effective 正式表示“预计到达已持久化 SupplyHub 的日期”，由 `MaterialExpectedArrivalBatch.expectedArrivalAtHubDate` 表达；累计入库数量与达到需求的入库日是 Actual。人工计划 Batch 不强制绑定 Purchase / Inbound / Shipment / Outbound Event，Actual 不能由人工 Effective 覆盖。
- 一个 Canonical Material 可有多个 Expected Arrival Batch；Allocation 必须引用稳定 `materialDemandId`、数量大于 0，同一 Demand 可拆入多批，累计不得超过需求。部分安排合法并显示未安排数量，系统不得自动补齐。人工 Batch 在重导入时保留；只有“恢复使用来源计划”后才重新跟随 Source。
- `提供方式=厂供` 保留 Raw Snapshot 与 Source Trace，但退出采购跟进、未采购、待入库、齐套分子/分母、风险、物流推荐与 Expected Arrival Batch。厂供不能因缺 PurchaseEvent 显示“未采购”。Excel 中名为“厂供”的数值列仍只映射 `actualConsumption`；它与“提供方式”是两个不同字段。
- Purchase / Inbound / Shipment / Outbound 数量分别累计对应 Event；“出运”只能累计 `ShipmentEvent.quantity`，不得用采购、入库或出库数量替代。采购不足显示“采购不足 X”，采购超出显示“采购余量 X”，不得输出负的“未采购数量”。
- 单物料齐套只在累计入库量达到需求量时成立；款式齐套按物料项计数，不跨单位加权。
- 面料按实际用量（无实际时按计划用量）降序并以源行稳定打平；辅料严格按源行顺序。
- 每个 Expected Arrival Batch 独立复用 `material-logistics-service.ts`；无排单显示“待排单后计算”，未持久化的 SupplyHub 必须显示“集货仓未设置”，不得由首个启用仓、名称或唯一路线推断。只有 Hub + Site 均确定后才按稳定 ID 查路线，并在可按时到厂的方式中选择最慢者。
- “距上线”是 `plannedProductionStartDate - expectedArrivalAtHubDate` 的自然日差，只作直观信息；运输缓冲是 `latestRequiredArrivalDate - expectedFactoryArrivalDate` 的正式风险事实。`bufferDays > 7` 为绿色，`0..7` 为黄色，`< 0` 为红色并显示晚到天数；两者不得混用。
- Expected Arrival Batch 的创建、日期修改、增删、Allocation 调整与恢复 Source 必须写唯一追加式 OperationLog；ImportBatch / Raw Snapshot 只作技术 Trace。
- 生产排单的物料状态直接消费 Style Progress Projection，不再维护第二套手工物料日期；UI 对生产执行承诺统一使用“拟定交期”。


## 来源异常处置补充（2026-10-14，D-116）
- 两次真实采购各自有效及已付款，即使数量相同，也保留不同采购事件；理论用量与实际采购独立，重复采购不增加理论需求。不推断第一批采购可以用于生产。
- 有名称的颜色行保留；按D-117最新用户决定，总量及所有尺码数量均空时织序暂记0并标待确认，来源空值保留；仅颜色名、总数量及所有尺码数量均空的占位行从颜色业务投影排除，原始来源证据仍保留。显式0、负数或非法值不能按空白排除。
- 单位冲突只有在单位语义/换算得到可靠确认后才能处理；不自动建立“只/个”别名。真实写入/激活仍需目标明确的独立授权。

- 本轮用户进一步确认指定标签批次“只/个”严格1:1；仅该范围可形成受控映射，不推广到其他物料，不改写原始单位，不等同生产可用性。

2026-10-15 D134：面料/辅料的展示排序不是数量汇总。团队关键词维护限管理员/物控，按第一个包含关键词优先，其余保持来源顺序；事件仍逐需求保留，不以卡片分组跨单位加总。未接通的货款申请明细不能展示为已付款。




用户批准分阶段实施：报价为唯一新业务来源，历史翻单保留；报价中心操作指定订单的成衣成交价，订单商业版本独立且不可变，不修改报价CCT或原价格方案。加工仅工价，合同/批次创建身份保持。当前Phase1已统一确认来源：已有CCT（含空值）优先，否则可信保存PV确认；订单关联不决定金额权威。后续颜色映射/议价/加工UI仍待实施，见tasks/active/quote-order-price-coordination-2026-10-17.md。


## D149可信订单创建报价参考（2026-10-24本地候选）

可信合同订单首次维护来源可明确创建经销报价草稿；使用稳定SO和保存合同身份，只预填可证明字段，品牌/人员不猜ID。
创建参考与报价、actor/request、审计同事务且不可变，不是商业采用，不改SO/Source/执行事实或价格。
报价可继续服务其他订单；完成/取消、已采用、历史alias及加工订单不能经此换绑。普通D102默认创建保持，
未知结果只核对原receipt，刷新不自动写入；当前实现/验收见本轮G5任务，真实激活另有授权。

2026-10-24 D147/G6D当前候选的集货仓/运输方案复用同一Server资源命令，完整方式稳定身份与启用父关系/活跃hub-site唯一保护见[物流资料](features/SERVER_LOGISTICS_RESOURCES.md)。只维护基础资料，不产生物流订单、到仓事实或修改生产排期；历史Browser段落不因接线而改owner。

2026-10-24 D054/D147当前Server后台候选将物理SO明确选择的SupplyHub与备注独立持久化，未记录null、无变化不造版本；发生时仓快照与当前主数据分开，原计划/实际数量/商业信息保持。详见[订单物流上下文](features/SERVER_ORDER_LOGISTICS_CONTEXT.md)，页面与逐物料到仓后续独立接线，不据此宣称完整物流闭环。

2026-10-24 D054/D147当前候选在既有生产页“物料与运输”对话框接通独立Server tracking：明确仓/备注、预览和历史，共用原production命令与未决槽；无默认仓或到仓/数量/金额推断。只读/冻结展示已存事实，未保存草稿与迟到异步隔离见[界面契约](features/SERVER_ORDER_LOGISTICS_DIALOG.md)。

2026-10-24 D054/D065–069/D147当前Server人工ExpectedArrivalBatch/Allocation独立保存物理SO和Canonical物料内多批日期/精确数量、稳定需求身份及发生时Source/Hub证据；不猜配四流、不换单位、不补齐、不过写来源/实际/排单/金额。后台契约见[Server预计到仓](features/SERVER_MATERIAL_ARRIVALS.md)，页面和唯一逐批物流算法接线后续独立。

2026-10-24 D054/D065–069/D147当前Server物料页按独立人工计划owner接线原分批Modal和历史Drawer；每批依最早未取消排单采用地点与已存Hub复用唯一物流算法。Source日期、人工计划、Actual分离；source失败保留计划/历史，命令原请求恢复不自动POST，权限白名单/owner保护见[当前UI契约](features/SERVER_MATERIAL_ARRIVAL_UI.md)。当前工程验收独立记录，不据源码接线宣称部署或用户接受。

## Server成衣出货观察（D152/D153，2026-10-24前移）

6086979 Num与outdate分别为逐笔数量与业务日期；其他日期/累计列独立，缺失/非法/零/负值不混同。当前0040不可变指定合同观察复用可信合同和稳定颜色，不跨次累加、不将消失作取消、不写生产完成/价格/收入或关账。默认关闭的独立target不代表真实采集/激活；完整边界见[Server成衣观察](features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)。本轮工程结果待按精确source验证，原b652结果不借用。

2026-10-24 D083/D100/D147合同来源更新先核既有可信合同及DB目标的完整证据预览，明确原请求命令；既有身份不变，缺失/非法/空颜色不清旧来源。人工计划/独立价格/生产完成保留，历史原owner不搬移。0041离线工具不采集/绑定或激活；[当前实现契约](features/SALES_ORDER_PERSISTENCE.md)按新source另验，不扩大真实执行许可。
