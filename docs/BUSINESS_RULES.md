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

- 对 Ainuoke-backed SalesOrder，经真实 report metadata/rows 证明的 Ainuoke 字段是权威 source facts，织序不得直接覆写。需要不同运营/业务值时，必须放入可与 source mirror 区分的 Zhixu-owned 字段或独立 domain。Source drift/conflict 可显式呈现，不得通过改写用户业务值静默解决。该原则覆盖已证明的 BillNo/SalesContractNo、InsideOrderNo、source lifecycle、contract/process delivery date、source quantity、source style/customer/brand/company 和 6087105 color enrichment；未证明字段不得猜测映射。
- Customer PO 属于 Ainuoke source，织序用户不可编辑，它不是唯一订单身份，也不得成为用户维护的替代值。当前 6086103 `QuotationNo` 已证明不是 Customer PO，具体 Direct API source mapping 仍为 **NOT YET PROVEN**；在真实 metadata/rows 证明前，正式 server/UI 值必须保持 null/只读。
- Ainuoke source order quantity 为正式 Ainuoke-backed SalesOrder 的权威数量且不可由织序用户编辑；不建立可编辑的正式商业数量 baseline。Scheduling quantities 是独立事实，order quantity 变化不自动改写 schedule quantities。后续 source quantity 变化可生成 drift/reconciliation evidence，但不授权人工改写 source quantity。
- 订单业务“业务员”指品牌/客户侧业务员，不是织序 authenticated user，不得映射 `app_users`。未来 server 模型可使用 customer/brand personnel master + order-time snapshot，但具体 schema 尚未实现。理单员若是不同业务语义，仍保持 pending，不得默认归入 `app_users`。
- Production country 只属于 Quote / Quote PriceVersion 上下文；正式 server SalesOrder 不增加 `productionCountry`，也不迁移 Browser 同名字段。Scheduling `ProductionSite`/实际执行地是不同业务概念，不得重命名或混同。
- Ainuoke 工艺单/合同交期是只读 source fact。Zhixu `DeliveryPlan` 是可编辑、可展开多行的客户交付要求/计划 domain，修改计划不得改写 source delivery date；详情后续必须将 source date 以弱化的次要文字另行保留。
- Ainuoke SalesOrder 首次创建且存在有效 source delivery date 时，初始化一条同日期的默认 DeliveryPlan。只要用户从未编辑、拆分、新增或其他手工改动整个集合，该 untouched system-derived default 才可跟随后续 source date 变化。一旦发生任何用户介入，整个 DeliveryPlan collection 转为 Zhixu-owned；后续 source refresh 只更新 source fact，不覆写用户计划，差异只通过 drift/reconciliation 显式呈现。具体 flag/列名由后续实现决定，但必须能确定性区分两种所有权状态。
- 对已在同一业务流中关联的 Quote 与 SalesOrder，“客户确认价格”和“确认工价”分别是一个共享的当前业务事实。Quote Center 与 Order Detail 都可编辑这两项当前数值，任一修改都必须在另一表面读到同一结果，并用可信 actor 记录 timestamp、old value 和 new value。精确 linked context 的工价币种 qualifier 由 Quote PriceVersion 语义建立；Order 只能保留并只读显示，不能独立选择、更改或在未知时猜测。历史 Quote Revision/PriceVersion 快照不回写；完整 Quote/Order PriceVersion 不做 live-link，面辅料成本、margin、汇率、加工假设、Quote production country 及其他字段仍独立。未关联 Quote 的 SalesOrder 不得伪造 Quote 关系。
- C4.2 implementation 将该规则落为独立 Server current domain：客户确认价格固定解释为 CNY/件；确认工价保留明确的 `CNY|USD` 币种，金额缺失保持 `NULL` 而不是 0。精确 Quote provenance 可由多张 formal SalesOrder 共享同一个 terms identity；无 Quote provenance 的 SalesOrder 只创建自己的 order-owned context，且可由 Order 明确选择工价币种。Quote-linked Order 在币种尚未由 Quote 建立时提交工价必须 fail closed。该实现不迁移 Browser confirmation，不改变历史 Quote snapshot，也不授权真实数据库 activation。
- C4.2 之外的上述 C4 规则仍未实现。Customer/Brand master mapping、orderDate 语义、source style 向 Zhixu Style master 的长期关系、超出当前 source/adjustment 规则的颜色人工模型、settlement/pricing basis、execution snapshots、attachments、process/customer requirement/inspection/remark 语义以及 Browser retirement 细节仍为 pending。

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
- 默认优先级为 CustomerSalesperson > Brand > System；应用到新 Quote 时复制为独立 `OtherCostLine` 快照。后续默认设置变化不得回写已有 Quote。
- 单张 Quote 的 `OtherCostLine` 仍允许 0..N 条；历史 Quote 已保存的多条明细必须原样保留。
- 旧版 0..N 全局费用只作为 legacy migration source，兼容投影只取首条 enabled 且 name 或 amount 有效的记录作为新 `DefaultOtherCost`。
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
