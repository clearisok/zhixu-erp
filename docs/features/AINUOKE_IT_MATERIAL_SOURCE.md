# 合同物料明细 6087051（D-182）

2026-11-06，已在本机真实订单环境验证D1992，全部目标正在接入；未部署staging。复用既有 Python SDK、Server capture、不可变 observation、物料归一化管线和订单只读投影，不新建物料/价格数据库。

## 入口和所有权

私密采集配置显式 `materialReport: "6087051"`，仅 `catalog-contracts` / `bound-materials` 使用；省略保持6087050。Browser不能指定任意报表或开启此模式。目录、颜色、正式SO身份、报价价格所有权及D179–181同步预算不变。

依据本机知识库 `zhixu-ainuoke-knowledge` 提交 `3ce658027e645132c8f59ac0caaa1de58d2e326f` 的合同身份审查、IT补充清单和只读接口清单。此依据不是本轮真实采集验收。

## 请求与匹配

|报表|固定条件|读取用途|
|---|---|---|
|6087051|ExpContractNo contains，内层|完整合同物料行；返回行必须精确属于目标合同|
|6086405 / 6086408|InsideOrderNo contains，内层|面料/辅料采购单位：id、PurContractID、PurContractNo、OrderNum、QtyUnit|
|6086875|InsideOrderNo contains，内层|面料入库单位：id、MainID、FInStoreNo、Num、QtyUnit|
|6086354|InsideOrderNo is，内层|辅料入库单位：id、MainID、BillNo、Num、QtyUnit|

只有7051行中出现对应采购/入库明细引用时，才请求该行工厂款号的独立表。同一合同旧款号保留，不能只查询当前款号而漏历史。单位须同时匹配明细ID、主单ID、单据号、数量；独立表有合同字段时还须精确匹配。缺失、冲突、错页或时点相隔超过10分钟不采用。表名/物料名/相同数量不构成匹配依据。

暂不读取独立出运/出库单位表：现有可核实引用不足，不猜测查询字段或单位。不处理新增退货/国内国外分类，不合并出运和出库事实。

附加单位页计入原80报表/4000行/180秒总预算，不能扩容绕过门禁；同步回执的materialRows只计物料主报表。新增请求可能使原5合同批次超限，正式启用前先按单合同固定样本核验，再据实测调整批量；本轮不宣称原高频吞吐已适用于新模式。

## 去重和可信边界

- 只使用行数据；顶部业务合计不保存、不消费、不用作对账基准。分页总行数仍用于校验完整性，不是业务合计。
- 需求键：合同＋物料类型＋需求id；流水按cgmxid/rkmxid/cymxid/ckmxid分别识别。同一流水联表展开只展示一次；不同ID相同数量分别保留。同ID内容矛盾拒绝发布。
- 跨需求共享流水保留引用，分配待核对，不把整笔数量重复分配；需求/流水缺少有效身份或计量依据时不伪装成可靠汇总。
- 7051没有已证实的需求单位。采购/入库匹配单位只属于对应流水，不推断需求、出运或出库单位，不自动换算。原始数量可读，状态/汇总保守待核对。
- 未取得可信单据有效状态，不推断“未采购/已齐套”；未知不显示成0。既有6087050的单位与状态规则保持。
- 原始证据、查询、分页、时间和哈希沿既有不可变存储保留。旧快照和Browser历史导入不改写；新7051不能通过旧Browser提交入口落库。
- 来源采购价沿既有权限只读；报价CCT、订单实际成交价和工价均不修改。合同目录只提供非金额明细白名单。

## 页面与验证

合同目录资料中沿用“物料采购与收发”汇总，逐物料展开采购/入库/出运/出库行，单位未知标待核对。正式订单的既有物料控制台显示对应流水单位及“明细匹配”标识。窄屏明细独立于表格列，不截断长单号。

验收入口：`tests/ainuoke-it-material.test.mjs`、`tools/ainuoke-bridge/tests/test_it_material.py`、`server/integration/ainuoke-it-material.integration.test.ts`、`server/integration/ainuoke-catalog-ui.integration.test.mjs`。结果、失败修正和上线剩余边界见[执行记录](../tasks/active/ainuoke-it-material-2026-11-06.md)。正式启用前需要限定合同/报表/请求预算的真实核验及发布批准，不能用本地合成通过替代。

## 正式发布与历史读取（D-183）

订单创建/绑定及重复导入自动检查缺失物料发布并排队；普通刷新和CLI material-recover复用requestContractSync与worker。恢复使用固定source-ids及同一request-id，仅排队，不隐式发请求或启用服务。任务结果区分published与catalog_only，发布须核对head与完整快照。

新发布仍要求来源新鲜、身份及分页完整。已经通过验证的成功快照过期时保留明细和原始时间；最新超时/解析/发布失败不覆盖成功指针。读取继续验证来源账号、合同、订单版本、哈希和权限；身份/可见性冲突不能借历史回退绕过。旧事实可读不等于当前齐套或本次刷新成功。

实际范围、来源时间、HTTP和浏览器证据见[本轮闭环记录](../tasks/active/ainuoke-material-closure-2026-11-06.md)，禁止引用旧合成测试宣称全量交付。

## 厂供修订核对（D184，2026-11-07）

6087051不再按SupplyType=厂供排除需求。现有表格的需求数量明确为来源值，全部稳定需求身份及交易保留；未知修订关系不覆盖、不累计、不计算已确认缺口。厂供不等于已确认工厂采购责任。D1992四条主面料用户确认不替代原申购；涤纶线尚待确认。原34/38/30计数是不同历史阶段与过滤口径，不代表有效需求版本数。

## 已保存来源历史发布（D186）

正式历史服务 `publishHistoricalMaterialObservation` 验证完成回执、账号指纹、目录/合同/订单归属和证据哈希，在原采集窗口校验完整性。沿用发布事务，仅补空head，不改成功head和失败状态，不结束刷新队列。CLI `--material-history-publish=<source key> --source-id=<id> --order-id=<uuid> --observation-id=<uuid> --evidence-hash=<sha256> --expected-target=<fingerprint> --config=<private file>` 不调用源站；同一证据可安全重放。普通刷新仍走原任务机制，不能以历史发布冒充新采集。正式Server读取6087050和6087051均保留厂供来源，未知修订/缺口不自动决断。真实运行结果见[本轮记录](../tasks/active/ainuoke-offline-history-2026-11-07.md)。
