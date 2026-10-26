# Server新业务域非空持久化恢复：隔离实测

2026-10-26；实际终态2026-10-26T12:27:41.976Z。本记录只证明本轮真实合成输入，不表示43份迁移的全部业务域已非空验证、真实Source激活、用户接受或正式部署。

## 精确来源与原结果

- 核实main 869ee84dd0b31de6161011e4aa560678b244a64d；PR130远端保持61704afe22fe9fd0ea9f6625c6092fcbb9575dfc、3项CI成功。本轮没有push、API改ref或新CI；原Git退出1/STOP_AUTH_OR_DIVERGENCE及根因未定保留。
- test source e3a23280e152d4113366604da020c68eb3e519bb，parent eb176a3e71784fe5faf4d5fc79347daa7f6589df；phaseBase 61704afe22fe9fd0ea9f6625c6092fcbb9575dfc。首个eb检查点及预审P2历史保留，不改写提交。
- 实际产品镜像source 6d27d1e7fa1079f1830511068ff070791df310ab，zhixu-persistent-cumulative:6d27d1e7-20261026-34ee9055fd，ID sha256:6a30bf2e192a27b090a9444244d4c918e09afc07f5f65df1d5ae672c4c1677be。应用/API/SQL与该原制品相同；无重build/依赖安装，不能称镜像以新test源码构建。Canonical archive 47e86f8f908e023363c9b6fc0f58916246e7758fce086b5681b663657d1bedd6，2991 tracked blobs/0 overlay，依赖只用已有junction。
- 原6d的8/8、617的Hosted3/3、c1的144/144均分别按原source保留；不冒称本次重新执行全仓/浏览器/Python/144。当前9项是新增非空输入后的实际新运行，不复用旧PASS。

## 实际新验证

- 首次runtime：9/9，0fail/cancel/skip/timeout/overflow，478994ms；原600秒用例/900秒外层预算不变。继承4个owned执行/清理/端口/网络函数除行尾外未变，原8名称保持，opt-in新增1项业务输入。
- 使用既有生成fixture（1合同、10物料原行）和compiled binding/capture服务，collector仅返回合成JSON，不做上游HTTP。资源、内/外发排单、两次完成、两次集货备注和两次物料到仓版本经同一实际HTTPS API/session/领域命令；没有第二套数据owner或恢复实现。
- 源订单1f67494f-3030-4eca-9a53-8c805bf8f3c6，原Assignment [d83be47a-8561-41a8-b841-8df92e8cbbee,75317840-72d7-48fe-adf6-bf8d841a39b4]；计划精确100、完成20.25及到仓60.25等decimal由测试显式断言。稳定颜色、需求ID、资源事实、版本、审计和请求UUID参与完整行摘要或API对照。
- 冷重建后业务表与领域读取一致；维护停写后全部public表计数/内容SHA及pg_sequences冻结，恢复到另一个成功prepared的新空库后、objects/app/login启动前逐项一致；启动/login后再核对7条领域/history读取和13个原请求。活动期只排除8项auth/ledger技术表，停写恢复前比较包含这些表。
- 每个回执都必须known、原requestId、applied，并与原POST结果一致，仅去除transport replayed/payloadHash；unknown→unknown不能通过。4项相关正负回归实际通过；初次fake response缺bytes的TypeError失败保留，不把原3项拒绝冒充有效负向验收。
- 旧50容器/179卷/27网络所选身份/状态/health/存在性前后changes=[]；这不是旧业务内容审计。仅本轮成功prepared自有项目由原harness在全通过后清理；旧资料/账号/卷/备份未动。

### 实际非空业务表计数

