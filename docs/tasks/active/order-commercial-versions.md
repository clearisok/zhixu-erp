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


## 报价确认权威衔接 checkpoint（2026-10-14）

基于 `bfc73fddc0b4995b0e2db8bd77897dc418327eeb`。确认真实缺口：新采用关系不改sales_orders创建来源字段，旧关联查询只查创建来源，导致报价未识别订单采用。现在商业使用查询合并精确创建来源与独立采用历史；创建来源查询另设函数，保留历史语义。旧CCT单订单关联表只继续登记原创建关系，新采用不写入该单上下文表，避免换用报价后的关联冲突。

已有CCT即使当前没有关联SO，也继续作为报价确认权威；PV confirmation写入禁止绕过已有CCT。报价侧GET和更新允许读取/维护该现存CCT，而非显示未关联并转写PV。首次建立CCT的单字段更新从精确已确认PV保留未提交字段（含零和币种），不清空另一确认金额。历史采用记录保持，报价改价仍不修改订单版本。

19项合成/HTTP回归PASS，新增采用关系识别、首次仅改售价保留工价、无关联SO但有CCT时旧PV写入阻断及CCT可编辑。类型检查、server:build及增量eslint通过。初次测试夹具缺少报价款号/款名及复制报价后的估算来源身份不匹配，已按真实校验补齐/移除独立夹具估算，未放松生产验证。

下一步采用界面与历史预览、旧CCT测试语义更新和完整回归。当前仅本地工程checkpoint，未远端交付、未部署、未真实写入。


## 采用界面 checkpoint（2026-10-14）

基于 `1037ef1068da0ee7d4df5c4989e4122df121915e`。订单详情复用Foundation商业卡片，移除旧共享条款编辑模态，接入独立商业读取/预览/采用。报价搜索和20项分页、Revision/PriceVersion明确选择、前后售价/工价差异、采用原因及确认。未知历史保持待核实；完成/取消订单不显示采用按钮；请求不确定时保留actor/request原命令重试。金额展示遵循服务端字段投影。普通Server详情与来源执行详情均可查看商业依据，权限仍由服务端检查。

顺带修复客户端协议：已有精确CCT但关联SO列表为空仍是可信报价确认来源；无CCT且无关联仍不能冒称linked。6项客户端回归通过，类型、增量eslint和显式Server构建通过。最终去掉executionOnly对商业卡片的隐藏后尚需再次构建与浏览器验证；没有人工视觉验收结论。

本阶段UI影响精确路径：features/order-center/components/server-sales-order-detail-page.tsx、features/order-center/components/server-order-commercial-card.tsx、features/confirmed-commercial-terms/client.ts。批准依据为用户已批准计划Gate2显式采用及差异确认；保持其余页面布局。最终发布前还需把这些路径与先前权限模型影响合并入本PR正式release-baseline UI记录，并完成桌面/窄屏与七角色验收。


## 浏览器与历史预览 checkpoint（2026-10-14）

基于 `21a4be0653557254a8f0834c4319957821d97976` 重新构建Server候选，4项真实Chromium+可信session+一次性PG测试通过：跟单经理认领后精确选版、预览前无写入、采用一次、刷新保留、报价改价不覆盖订单、390px无横向溢出及物控无金额/无采用入口。检查1440/390截图（outputs/order-commercial-ui，仅合成、Git忽略）；人工业务验收仍未进行。

新增POST /api/v1/order-commercial-cutover-preview，仅精确salesOrderIds数组1–100个不重复UUID；可信session/mutation boundary、order.view+audit_log.view+售价/工价查看权限，领域再次读取当前授权。单个REPEATABLE READ READ ONLY事务输出观察时间、当前可证旧CCT、已采用版本及逐单缺口。originalOrderPrice固定not-proven，databaseWrites固定none；无真实扫描、无回填/自动采用。Legacy创建关系只读使用原创建查询，不把后补采用冒作历史创建。

20项领域/HTTP回归通过（含只读预览逐单缺失、重复/空范围拒绝、撤销审计权限、订单/采用/audit行数不变）；server:build、增量eslint通过。新增test:order-commercial和test:order-commercial-ui脚本。仍需旧CCT回归改造、七角色完整商业测试、发布基线与最终复审；Gate2不可标记交付完成。


## 七角色与旧确认回归修订（2026-10-14）

基于 `2dfc34dd26b72bb9a5bb1634c3b0119854097188`。7角色可信会话矩阵8项PASS：admin/merchandising可采用；manager/quote/finance只读金额；material无金额；production只有工价；历史预览仅具备audit及两金额读取权限角色可用。所有角色旧订单PATCH均不能改价。合成角色测试加入test:order-commercial。

linked-commercial-terms 9项PASS：保留精确零/高精度、独立Quote/CCT CAS、真实锁等待交错、Quote改版/删PV与确认并发、导出混合来源阻断、审计及association失败回滚。仅替换被D121废止的旧订单共享读取/直接写入断言，断言未采用订单为空及旧写入409且不取得数据库连接。

commercial-terms-security 20项PASS：16种字段权限组合、单字段null/零、隐藏字段保留、CAS、审计失败回滚转由合法Quote确认入口测试；保留旧订单读空与写入阻断作为独立负向场景。类型检查、增量eslint通过。仍需confirmed-commercial-terms主集成、其他旧商业读取/浏览器测试修订及完整发布门禁；不以这37项代表全套通过。

本阶段npm test完整源码回归817/817 PASS（初次815/817，两条废止共享UI静态断言已更新；14项相关源码测试独立通过）。这不包含尚待修订的PG商业主套件；日志outputs/gate2-project-tests.log。

商业主回归收口：confirmed-commercial-terms / commercial-read-surfaces / commercial-amount-exposure-audit 共19项一次性PG/API测试PASS；保留精度、权限、导出、审计回滚、来源/历史不变断言，合法报价确认改用Quote接口，旧Order接口只返回采用快照或拒绝写入。typecheck和三文件lint通过。完整test:postgres正在运行，结果尚未判定；日志outputs/gate2-postgres-tests.log。无真实数据库、账号或部署操作。

已修复软删除报价仍可成为新采用候选的缺口（quote_not_available），既有快照不受影响；新增负向测试。test:order-commercial 29/29、typecheck、两文件lint PASS。完整PG回归仍运行，已发现冻结0001-4工具的读取模型与0014关联不兼容、DeliveryPlan等旧断言，需逐项处理，不能宣布全套PASS。

兼容回归阶段：完整test:postgres初轮236/248，通过数量包含父测试，12失败已逐项定位。修复来源创建/刷新对0014认领表的读取耦合，抽出foundation只读投影，正式列表/详情仍使用完整认领投影；冻结0001-4首绑工具不扩大迁移范围。交付计划历史数据测试改为显式合成legacy种子，不复活已禁止的Order改价命令；迁移清单及权限数更新。定向兼容集初轮55/57（剩余旧schema刷新），修复后DeliveryPlan17/17、OrderIdentity15/15通过，类型/lint/Server构建通过。全PG第二轮正在运行，日志outputs/gate2-postgres-tests-rerun.log，尚不能宣布PASS。
重要：此来源读取耦合来自Gate1；Gate1独立合并前必须同步修复及重跑精确门禁。其待交付SHA仍保持不动，不能将此前局部通过当作最终合并批准。没有真实数据库/账号/部署操作。
