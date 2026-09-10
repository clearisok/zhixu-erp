# 已确认业务规则

本文件只记录可由当前代码、数据库约束或测试确认的规则。根路径 ERP 与 Quote Center 的同名概念有不同口径，未经明确迁移决定不得互相套用。

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

### 第一阶段账号与权限

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
- Direct API 固定只读 Report Catalog 只指向 `6086103`、`6086997`、`6087050`。`order_discovery` 使用真实观察到的 6086103 空条件列表并只返回当前账号可见范围；detail keys 仍要求非空 InsideOrderNo。Browser 不能传任意 reportId/endpoint/condition，Bridge 不提供 Ainuoke write endpoint，也不得直接 create/update SalesOrder 或 upsert Style Progress。
- Formal clean bootstrap 方向为 empty PostgreSQL → Ainuoke discovery → detail reads → 新建正式 PostgreSQL SalesOrder identity。Discovery 必须保留 raw lifecycle status；正式 effective-status 规则与账号 visibility scope 需用户决定。来源消失不得单独触发 SalesOrder hard delete。
- Direct API 形成带 report/page/query/row identity/schema/hash 的 sanitized source snapshot。6086103/6086997 只可经 common Contract Source 进入既有 `AinuokeContractMirror` 与 `synchronizeAinuokeContracts`；6087050 只可经薄 API adapter 进入 Excel 共用的 Material Normalize → Dedup → Validate → Preview → 既有 `commitImport`。日常入口按 InsideOrderNo 一次读取三报表并形成统一 Preview；只有用户明确确认，且合同变化拥有 `ainuoke.sync`、物料变化拥有 `style_progress.import`，才分别调用既有领域提交。统一层不得复制领域 pipeline 或以一个超级权限替代两项权限。
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

- `SalesOrder` 同时是订单身份和单款执行单位；一张 SalesOrder 只允许一个款式。同一客户 PO 可以对应多张不同订单，但订单号 trim + case normalize 后必须唯一。
- 订单来源为 `manual | quote | reorder`。报价生成订单时，Quote/Revision/PriceVersion 来源 ID 直接保存在 SalesOrder；翻单只保存 `sourceOrderId` 并生成新的 SalesOrder 与 P1，`sourceOrderItemId` 已废弃。
- Quote 转单选择明确 Revision 和 PriceVersion，并把款式、执行面辅料、工价、币种、汇率、附件引用等形成订单快照。后续 Quote 修改不得回写订单；执行资料不得携带报价成本、损耗、单耗或利润字段。
- SalesOrder 有效数量以 `initialQuantity + quantityChanges[]` 计算。`OrderQuantityChange.salesOrderId` 直接归属订单，数量变更追加保存，部分/全部取消必须保留原因与历史；数量变化不会自动改写交期。
- 客户交期是 SalesOrder 下 0..N 条 `DeliveryPlan`，owner 为 `salesOrderId`。不足、匹配和超额只产生提示，不自动分配或重算。
- `OrderPriceVersion.salesOrderId` 直接归属 SalesOrder；`SalesOrder.currentPriceVersionId` 是当前成交价格的唯一权威指针，不得按数组位置、版本号或时间推断。
- 生产关系为 `SalesOrder → ScheduleAssignment[]`；`ClosingAllocation.salesOrderId` 直接关联订单，`scheduleAssignmentId` 可空且必须保持稳定。
- 订单价格历史是 append-only `OrderPriceVersion[]`，`currentPriceVersionId` 是唯一权威指针；调价必须填写原因，指针损坏时拒绝 fallback。
- 翻单只继承来源款式当前有效数量、当前价格和执行/附件快照，并以新 P1 开始；不复制来源数量变化、交期或价格历史，也不修改来源订单。
- 确认订单将状态从草稿变为已确认；确认前执行完整性校验。排单与关账摘要都由对应 Service 从独立事实投影，不在 SalesOrder 保存第二套状态。
- 订单附件复用 AttachmentRepository 中的 Blob，只保存附件 ID 引用；订单引用存在时，Quote 侧不得删除底层 Blob。
- 全局操作日志需要 `audit_log.view`；默认只有管理员具备该权限。
- 当前 localStorage 实现不是生产级不可篡改审计存储；未来服务端必须在业务事务成功后由后端追加。
- 订单列表的交期月份筛选读取有效 `DeliveryPlan` 的月份；不得用下单日期或排单月份代替。
- `salesContractNo`、`factoryStyleNo` 与订单来源由正式来源快照决定，订单详情只读；客户 PO、客户和制作国家不在日常编辑区重复维护。
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

- 制作预设是系统级可维护配置，至少包含名称、制作国家、加工币种、成本加成率、是否带运费、运费名称和可空金额；当前 Seed 提供“中国制作（CNY、13%、无运费）”和“柬埔寨制作（USD、5%、带运费）”。
- 每个 PriceVersion 独立保存预设 ID、预设名称、制作国家、加工币种、USD/CNY 汇率、`markupRate` 与运费策略的完整报价参数快照；同一 Revision 的不同 PriceVersion 可以采用不同制作口径。
- 应用预设只更新当前 PriceVersion 及其预设专属运费行，不得修改其他 PriceVersion，也不得删除人工费用或其他来源的全局费用。
- 报价详情只允许为当前 PriceVersion 选择/重新应用制作预设，国家、币种、加成率和运费规则只读；预设内容只能在系统设置维护。系统预设后续变化不得污染已有 PriceVersion 或历史 QuoteRevision。

### 保存、确认与删除

- 新建报价在未保存前只存在于内存；直接返回不创建报价记录。
- 当前保存使用 mock repository，并不写入 PostgreSQL。
- 客户确认属于单个 PriceVersion，保存报价值和确认值快照。
- 确认状态可汇总为报价中、部分确认、已确认。
- 当前 mock repository 可以硬删除报价，但接口已预留 soft delete 语义；不要把硬删除行为推断为未来后端规则。

### 全局费用和个人视图

- 全局费用允许 0..N 条，包含名称、金额、启用状态和备注。
- 启用的全局费用应用到当前默认 Revision 的全部 PriceVersion；以 `globalSettingId` 防止重复。
- 用户已覆盖的全局费用行保留覆盖状态；停用或删除设置时，未覆盖的对应行可被移除。
- 报价列表字段偏好按 `userId` 隔离，不是系统唯一全局配置。
- 全局工序说明为一个字符串；未来新报价继承。同步当前默认 Revision 时，若当前说明已单独修改，必须由用户选择保留、应用新说明或取消；历史 Revision 永不修改。

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
- 默认汇率和默认其他费用优先级：CustomerSalesperson > Brand > System。
- 默认辅料：业务员配置非空时使用整套业务员配置，否则使用品牌配置；两套不自动合并。
- 默认其他费用必须包含业务名称和金额，不能只存无语义数字。
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
- 普通页面按 Canonical Material Group 展示真实物料，`materialCode` 只作为来源身份进入 Trace。同一销售合同、同一 `materialType` 内，面料和辅料都只按标准化物料名称形成顶层 Canonical identity；编码、颜色、规格、门幅、克重、采购价、供应商和采购单号均保留为组内 Variant / Demand / Event 事实，不参与顶层分组。不同计量单位如有确定性来源必须分口径汇总；当前来源没有可靠单位字段时不得猜测、平均或制造统一口径。
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
