# Server 物流基础资料

2026-10-24，D147/G6D 当前工程候选。只恢复既有“生产与运输”中的集货仓和运输方案；工程、合并、部署、用户接受和来源激活分别记录。当前目标、Browser 长期数据和真实业务库没有升级。

## Owner 与命令

复用 `server/production-resources/`、原 `/api/v1/production-resources` 和0034的命令回执，不另建物流命令系统。新增类型 `hubs`、`transport-plans`；原四类型的规范化 payload/hash 不变。0037只新增空的 `production_supply_hubs`、`production_supply_routes`、`production_transport_modes` 并扩展原回执 kind 约束，不回填、Seed、授权或修改0034–0036。

运输方案作为一个聚合编辑：出发集货仓、到达生产地点和完整运输方式。每个方式有稳定 UUID、自然日数、启停、排序及备注；新方式由服务端分配身份。编辑必须保留全部已有方式，包括停用项，不能通过省略或换父路线删除历史身份。停用取代物理删除，同名不作为身份。

## 事务与保护

- 复用 fresh DB actor、角色/权限锁序、全资源范围锁、CAS、原 actor/requestId 和不可变回执。父路线、全部方式、审计和结果同一事务；结果未知先 GET 核对，不自动 POST。
- 启用方案必须引用启用集货仓、地点及其日历；父资料锁到提交。同一 hub/site 只允许一条启用路线，停用历史方案保留。数据库唯一索引处理并发，不按名称择一。
- 每方案1–100个保留方式，运输天数0–3650；子项保留原路线所有权。列表以计数摘要展示，编辑读完整子项；摘要不能冒充空明细。查询分页、空格AND、候选上限及未知状态沿原资源约束。
- 输入/outbox/SQL回执仍1MiB。物流结果按 PostgreSQL 实际 `jsonb::text` 字节核验，超界在原SAVEPOINT回滚聚合/审计，并记录可核对的小型422拒绝。原四资源的同类容量保护及错误码保持；不扩大上限、截断、另限原合法字符或把COMMIT未知称已回滚。

## 页面与权限

同一 `/system-settings/production-infrastructure` 页面保留生产地点/日历，接通后两区同页卡片和原宽抽屉，不新增路由/导航。Browser 路径仅抽取共享表单字段，原 Repository、数据 key、迁移及空值政策不变；Server 不挂载它们、不回退、不写旧存储。

沿用 `settings.production_infrastructure.edit` 写权及 `schedule.view` 读权。客户端目录、依赖读取、预提交校验、outbox与迟到响应绑定当前身份/挂载owner；A→B→A不能复用旧授权。CAS后保持草稿，目录fresh授权恢复前禁止“读取最新版本”。新方式身份、选择器分页和完整关系均须在服务端复核。

## 范围外与验证

本模块不是物料物流订单、到仓事实、到厂确认或生产排期；不推算齐套、不更改计划，也不包含成衣出货/关账/金额。后续0038–0041必须先于0042交期命令按迁移前缀交付，不能重写已应用编号。

新源码的单元/客户端、实际一次性PG/HTTP、0036→0037保留排单和完成事实升级、真实构建与Chromium before/after、类型/lint/根/发布及精确main守卫以[当前任务](../tasks/active/server-logistics-resources-current-2026-10-24.md)和后续冻结报告为准。原e223或G6A/B/C结果不作为本轮通过证据。
