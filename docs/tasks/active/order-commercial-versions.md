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
