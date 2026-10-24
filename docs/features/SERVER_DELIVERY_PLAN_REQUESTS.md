# Server交期计划可靠请求与回执

## 现有业务和范围

2026-10-24，D083/D100/D147/D154；0042仅为现有DeliveryPlan命令增加技术可靠性，不是新订单、生产计划或出货账。已冻结的SALES_ORDER_PERSISTENCE.md（da5b）和0009/后续旧迁移原文保留。默认行首次来源日期/数量（含0）、无日期不补建、untouched日期清空/恢复复用UUID、人工正数和永久user_managed、作废历史、独立集合CAS及Source drift均不变。已完成/取消订单沿用现有交期维护生命周期规则，不因此获得价格/生产/关账写权限。

## 单一命令身份

原PATCH /api/v1/sales-orders/:uuid/delivery-plans及成功{deliveryPlanSet}保持。新增可选requestId UUID；首个await前复制和规范化原SO/expectedVersion/全部upserts/voidIds，UUID小写，严格字段和100条受影响行上限。数量仍用精确正十进制字符串。64KiB命令紧凑JSON及PG实际jsonb字节共同保护，不引入浮点总数。

显式key为actor+uuid，旧body为actor+legacy:完整规范命令SHA256；两namespace共用一个writer和immutable ledger。相同原请求重放原完整结果；显式同ID异意图409，不同请求仍集合CAS。旧body不生成随机身份；缺0042无无回执写旁路。原命令包括expectedVersion，不把未来真实再次操作全局去重。

## 事务、权限和历史

现有effective归属共享fence→fresh用户/角色/授权锁→actor/request锁→原回执→首次执行原SO/root/集合。历史回执先于新CAS/alias判断，仍需fresh order.view+order.edit。首次写只针对原有效SO，不跟随Source owner搬计划；角色已停用/归档/撤权等待后不能按旧session继续操作。

计划、可信OperationLog和成功回执同事务；仅本writer固定409/422成为durable rejected。成功结果保留全部含作废的历史行（100是命令影响数量，不是历史截断），compact和PG实际JSONB上限16MiB。容量拒绝在SAVEPOINT撤销计划/审计后保存小型422结果。SQL/审计/锁超时的提交前故障可回滚；COMMIT报错只尝试回滚，提交结果可能未知，必须按原命令核对，不能用catch声称一定未保存。

0042空技术表记录原actor/SO/命令hash、原命令、终态结果和审计引用，UPDATE/DELETE拒绝，SO外键和完整行字节纳入既有归一只读盘点；不恢复公开归一写入口、不自动搬账。无backfill/seed/新权限，正常启动verify-only，不升级现有环境。

## 查询原回执

POST /api/v1/sales-orders/:uuid/delivery-plans/receipt为只读核对，提交原完整命令，不在URL放意图。不接受query selector；仍受trusted session、order.view+order.edit、allowlisted Origin及X-Zhixu-Request边界保护。返回schemaVersion1、原SO/requestMode/requestId及applied/rejected/unknown；applied内operationId和完整原DeliveryPlanSet。固定shape重建防止存储混入价格或Source私密字段。

unknown仅表示当前查询没有已提交结果，可与正在COMMIT并发；不是未提交证明，不自动PATCH。已保存结果不会被后续Source、人工计划、alias资格或CAS覆盖。本阶段没有客户端缓存或UI恢复操作，后续交期维护界面独立接线。

## 当前验收和限制

当前只完成受控前移及357a迁移清单兼容窄取，使用当前migrationFilesAfter(41)，不引0043断言。新source冻结后的纯请求、实际HTTP/PG、并发/权限等待/COMMIT丢确认、两容量、252历史、真实锁超时、引用和升级、类型/Node/lint/根与发布精确守卫结果另记；不借旧12cf测试。

原0041升级夹具无非空0040成衣观察或0041刷新回执，不能扩大为这些域的非空迁移证明。旧Linux CLI平台缺口独立保留。当前不改前端或Python，不重复其未变验收；不读真实凭据/Source、不改真实账号/业务库/卷、不绑定/激活/调度/部署或替换旧入口。
