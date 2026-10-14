# Gate2 订单商业版本实施基线

2026-10-14；最新核实main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；本分支feat/order-commercial-versions从已验证Gate1 b5c7eb89dc25c397ebf342baa0607705abc80c89建立，初始clean。依赖未合并，不能称main已包含Gate1。

实查：CCT按Quote provenance共享current；订单readOrderWithClient直接读shared row；Quote无关联SO时确认值保存在PV confirmation，已有SO时确认命令转走CCT。因此候选必须明确区分来源为CCT版本还是未关联报价的精确Quote/PV确认快照，不能要求先造SO才能确认价格。

技术选择：新增append-only订单商业版本及独立head；采用命令锁定报价上下文、精确报价版本与CCT版本，再锁订单、CAS和审计。快照只含实际确认金额/币种和身份元数据，不拷贝成本。未确认与零区分，processing不要求成衣价。新报价变更不反向更新版本。

读入口最终全部切到订单快照；未采用时显示待采用/历史待核实，不动态回退shared current。旧order CCT PATCH必须拒绝并提示新采用入口。报价端确认能力保留，订单不能代写报价确认。

历史切换仅只读预览：当前可证实值标注采样时间，不能冒称初始价。旧执行/冻结引用不搬迁；completed订单不得通过采用改价。真正的Server关账未实现，不伪造其完整集成。历史归一仍Gate4，真实迁移/采用另行授权。

本Gate开发中，任何schema/API仅隔离合成验证；不真实部署或启动source。每个可靠checkpoint记录，未通过全部门禁不送达最终PR。

首批6项合成PG验证通过：无SO报价确认、processing售价不适用、CCT优先且空值不回退、错误归属/币种、版本禁止覆盖删除与跨单head。0015只在随机tmpfs容器运行。


## 采用事务 checkpoint（2026-10-14）

在基础提交 `552e9b2de3f2809a1689594d43b997d12f1e9b2d` 后增加采用服务，尚未开放HTTP入口。新增权限order.commercial.adopt与跟单经理预设；不写真实账号。服务复用Gate1可信身份/实时权限检查，锁定来源后锁订单，比较预览指纹与当前版本。actor/request幂等键和订单/version唯一约束共同约束重试及并发；失败审计回滚全部采用写入。来源确认时间与采用时间分别保留。

验证：`npx tsx --test --test-concurrency=1 server/integration/order-commercial-source.integration.test.ts server/integration/order-commercial-adoption.integration.test.ts` 17/17 PASS（随机tmpfs PG）；server:build、typecheck、8个增量TS文件eslint PASS。早期测试夹具因订单版本增量约束和报价外键失败，已依实际schema修正，未放松约束。来源删除场景明确只删除隔离样本的精确PriceVersion及依赖明细，验证采用快照独立保留。

新覆盖：相同请求并发、不同请求CAS、同报价两订单价格独立、单单改价、预览后来源变化、权限撤销含重试、未认领/已完成阻断、审计失败回滚、审计自由文本金额脱敏、来源版本失效。已有G1测试仍需下一轮完整回归；HTTP、UI、旧CCT兼容切换、历史预览与最终门禁待完成。没有远端送达、CI或真实升级的结论。


## HTTP 与旧订单入口切换 checkpoint（2026-10-14）

基于 `0961fcdf39ea1a498c08bc9f18ae831a6086e352` 增加 GET /sales-orders/:id/commercial-versions、POST同路径采用、POST /preview。明确字段白名单；当前值、预览、采用回执均走金额权限投影；无权限不输出原始金额、指纹或自由文本原因。preview仅接收精确Quote/Revision/PriceVersion。POST要求可信session及mutation boundary，领域再次读取实时权限。

旧订单confirmed-commercial-terms GET仅适配独立订单采用快照，未采用为null；旧PATCH与内部导出更新命令统一409 order_commercial_adoption_required。报价端确认尚保持原路径。原共享读取改名readLegacyOrderCommercialEvidence，仅为后续历史预览内部取证，不作订单现价。

验证：18/18商业候选/采用/HTTP隔离测试、15/15身份及0014/0015升级测试；server:build、typecheck、增量eslint通过。升级明确不填充商业版本、不改变原订单或角色权限。已有旧CCT集成测试尚未按新规则调整，完整回归未完成，不可发布。

下一步：报价侧关联查询须识别新采用关系，检查已有CCT与PV confirmation的写入权威一致性，避免有CCT时更新PV却读到旧CCT；开发采用界面/候选选择、历史预览；修订旧共享语义测试并保留报价确认权限/CAS回归。不要以当前定向测试代替最终门禁。
