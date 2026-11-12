# 艾诺科同步审计台账（D194）

仅本机工程候选；部署和源站启用是独立步骤。用户明确批准在现有系统设置新增长期台账，未授权本轮部署staging或生产。不新增业务采集报表、不改业务匹配/数量/单位规则。

## 页面与访问

`/system-settings/ainuoke-sync-records`，系统设置菜单“艾诺科同步记录”。数据表记录与同步批次两种视图；日期（北京时间自然日）、报表名/ID、批次状态、同步类型、批次ID、合同/现有目录工厂款号查询，按原始任务时点倒序及批次分页，批次详情包含逐合同、请求回执、分页/游标/发布关联与频率。查看本表历史沿用同一筛选。

GET `/api/v1/ainuoke-sync-audit`、`/export`使用正常服务端会话和fresh RBAC：同时需`ainuoke.view`及`audit_log.view`。没有写/删除审计API。Excel用已有ExcelJS，三个工作表保留逐表、逐合同和批次时间/口径；最多10000批次、50000表记录，超过拒绝并提示缩小范围，不静默截断。普通物料只读角色不自动取得审计权限。

## 已接入源清单

以真实报表ID为权威；下列名称是已有适配器用途名称，不冒称取得了源站SQL物理表名。源站物理表名不可获取。分色分码的尺码依据在现有颜色镜像/元数据，未虚构size_mirrors。

| 报表ID | 已有来源/用途 | 可能的正式目标（实际发布记录另存精确目标） |
|---|---|---|
|6086103|销售合同|ainuoke_catalog_entries、ainuoke_sales_order_contract_mirrors、sales_orders、sales_order_source_links；或来源run/共享证据|
|6086997|旧销售合同颜色尺码|ainuoke_sales_order_color_mirrors|
|6087105|成衣分色分码|ainuoke_sales_order_color_mirrors；目录未建单时为ainuoke_contract_observations|
|6087050|旧面辅料申购统计|ainuoke_material_source_snapshots、ainuoke_material_order_heads|
|6087051|面辅料申购统计-IT|ainuoke_material_source_snapshots、ainuoke_material_order_heads；目录观察为ainuoke_contract_observations|
|6086405|面料采购单位核对|ainuoke_material_source_snapshots中的来源证据|
|6086408|辅料采购单位核对|同上|
|6086875|面料入库单位核对|同上|
|6086354|辅料入库单位核对|同上|
|6086941|货款申请|ainuoke_payment_snapshots、ainuoke_payment_heads|
|6086979|成衣出货登记|ainuoke_garment_shipment_snapshots、ainuoke_garment_shipment_heads、ainuoke_garment_shipment_color_matches|

6087051是联合报表，包含需求/采购/入库/出库/物料出运节点，不能伪造为五个独立源报表。6080183是systemId，不是报表。没有已接入的独立“海外应收/外协加工”接口证据，不为清单新增接口。运行中首次遇到其他已验证reportId会自动留台账并显示未登记ID/实际目标，不静默忽略；新采集协议仍须走原适配和校验。

## 持久表（0058，仅新增）

- `ainuoke_sync_audit_batches`：唯一UUID、源key、类型、原任务起止、频率/当时策略、合同/任务/capture显式关联、请求与重试计数、状态/错误码、来源live/historical/historical_record。历史参考时间、依据和台账入库时间独立；没有原任务开始时间保留null。
- `ainuoke_sync_audit_tables`：每批次/报表汇总和逐合同子记录，源名、目标表、读取/提交时点、源时间可用性、获取/逻辑变更/重复/失败计数、页/游标/完整性、真实发布关联和事务ID。顶层统计不叠加子记录。
- `ainuoke_sync_audit_record_state`：最新稳定来源身份→内容hash，用于下一次逻辑变化比较；不复制完整业务原文，不用于订单/物料匹配。
- `ainuoke_sync_audit_events`：原控制/任务事务产生暂停、恢复、停用、启用、失败、重试，以及认证和中断事件；不可更新/删除。批次和逐表记录禁止删除；普通用户无修改入口。

索引覆盖时间、状态、类型、合同/capture关联、报表历史与批次明细。原业务表/数量/指针结构不改变；迁移不启用来源、不清暂停、不重放任务。

## 时间和计数语义

