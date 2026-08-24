# 已确认业务规则

本文件只记录可由当前代码、数据库约束或测试确认的规则。根路径 ERP 与 Quote Center 的同名概念有不同口径，未经明确迁移决定不得互相套用。

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

### 第一阶段账号与权限

- Quote Center mock 权限采用 User -> Role -> Permission；业务授权只判断稳定权限键，不判断角色名称。
- 管理员默认拥有完整权限目录。
- 报价员可创建、编辑、导出、确认报价，更新报价版本并创建价格版本；不能删除报价、修改基础设置或管理用户权限。
- 查看员可查看报价、历史版本、报价成本并导出；不能创建、编辑、删除或确认报价，也不能修改估算成本。
- 无权限业务操作保持可见 disabled，并显示“暂无权限，请联系管理员”。
- 权限记录与当前测试账号不进入 Quote、QuoteRevision 或 PriceVersion。
- 当前权限是 localStorage mock RBAC，不构成生产安全边界；未来真实 API 必须服务端重新鉴权。

### 操作日志

- Quote Center 操作日志是独立追加记录，不进入 Quote、QuoteRevision 或 PriceVersion，也不替代 Revision 历史。
- 日志只在报价保存成功后依据上一次已保存快照生成；未保存的输入不产生操作记录。
- 日志记录稳定 `userId` 和操作时的 `userName` 快照，并以 `quoteId` 聚合该报价下的 Revision、PriceVersion、成本和附件行为。
- 当前记录报价创建/保存/删除、报价版本创建/更新/删除、价格版本创建/修改/删除、客户确认、面料/辅料/工价/其他费用修改、图片/文件上传、附件删除、款式图、估算成本、导出、模板和权限管理动作。
- OperationLog repository 只有追加和读取能力；全局页面与报价详情复用同一数据源，不提供编辑、删除或清空。
- 全局操作日志需要 `audit_log.view`；默认只有管理员具备该权限。
- 当前 localStorage 实现不是生产级不可篡改审计存储；未来服务端必须在业务事务成功后由后端追加。

### 全局搜索

- 第一阶段全局搜索只返回已保存 Quote Center 报价，搜索字段为报价号、款号、款式名称、品牌和客户业务员。
- 报价号保留为内部搜索字段，但搜索结果和最近访问不主动展示报价号。
- 报价搜索必须经过 `quote.view` 权限；无权限时不得查询 QuoteRepository，也不得从最近访问泄露旧结果。
- 搜索结果只包含报价列表级身份和导航信息，不包含面辅料、工价、其他费用、估算成本或确认价格。
- 搜索结果导航继续经过 AppShell 导航回调；当前报价有未保存修改时不得绕过 dirty guard。
- 最近访问按 `userId` 隔离，只保存非敏感结果投影，不复制 Quote 或 Revision。

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

- 空值与用户明确输入的 0 不等价；展示层不得把未填写成本显示为 `¥0.00`。
- 辅料及通用成本行：`用量 × 单价 × (1 + 损耗率 / 100)`。
- 面料毛门幅为 `净门幅 + 5cm`。
- 千克采购单耗：`段长(cm) × (净门幅 + 5) × 克重 / 10,000,000 × (1 + 损耗率 / 100)`。
- 米采购单耗：`段长(cm) / 100 × (1 + 损耗率 / 100)`。
- 面料成本：`单耗 × 单价`。
- USD 工价按 Revision 中的 USD/CNY 汇率换算为 CNY。
- Quote Center 加成口径为 `成本 × (1 + markupRate / 100)`，不得替换成根路径 ERP 的毛利率公式。

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
- 新 Revision 复制附件引用数组，但不复制底层 Blob；新版本新增附件不影响旧版本。
- 历史 Revision 只能查看、切换预览和下载，不能上传、删除或修改款式图。
- 删除当前款式图需要二次确认，确认后 `styleImageAttachmentId` 置空。
- 普通文件只允许下载，不提供 PDF、Word、Excel 在线预览。
- 图片/文件二进制存入 IndexedDB，现有 localStorage/sessionStorage 只保存业务结构和附件 ID，不得保存 Base64 大文件。
- 批量粘贴或拖放图片必须先进入待确认列表；取消不产生附件记录，确认后才批量保存。若本批保存中途失败，应补偿清理本批已写入项并允许用户重试。

### 正式 Excel 报价

- 一个 Quote Revision 导出为一个 Workbook；每个被选中的 PriceVersion 导出为独立 Sheet。
- 历史 Revision 必须从该 Revision 快照导出，不得混入当前 Revision 或当前页面的编辑值。
- 有未保存修改时不得静默导出为“最新”；用户必须明确选择导出已保存版本或保存并导出。新建报价必须先保存。
- 面料、辅料、加工费、外协和其他费用区域均允许按实际条数扩展；空值保持空白，明确输入 0 才导出 0。
- 导出的成本、小计和报价结果使用 Quote Center 现有计算口径；最终报价文字使用 `FOB RMB x.x`。
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