- ainuoke_material_source_snapshots：1
- ainuoke_sales_order_color_mirrors：1
- ainuoke_sales_order_contract_mirrors：1
- ainuoke_source_profiles：1
- ainuoke_source_runs：1
- material_arrival_command_orders：2
- material_arrival_commands：2
- material_arrival_demands：1
- material_arrival_plan_versions：2
- material_arrival_plans：1
- operation_logs：20
- production_calendar_exceptions：1
- production_calendars：1
- production_group_plan_heads：1
- production_groups：1
- production_order_execution_tracking_versions：2
- production_order_execution_trackings：1
- production_order_plan_heads：1
- production_outsource_factories：1
- production_resource_commands：5
- production_schedule_assignments：2
- production_schedule_command_orders：6
- production_schedule_commands：6
- production_schedule_execution_epochs：2
- production_schedule_execution_versions：2
- production_schedule_executions：1
- production_schedule_plan_versions：2
- production_schedule_resource_snapshots：2
- production_sites：1
- production_supply_hubs：1
- quote_attachments：1
- quote_center_cost_snapshots：1
- quote_center_price_versions：1
- quote_center_quotes：1
- quote_center_revisions：1
- quote_creation_previews：1
- quote_creation_receipts：1
- quote_revision_attachments：1
- sales_order_attribution_write_epoch：1
- sales_order_color_identities：1
- sales_order_command_control：1
- sales_order_command_control_events：1
- sales_order_delivery_plan_sets：1
- sales_order_delivery_plans：1
- sales_order_normalization_target：1
- sales_order_source_links：1
- sales_orders：1

完整表摘要、sequence与原请求结果只留本机合成原件；未把业务快照、凭据或原始日志上传。

## 范围限制

本轮非空主要覆盖可信SO/颜色/交期、生产/执行、仓库/物流上下文和预计到仓。0040–0044成衣观察/过滤/交期回执等新账本未全量非空覆盖；财务关账、跨次稳定出运事件及更正、真实Source或Browser像素均不由本轮证明。没有重算成本、改金额/币种、改旧schema或迁入旧数据。

完整G1–G8/R继续；加工产值/已采用CNY工价/完成更正stale等原待决、具体真实来源授权、50426人工接受/切换与资产退役保持。3001/50426等旧环境不更换。Q/R只冻结证明和前向清单，不重复本轮runtime或构建；最终exact-main守卫和独立复审按后续真实回执。Git/ref远端写仍冻结，新本地SHA不解除STOP。

## 本机原件SHA256

start.json：08eb3b849e44e610997d15bc4235eb6e5f421dfd5db93a944429dacbad7997ed

source-checkpoint-initial.json：dfb8a88502136ba74fe567c28bbe56e2028391fb929d6aee2a1e0fe50052b8c2

review-fix-checkpoint.json：0926d1e8e38e9b7be5a39f277f56c4f7745ced402eac6fca4379760af4e9e8e6

prepared-receipt-fix.json：9c2c4519ba6468a7d3a7c08c2dc4db4c5ed8c0b811232dfa247873ae395ee39c

preflight-review.json：ed4c68c2b7cc1ae724b255d1b3ecb6d24e987e3ad06704a34f77d11d16114f12

inherited-guards.json：d40a126fdc581ff8125753b10a5dceeee6eb31c6fd0722cbbdfba4ba43c03484

canonical-receipt-fix-check-3.log：84b6e1f9c39673a086be308731fa34832295b2922ca2a397ca2b96cb52e80cea

runtime-attempt.json：88b96424036e78b29f59d18d7486a32686db268254aea18ff80b1e112e36810c

runtime-result.json：25ba1a4ec2dae23ccbf54a2b11ee0024faa8f1936d9a6ccd2da62b71c81039bd

runtime.log：fa18f8f2206ca48edc682862de5d243f7740b60f95e2ebe27eaf56aedd7a451d

preservation.json：a26aaa0a35759536c48c330b4c869700294200d0d66f8b70f70f9f532e5cbecf

原件在outputs/domain-recovery-20261026；[阶段](../active/nonempty-domain-recovery-2026-10-26.md)。
