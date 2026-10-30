# 可信新合同未采物料：独立空态修复

2026-10-30（北京时间）。Gate4后继最小修复，分支 **fix/bound-order-material-empty-state**；开始HEAD **944e72bd6d8e3ff57e63a4a60e40aa000f98f535** 干净。通过GitHub API实际核对main仍为 **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**、开放PR为0。开始HEAD只比该main多本地运行记录文档；不重写或丢弃它们，不复制产品实现。

## 原因与最小处理

已部署宁波C1是有效SO、6色尺码可见，但没有获准物料采集，GET物料返回404/order_not_available，见[实际公网证据](2026-10-30-ningbo-fixed-source-initialization.md)。`server/ainuoke-source/reader.ts`原resolveVisibleOrder把当前物料record当作普通绑定订单的可见性条件，因而把“尚未采料”误报成“订单不存在或无权”。

继续复用正式boundOrders/Source profile/RBAC和既有not_connected DTO。在同一只读RR中独立核实profile；启用且latest_run_id为空的正式绑定订单可以表达未首采。已有run但该订单无物料时，用原Discovery adapter验证完整分页/唯一BillNo后精确匹配合同；不借用其他订单物料、不用款号、新建DTO或复制匹配器。已设置latest指针却缺run不当作正常空态。

原有快照的link、归属代际、内容hash与TTL路径不改；历史归属目标的既有兼容分支不在本轮重定义。无profile、未绑定/不存在、停用profile和完整Discovery失去普通合同仍不返回可读材料。没有任何材料代际或ready事实时，到货计划仍不可用；不生成“零需求/已齐套”。没有SQL/schema/API写入/UI文件、金额权限、采集次数、持续调度或产品owner变化。

## 实际验证

- **先红测**：追加首次正式绑定未采、已采第一单后新增第二合同两场景，均实际得到404而非预期200；7测试中4通过/3失败（含父测试失败），不是既有测试回归。
- **修复及HTTP验证**：最终同一一次性PG用例7/7通过；包含匿名401、可信会话200/not_connected、no-store、附带contract选择器400、无Source写入/无订单审计增量、不借第一单快照、停用操作者/Source拒绝、完整Discovery移除合同仍404，以及driver中损坏hash/完整性得到503。修改的只是driver返回值，没有禁用数据库证据触发器或更改真实数据。
- **相关回归**：六文件合集80项，**79通过/0失败/1跳过**；覆盖Source/Python合成loopback、权限撤销、失败/陈旧/分页、原有效归属、到货计划并发/历史和物料HTTP。Windows跳过的是既有Linux CLI子检查，不声称通过；后继仅新增driver负测，最终7/7另跑通过，产品reader未再改变。
- `npm run typecheck`、两项变更TypeScript文件ESLint、`npm run server:build`通过。没有前端UI文件或打包配置变化，不把既有浏览器证明说成本次重新运行。
- 首次发布基线测试启动后feature/接力文档继续更新，未再对应最终证据集；经核实该任务自有Node进程树后停止，记为**取消/非通过**，未动业务进程或真实环境。证据先冻结并前向绑定后，再执行一次最终基线测试及精确main守卫；未完成之前不得称已最终验收或交付。

独立审查者只读查看最终reader/新增driver负测及到货计划和订单警示下游，未运行第二套测试、真实来源或数据库操作；最终静态复审无P1/P2阻断，发布基线仍由主执行者完成。主执行者之外没有并行实施。

## 发布与恢复边界

此候选没有部署到宁波或任何真实目标，也没有新增艾诺科登录/查询。全部运行验证用新建合成一次性PG，结束只移除本用例自建tmpfs容器。宁波真实三单、只读快照、报价/附件、账号、卷及配对备份保持，原10分钟时效不延长。

源码checkpoint及manifest追加保留旧证据对象/hash，不覆盖旧feature文档时点；无UI基线变更或新capability状态宣称。计划只在全部本地检查完成后集中一次交付、核对精确SHA并创建唯一草稿PR，不自动merge或更新staging。若远端传输状态不能确认，保存本地提交与现场，不重复上传。

完整目标仍需分别核对部署/人工接受、长期采集方案以及G1/R的具体旧环境切换和退役授权；本修复不把宁波隔离体验等同为原50426已切换，也不删除3001或旧数据。