1. 源端创建/更新时间只在实际字段有证据时保存；例如6086979 `createTime`保留原始值/时区未推断的证据。未取得确定更新时间时显示不可获取。
2. 新collector在真正请求开始/结束时发送白名单UTC元数据；获取行数取实际`dataList.rows`行数，包括双遍读取。复用的历史页不伪装新网络获取。旧独立collector在调用前记录collector_invocation开始时点，明确区分请求级计时；只有历史页完成时间时，开始时间保持不可获取，依据page_completion_only。
3. `write_completed_at`是业务COMMIT已确认之后由PostgreSQL记录的提交确认时刻，不是HTTP200、读取结束或WAL精确提交时间。若COMMIT成功但回执/审计确认丢失，保留write_pending/partial，时刻不可获取，不冒充失败业务覆盖旧指针。
4. 新增/更新/未变化按各报表稳定明细身份及内容hash比较；6087051使用已有自身id加实际关联交易节点ID，不能按GoodsID去重。双遍重复、联合展开的来源行数与逻辑记录数分别保存，不保证两者相加相等；此统计不是采购金额、交易数量或不可变快照物理INSERT数量。身份不足或冲突时变更数量保持未知。首次绑定/接纳使用已提交的选定订单/颜色镜像记录数（selected_order_mirrors），不能把读取的整份目录行数误报为已创建订单数。
5. 完整业务事务提交后才标表成功；回滚不推进hash基线。表失败/未发布使批次失败或部分成功；HTTP200且isOk=false明确失败。写入失败记录不能覆盖上次成功数据/时间。
6. 今日概览来自真实审计/队列表。待补齐任务数已知不等于待补齐业务记录数；后者未完整获得时显示“未取得完整数量”。历史台账补录不算今日新同步。

## 路径覆盖与恢复

现有目录capture、自动/手动worker、首次绑定/新增接纳、合同颜色刷新、物料发布、历史物料补发、旧source capture、货款collection/operator/publication及成衣collection/publication统一关联当前审计上下文。AsyncLocalStorage仅关联，不保存历史；所有数据写PG。复用的Python owner每次捕获显式绑定当前批次，避免跨批回执错归属。公众参数在审计首次await前同步固定，不改变原CAS/输入固定语义。

重试沿用原订单队列，独立尝试及失败历史不覆盖；源站认证仍跨单跨周期复用，未新建登录体系。服务持有原worker锁恢复中断任务时，核对尚在运行的审计批次；已确认成功行保留，提交不确定保留证据和未知时间，未完成读取进入有限恢复。重启不会删除台账。

根因证据：11/11 15:52:23.933–15:52:34.391北京旧capture，621合同身份与范围均不变，hsid变化，26目录请求=13页各两遍、总54请求全部complete。旧复合`catalog_changed_or_over_limit`把该变化升级为无期限全局暂停。新码区分超限、身份/范围、同字段非身份内容漂移；同身份内容仅允许完整重新读取，不接受变化中的结果。1/5分钟总3次短退避后等一个原目录周期再评估；管理员enabled=false永不自动解除。只有明确hsid-only旧回执+全页完整证据才能进入该恢复路径。认证、权限、证书、身份/范围、未知响应及人工handoff仍停止。单合同/单表业务失败保留其失败记录，其他独立合同仍可执行。

旧台账维护：现有CLI增加`--sync-audit-backfill=<source key>`，仍使用原私密config和expected-target核验；默认预览，`--apply`每次最多100批（默认25），返回`next`用于`--after-at/--after-id`继续。仅按显式capture/request/publication键读取既有回执，不按相近时间猜测。不发源请求，不写业务表/任务/控制/指针。旧提交时点和未记录的变更计数为null；明确标历史记录，重复执行幂等。需要原来源查看、审计查看与权限管理授权。当前工程未对真实库执行该补录。

## 验证与发布边界

自动测试使用自有临时PostgreSQL和合成SDK传输，包含真实HTTP/session/RBAC、事务提交/回滚、重试、重启、Excel解析与Chromium。原始历史成功/失败例子是只读现有宁波记录，不是新源站采集；没有新增艾诺科登录/报表请求。详细最终结果见任务记录。没有实机演示、staging部署、生产操作或真实来源恢复宣称。
