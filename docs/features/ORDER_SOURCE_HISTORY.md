# 订单历史艾诺科物料来源

核实日期2026-10-15；GitHub API main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。本地feat/order-effective-attribution，阶段起点b497578752472decffba0b44f6404b4f5cf41f6a；未远端交付/合并/部署。GitHub是实时工程事实源，本文随schema、API、来源归属或验收变化更新。依据用户批准的D121历史保护，不新增真实数据操作授权。

## 职责与身份

历史查询按快照原始sales_order_id和run_id定位，不能自动改向当前有效订单，也不把同组其他SO的快照相加。响应另给currentEffectiveOrderId供导航，原UUID、SO编号、创建来源、合同绑定、价格及流水不移动。历史数量是采集时的来源事实；按当前解析规则重放，不是对当年或当前齐套状态的认证。

0022_source_history_context.sql对新采集记录完整目标scope、精确source_link_id、订单version及原归属epoch。旧快照新字段保持NULL，标记legacy_context_unavailable，不用当前合同/订单版本补造历史。升级后相同旧payload必须发布一次带完整上下文的新run，随后可以原有幂等重放。当前读取也独立校验scope/hash/link/epoch，历史查询不能成为当前来源读取的绕过路径。

已知合同绑定禁止DELETE、改ID或改合同身份；来源owner/system/entity/external_id的已有保护保留。镜像允许InsideOrderNo/款号/数量/状态等后续观察更新，但不允许删除或重写合同身份；当前颜色观察切片仍可由现有来源命令替换。空白旧合同号不自动填入或分类。

## API与权限

- GET /api/v1/sales-orders/:id/material-history：原订单的历史列表，limit默认20、1–50，cursor必须是该订单同一Source profile的run UUID；created_at/id稳定keyset分页。
- GET /api/v1/sales-orders/:id/material-history/:runId：精确原订单/该次采集的投影；拒绝客户端身份、scope、来源或其他query选择器。

仅session authority，每次在REPEATABLE READ readonly事务核查active可信身份及ainuoke.view/order.view/style_progress.read。沿用已有Server SourceReadConfig固定profile与enabled状态；未接通默认503。Cache-Control:no-store，不做HTTP来源读取、凭据访问、业务写入、CCT读取或Browser回退。角色/授权撤销立即影响后续请求。

详情先检查字节上限32MiB，再核对完整Discovery与6087050分页、hash、来源合同及采集时InsideOrderNo。最多400报告页/100000行；部分schema、未知归属、哈希损坏、未来时间或身份不吻合均失败关闭。权限错误仍403，不借错误回退到别的Source。

## 历史展示契约

order-material-history.v1声明usage=historical_only、currentStatusApplicable=false；子投影独立schema order-material-history-progress.v1/sourceStatus=historical。需求及采购/入库/出运/出库数量和原事件保留；所有齐套状态为null，summary不计算ready等当前状态。原始payload、CCT及内部测算金额不返回。不同单位和数量unknown沿用原Material Pipeline/Projection语义，不填0或合计跨物料数量。

目前本阶段只交付Server查询，浏览器历史入口、历史订单提示/选单和独立复核UI另行工程阶段。无真实Source激活、范围扩大、调度或数据库迁移；真实旧DB应用0022仍需单独目标/备份/授权。旧二进制不得把缺失新migration文件的数据库当兼容；沿用0021回退边界。

## 验收证据

17项历史定向与45项有效归属回归已通过，覆盖旧NULL证据、新scope、原目标、不搬移合计、纠正拆组、来源变化、身份不可删改、cursor串单、损坏/future/partial schema、权限与session/default disconnected及逐表readonly。类型、定向lint通过；本阶段完整结果冻结到docs/tasks/active/evidence/order-source-history/gate4-source-history-results.md，正式收口以前以其实际结果为准，不引用历史测试冒称本次通过。
