# 订单商业版本（Gate2）

核实日期2026-10-14；main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5。本分支本地实现，未合并/部署/人工验收。批准规则见D-121和order-identity-program，阶段测试事实见../tasks/active/order-commercial-versions.md。

## 职责与身份

0015新增不可变sales_order_commercial_versions与单订单head。每次采用保存精确Quote/Revision/PriceVersion、来源Quote/CCT版本、来源确认时间、采用人、请求身份、原因和售价/工价/币种。订单创建字段、来源绑定、执行流水不改。销售价固定沿用现有CNY口径，工价沿用CNY/USD；不新增汇率功能。加工类商业模型预留售价不适用，正式加工创建待Gate3。

候选从精确报价读取：已有CCT即以CCT为准，即使空值也不退回PV；否则使用PV客户确认，不使用测算价格。软删除、错误归属、缺确认或币种矛盾阻断。零是有效确认值。报价变化不覆盖订单快照，删除报价或PV不删除既有采用历史。

## 命令与权限

GET /api/v1/sales-orders/:id/commercial-versions读取实际采用；POST同路径采用；POST /preview只接受三个精确来源ID。可信session、mutation boundary、fresh DB grants、owner/transfer权限、order.commercial.adopt与金额查看共同检查。来源上下文锁、报价行锁、订单CAS、actor/request唯一键和原子审计保证并发和重试。相同请求相同载荷返回原结果，换请求键不能绕过订单版本；撤权后重试也拒绝。

旧Order CCT GET仅适配已采用快照，无采用为null；旧PATCH及内部写命令409拒绝。Quote CCT仍提供客户确认，已有CCT阻止PV confirmation成为第二写入源。商业使用查询包含采用历史，但不改原创建关系。

跟单经理/管理员预设拥有采用权限，不修改真实账号。物控与生产不新增金额权限。投影按售价/工价独立脱敏，未获完整金额权限不输出候选指纹或自由文本原因。已完成/取消订单阻断采用；Server完整关账尚不存在，不能宣称完整关账冻结接线完成。

## 界面与历史

订单详情复用Foundation商业卡片与Modal：报价搜索分页、精确版本选择、前后差异、原因、显式采用。未知提交结果保留原请求重试。未采用显示待核实，不展示共享当前价为订单价。390px/1440px合成浏览器验证，用户人工验收未进行。

POST /api/v1/order-commercial-cutover-preview限定1–100个不重复订单UUID，要求订单/审计及两项金额查看，READ ONLY REPEATABLE READ，无回填。逐单返回可证实的旧当前值、现采用状态与观察时间；originalOrderPrice=not-proven，不能称其为原下单价。真实历史扫描/回填另行授权。

## 安全与更新

0015仅隔离随机tmpfs演练；旧数据、权限、身份不自动回填。回退不能重新开放旧共享订单写价；关闭采用命令并保留版本优先。旧应用与迁移后库完整兼容性未获确认。Gate1来源基础读取与认领投影分离，不靠扩大旧工具迁移范围兼容。

规则、权限、schema/API、测试、远端或部署状态变化时更新本文件及CURRENT_STATE。GitHub是实时事实源，文档为阶段快照。

2026-10-15：既有Gate2树前向整合G1 7ef6e665准备重试修复，商业逻辑与0015未变；29商业/角色、6身份+4商业浏览器、824项目/78基线、类型/源码lint/构建及精确门禁通过。新head交付和CI仍待，不能沿用3deffc的三绿。见[本轮证据](../tasks/active/evidence/order-commercial/gate2-g1-preparation-retry-2026-10-15.md)。
