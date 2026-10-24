# 决策日志

状态说明：

- **Active**：当前实现仍遵守的决定。
- **Superseded**：已被新的实现或决定替代，仅保留背景。
- **Deprecated**：为兼容仍可能存在，但新代码不应继续依赖。
- **Partially Superseded**：只保留条目明确列出的保护；被替代的交互/写入口不能据旧段落恢复。

2026-10-19 校准：main `996dfedc12da3527343cd3ff2aa5eea35497e10e` 已包含 PR108–119。下列旧条目的“未合并/本地/待UI”是其记录日期的阶段事实；当前工程入口见 CURRENT_STATE 与 SYSTEM_OVERVIEW。合并不代表部署、真实激活或人工接受。

2026-10-24 合并事实：用户仅批准#123以merge commit进入main e01a11952b648024c0bd6bf4259de429374981e2；#121/#122原提交随祖先保留，GitHub自动收口，分支未删除。D146/D147以下“尚未合并”等语句继续表示其原记录日期，不能据此恢复旧规则；其余PR、部署、账号/业务库、来源和入口切换授权不扩大。

### D-043 ScheduleAssignment 直接归属 SalesOrder，生产计划层退出 Runtime

- 日期：2026-08-28
- 状态：Active；替代 D-041 的三层关系，但保留其数量分离、混合执行、Service Projection 与权限边界。
- 决定：正式关系改为 `SalesOrder → ScheduleAssignment[]`。Assignment 保存 `salesOrderId`、队列、工期口径、日产量快照、工作日、计划/实际日期与 dateMode；ProductionPlan 只留在 v8→v9 legacy migration、迁移测试、旧日志兼容和已替代文档。
- 迁移：v8 ProductionPlan 只用于解析 owner，原 ScheduleAssignment ID 不变，确保 ClosingAllocation.scheduleAssignmentId、锁账快照和产值不变；稳定 namespace 不变，schemaVersion 升为 9。
- 排期：内部生产组按 ProductionSite 的可编辑 ProductionCalendar 串行排队；同日交接不计完整工作日；manual_fixed、已开工和已完成记录不自动移动。完成后用户明确选择是否重排后续，联动日志共享 operationId。
- 物流：物料齐套要求面辅料均到 SupplyHub；SupplyRoute/TransportMode 按自然日给出满足时效的最慢运输建议，不反向修改排期。报价 ManufacturingPreset 与实际 ProductionSite 分离。
- 证据：`features/production-scheduling/`、`features/operations-settings/`、schema v9 migration、订单/排单页面和 `tests/production-scheduling.test.mjs`。

## Active

### D-161 / D-159 当前成衣操作者复用原配置与单次采集服务

- 原2026-10-23工程决定，2026-10-25向当前main受控前移，Active engineering；D147既有范围。新增的是原源码CLI接线，不另建模型、SQL、HTTP、权限、Catalog或调度；D158/D160中无CLI继续表示其冻结切片。真实目标启用与新Source请求额度不由工程入口、hash或确认短语授予。
- plan/collect/原回执与target plan/apply/原回执显式分开；target独立确认短语、明确时效、无凭据。停用和历史核对不依赖秘密/证明/当前目标状态。0043/0044分账，旧enable不重启，COMMIT/报告未知不报成功、不自动重试。保持原服务fresh权限/意图/CAS/原子审计与严格字符串证明。
- 当前CLI只导入纯garment-filter-evidence，不恢复旧IO诊断；共享报告仅固定garment-operator kind/prefix，秘密检查不放宽。当前[独立契约](features/SERVER_GARMENT_OPERATOR_CURRENT.md)/[阶段任务](tasks/active/server-garment-operator-current-2026-10-25.md)记录新精确源码与待验收，不借原c54的PASS。无真实凭据/Source/激活、现有库或部署操作。

### D-160 成衣目标配置复用原目标并保存独立原子历史回执

- 原2026-10-23技术契约，2026-10-24向实际main e01a11952b648024c0bd6bf4259de429374981e2当前候选前移；Active engineering。D147既有范围内，不改变D152数量/日期、D153观察与D158单次采集。仅内部plan/apply/receipt，无CLI/HTTP/Catalog/调度或真实激活。
- enable复验具体原C1/C0/C1过滤证明、profile账号、唯一可信合同/原物理owner/有效归属、版本及明确时效，不提供默认策略或换绑target账号。disable不依赖证明/profile/合同/颜色/head健康，可停止历史alias；不存在为no-op，不建目标。旧观察/原时效和全部历史保持。
- 四项既有fresh权限、实际DB/actor/UUID/意图/期限/hash与原publication锁统一。配置无外部IO，0044只建空completed-only不可变回执；target、原审计与回执一次事务。锁等待后重核期限与范围，未知COMMIT只读核对原UUID，不暂定成功或自动重试。
- 新审计operationId同时含actor及UUID，不把两人相同UUID的不同SO操作合组。历史enable回放仅返回当时结果；原SO/物理owner双引用及完整行进入归一指纹，不开放归一执行或移动流水。
- 当前代码：garment-target-control.ts、0044、目标控制/0043非空升级测试及[独立契约](features/SERVER_GARMENT_TARGET_CONTROL.md)。原代码存在不证明本轮验收；新源码/QA按[当前任务](tasks/active/server-garment-target-current-2026-10-24.md)冻结，该条初记时未运行；当前40a/e19分源结果见[冻结证明](tasks/completed/2026-10-24-garment-target-current-engineering.md)，不借旧20/954/134。
- 真实启停、来源额度、现有库升级、部署、50426切换及旧环境退役均需具体授权，本轮不执行；hash和工程预览不是人类操作授权。


### D-158 单SO成衣采集使用持久单次回执与原子发布

- 原2026-10-23技术决定，2026-10-24当前受控前移，Active；D147/D152/D153已批准Server工程，不改变Num/outdate、价格、完成、关账或跨次事件。0043只新增空技术命令，不seed/回填/启用target，不开放HTTP/公开CLI/Catalog/调度。
- 本账号/本合同完整C1/C0/C1过滤证据重建，绑定实际库/actor/可信合同/原物理owner/target/颜色/head及request有效期。仅两遍完整首页100行；1登录+2报表/3HTTP、4MiB单响应/8MiB报表/180秒/零重试是工程天花板，不授予新真实请求或多页范围。
- started提交确认后才调用唯一worker，等待后重核expiry；网络不持DB锁，started不回收。原0040发布提为同owner事务primitive，snapshot/颜色/head/审计/成功终态原子；COMMIT未知只核原请求，不重采或把回滚尝试当已失败。
- 原actor/request回执fresh鉴权、封闭形状/hash重建，过期/target变更后仍返回历史；未知计数不补0，凭据/原文不入回执。双SO引用加入完整归一指纹，不开放执行。
- 当前12原输入精确加2命令手工整合，包含d99282晚expiry/回执修复，41旧SQL保持；见[独立控制层契约](features/SERVER_GARMENT_COLLECTION_CONTROL.md)和[当前任务](tasks/active/server-garment-collector-current-2026-10-24.md)。新source/隔离QA后另冻证据，不借旧31/181或#125CI；未激活/部署/人工接受。

- 2026-10-24初次14路径预核漏纯依赖，ee210未做QA；当前按原函数块前移严格JSON/完整过滤证据与Python筛查，排除旧CLI/凭据/报告入口，新增负向验收，具体范围见独立控制层契约。

- 2026-10-24原纯提取函数枚举强制转换P2已定向复现2项失败；当前只收紧result/workerStage为真实字符串，不改变合法证明或预算。修复后新QA另记，原d2ff结果不改写。

- 2026-10-24当前7f严格枚举修复后的43新检查及d2ff原280+18/811/152范围证据见[当前证明](tasks/completed/2026-10-24-garment-collector-current-engineering.md)。2红测与依赖发现保留，无新前端/真实Source/自动激活声明，发布/最终守卫后置。

### D-156 Server交付计划维护沿用原领域和原请求恢复

- 2026-10-22，Active；用户对原call_d4696fa532a64295ba294304d8404abf回复“按草图实施”。
  [冻结批准](tasks/completed/2026-10-22-delivery-plan-maintenance-ui-approval.md)限定标题小按钮、
  Foundation弹窗增改作废、预览保存、来源只读与数量差异提示；不改变D100/D154后台规则。
- 复用原GET/PATCH/原完整body receipt。仅实际变更提交；默认0/null不被强制改为人工正数，
  作废历史和行身份保留。交期与商业/生产事实独立，来源维护和交期维护独立owner后合并退出保护。
- actor/tab技术pending先完整存读后发送，不是Browser账本或回退。未知不清缓存、不自动重写；
  为避免发送前断网后永久未知，只有精确unknown回执才开放二次人工确认的同UUID/CAS/body重发。
  再次发送前核对原槽完整相等，一次确认最多一发；重发后旧许可失效，错误/切单/换会话不沿用。
  此为已批准“先核对、不盲目再保存”的恢复实现，不新增业务写入口或产生新计划身份。
- 规范SO UUID贯通缓存/当前GET/旧披露刷新；实际session对象在layout失效，防同用户ABA和迟到401。
  processing不把仅来源镜像的null伪称加工资料未记录。完成/取消状态沿用原DeliveryPlan编辑权限。
- 证据：`features/order-center/server/delivery-plan-*`、maintenance hook/组件、原详情及Foundation Modal。
  原2026-10-22工程/失败记录保留在2a19960a8f9810062f15b87e18214505aa74f8c5原提交，不作为本轮PASS。
  当前[source任务](tasks/active/server-delivery-plan-ui-current-2026-10-24.md)及独立UI契约记录新工程/远端/门禁边界。
  工程通过不代表部署或人工接受；原决策阶段快照与失败保留，不改D100/D154规则。

- 2026-10-24当前受控前移：原批准字节/原型hash已核，16非workflow原输入一致；沿[独立UI契约](features/SERVER_DELIVERY_PLAN_MAINTENANCE_UI.md)验收，不借旧2a结果。后台3e869保持，不带D155覆盖投影或0043。

- 2026-10-24产品56b/driver0e12的新隔离工程结果见[本轮证明](tasks/completed/2026-10-24-delivery-plan-ui-current-engineering.md)：失败及分阶段联合保留，发布/最后守卫仍后置，不借原工程或#125CI。

### D-155 交期覆盖基于当前登记事实，不重建历史产出

- 原2026-10-22技术决定、2026-10-24受控前移，Active；承接D043/D147/D151和既有累计交期比较。当前全部已登记产出（含取消排单）保留原物理SO/执行方；只有未取消、未结束的正剩余按计划结束日形成预计供给。
- 既有生产订单GET在同一READ ONLY REPEATABLE READ追加deliveryCoverage；有效交期同日合并并保留全部planIds，累计需求和供给只计一次。未知日期单列未评估，不用来源日期替代。不将累计产出按一个实际结束日期摊到某日，不扣减6086979观察；非历史准时率、库存、成衣出货或关账。
- fresh order.view+schedule.view，原500排单/1000有效交期/完整1MiB响应及精确十进制边界保持；超限明确422不截断，不读金额、不写计划/执行/回执/审计或新表。不以生产planVersion冒充独立DeliveryPlan集合的CAS。
- 证据：delivery-coverage.ts/test、同一service订单GET及[独立契约](features/SERVER_DELIVERY_COVERAGE.md)/[当前任务](tasks/active/server-delivery-coverage-current-2026-10-24.md)。新工程结果后置，旧ff8b/483be及#125CI不作本轮PASS；无UI/部署/真实来源或人工接受。

- 2026-10-24当前source558345的47相关/类型/Node/相关lint实际结果见[新工程证明](tasks/completed/2026-10-24-delivery-coverage-current-engineering.md)，无新UI/SQL/134或旧结果替代；最后精确守卫后置。

- 2026-10-24严格客户端V0受控前移：同一GET白名单保留coverage、复用纯D155投影验证同响应，缺失/null保持服务未提供；不另建公式或显示面板。见[独立客户端契约](features/SERVER_DELIVERY_COVERAGE_UI.md)，本轮新验收后置，不扩张D156批准。

- 2026-10-24严格客户端source fc103fb8实际62及新双构建/原排单built UI通过，smoke runner失败保留，见[本轮证明](tasks/completed/2026-10-24-delivery-coverage-client-current-engineering.md)。V0不引面板、Source请求或第二计算owner，最终精确守卫后置。

### D-154 DeliveryPlan沿用原命令并保存可核对回执

- 原2026-10-22技术决定，2026-10-24受控前移，Active；D147已批准Server收敛范围内的可靠性，不改变D083/D100的来源/人工所有权、系统默认0、人工正数、独立集合版本和历史计划规则。原PATCH/writer/响应保持，0042只新增空不可变请求回执，不回填或重建计划。
- 可选显式UUID与旧body确定性身份共用actor-scoped ledger；首await前复制原SO与全部规范命令，同请求返回原完整结果，不同请求保留CAS。缺表无无回执写旁路，历史结果不因后来Source/CAS/alias重判，但始终fresh user/roles/grants。
- POST原完整命令只读核对，unknown不证明失败、不自动重发。计划、可信审计、成功回执同事务，仅writer固定409/422保留拒绝；连接/SQL/审计/锁超时不伪造终态。COMMIT结果未知须核对，回滚尝试不证明未提交。
- 完整结果含作废历史，compact JSON和PG实际JSONB16MiB，超量SAVEPOINT撤销计划/审计后存小拒绝，不截断历史；新原SO外键纳入既有完整引用指纹，不搬身份/生产/价格。
- 证据：delivery-plan-service.ts、delivery-plan-request.ts、0042和[独立契约](features/SERVER_DELIVERY_PLAN_REQUESTS.md)、[当前任务](tasks/active/server-delivery-plan-requests-current-2026-10-24.md)。新工程验收按当前source另记，不借旧12cf；无UI、真实采集/来源激活、环境迁移、部署或人工接受，Goal active。

### D-153 成衣出货先保存不可变观察

- 原2026-10-21技术决定，2026-10-24受控前移，Active；D147批准工程范围内实施0040，不改变D152业务口径。默认关闭的独立target/快照/颜色匹配/head，只证明指定查询两遍观察一致，不把contains首页样本当完整合同或Source已激活。
- 复用可信合同、有效归属和既有稳定订单颜色；冻结实际物理来源SO/link/归属/订单版本/颜色依据。数量变化不换颜色身份，重名/改名/缺失不猜，历史不追随当前镜像。行ID仅捕获内查重，不跨快照累加，不以消失/空结果作取消或清零，不以负数作冲销。
- fresh权限锁、profile与完整物理SO冻结、CAS/同事务审计及原捕获精确回执；新发布180秒预算不阻止已有回执核对。历史只取不可变标量，详情重建；实际JSONB容量预检超限422且无业务残留。COMMIT响应丢失保持未知并核对，不声称catch回滚证明未提交。
- 证据为garment-shipment-observations.ts、garment-shipment-store.ts、0040及[当前契约](features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)；本轮新QA按当前任务另记。收集器/UI/事件ID/撤销语义及真实激活另Gate，不新增真实查询额度。

### D-152 成衣出货采用Num及outdate

- 用户2026-10-21明确确认、2026-10-24前向记录，Active。6086979成衣出运登记明细的Num“本次出库数”为逐笔数量，outdate“出运日期”为业务日期；FDate、indate、DeliveryDate分别保留，缺失不回退或填今天。
- 原D1933固定首页仅是限定样本，不借本条重读或放大为全表验证。ycyNum/UsableNum等累计字段独立，不代替Num或逐行相加。6086941同名Num为采购数量，物料出运不能代替成衣出货。
- 可信销售合同和颜色按既有身份核对，工厂款号contains只找候选；出运billno不是销售合同BillNo或SO号。来源观察不覆盖合同数量、生产完成、商业版本或价格，不自动确认收入/付款/开票/关账。wxprice或币种未知不补零或默认USD。
- 该答复只解决D147的出货数量/日期；加工产值、关账stale、已采用CNY工价处理保持待决，不据工程预算新增真实读取/绑定/激活/调度/部署许可。


### D-151 实际产出归属与完成后明确重排

- 原批准2026-10-20；2026-10-24向当前main前移，Active。执行D147/G6C及用户明确答复：仅登记本单需完成权限，联动后续重排必须同时具备完成与排单编辑权限；preview/command/原请求回执同样fresh检查，无差异不豁免。
- 已产出保留原Assignment/物理SO/执行方/颜色/采用资源；取消剩余或换执行方创建新的剩余任务，不搬产出。已有执行更正为0也不解锁归属；减量/日期更正/重开保留原因及不可变历史。实际、计划、客户交付、价格/出货/关账各自独立，无记录不造实际0或今天日期。
- 0036前向execution head/history/技术epoch与同一命令事务；完成及明确后续重排原子提交，原计划/固定/执行/前序及历史只读保护保持。旧0035/Browser历史不改，技术0升级不补造业务完成。
- [Server执行契约](features/SERVER_PRODUCTION_EXECUTION.md)及[当前任务](tasks/active/server-production-execution-current-2026-10-24.md)按精确源码记录本轮工程；原27b/旧CI不作新验收。没有扩大真实DB/账号/Source、目标激活、合并/部署或关账授权。

### D-150 Server排单计划版本与采用资源事实

- 原批准2026-10-20；2026-10-24向当前main前移，Active。实施D147/G6B，延续D043直接SO→Assignment；计划与客户交付、实际完成、金额/关账独立。可信合同或已消费加工批次计划不以认领、负责人或商业采用为前置，不宣称完整生产闭环。
- 单条、SO集合、组队列分别CAS；完整预览后明确提交，跨组首版用单个事务锁串行化。资源事实完整不可变，普通编辑不追随master，明确重排才采用最新日历；固定日期及纯内核执行保护保留，6C真实执行接线另行实现。
- 0035前向新增、不回填旧数据/权限。逐次准确计划版本、actor/request回执及同事务OperationLog受SQL保护；稳定颜色共用非金额算法。全部有效组物理SO按UUID先冻结，来源子集先锁父，历史source owner不被搬单/搬交期。批量议价预览同批冻结以免相反锁序，不改任何成交价。
- 新计划引用/成功回执/快照纳入归一只读盘点；外部生产/财务覆盖仍unavailable，拒绝回执不冒称成功SO桥接，不恢复公开归一写入口。没有外发裸价/币种推断，也不扩展未来关账规则。
- 当前代码及边界见[Server排单](features/SERVER_PRODUCTION_PLANNING.md)、0035、production-scheduling与color-identities/freezePhysicalOrderGroups。工程验收按[本轮任务](tasks/active/server-production-planning-current-2026-10-24.md)精确SHA记录，旧919结果不作新验收；真实部署/来源/账号业务库及资产退役授权不扩大。

### D-149 可信订单创建报价参考与商业采用分离

- 原批准2026-10-20；2026-10-24向当前main前移，Active（业务/架构边界，当前验收独立记录）。执行D147已批准Gate5窄接线，不替代普通D102或D145报价唯一来源/加工批次规则。合同首次来源选择可进入既有new页；服务端核实当前有效SO、稳定合同和保存事实，明确创建经销草稿，复用原编号/writer/Editor，不按名称猜master ID。
- 0033不可变创建参考与Quote、actor/request、原SO同事务；不自动创建SO/CCT、采用价格或限制报价服务其他订单。已采用、完成/取消、历史alias及已消费加工订单不能由此换绑；后续Quote/Source变化不覆盖创建参考。
- 幂等含上下文，原普通hash保持；已知业务拒绝保存rejected，未知/缺回执不许可自动重POST。恢复只读，session/layout owner保护、来源二次核对/镜像锁与金额权限保持。
- 代码：creation-order-context.ts、creation-workflows.ts、0033及相关API/真实构建驱动。当前候选与实际结果以[本轮G5](tasks/active/order-context-quote-current-2026-10-24.md)为准；不借旧54/aaf结果宣称新验收、部署或人工接受。

### D-148 Server 导航连续性与退出保护

- 2026-10-20，Active；执行用户已批准的 Server 收敛 Gate3，恢复既有导航/布局，不新增菜单或开放路由。可信根边界持有唯一 AppShell，页面只注册精确路由/身份作用域的标题、返回目标和现有回调；身份等待/失败局部展示，匿名态移除受保护内容。Browser 原路径和长期存储保持。
- `.rsc` 使用 component MIME 与 no-store，避免误作普通二进制导致整页重载。早期脚本只包装公开 History API 并保留调用方 state 语义；不修改框架内部、不依赖 Navigation API、不存业务数据。可证明历史索引先恢复再确认，取消不丢 Forward。
- 未保存、处理中、提交结果未知均由原业务组件登记；保存/核对命令仍归领域组件，不自动重试。异步离开许可绑定挂载 owner 和可信身份，旧响应不得打断新登录。无索引历史不猜方向、不覆盖其他 entry；保留输入并明确地址可能不同，下次已确认跳转重新加载文档，原生离开保护保留。
- 无 schema、来源范围、公式、金额权限、角色目录或创建语义变化。当前仅工程候选；部署、人工接受、来源激活分开。证据：`server/static-files.ts`、`components/foundation/server-navigation-history.ts`、`server-navigation-protection.tsx`、`app-shell.tsx`、`quote-server-boundary.tsx` 及实际 Chromium 导航测试；完整结果见[Gate3](tasks/active/server-convergence-gate3-2026-10-20.md)。

### D-147 Server 收敛、空数据目标与关账币种

- 日期：2026-10-20；状态：Active（用户批准的目标与执行边界；本 Gate 只有文档，尚未实现 Server 关账）。D-146 已由未合并 #121-123 使用，本项不替代角色管理决定。
- 用户批准全项目收敛计划，并确认目前没有业务数据需要迁移。延续 D-096：新目标从空业务库建立，不导入旧 Browser、Legacy、演示报价/订单、账号或来源样本。无需迁移不等于授权清空、删除或证明旧库没有记录；3001 必须保留，50426 为待核实持久化目标。
- 新 Server 关账目标：成衣销售产值币种为 CNY，工价为 USD；金额与币种共同保存、分别展示汇总，不直接相加、不新增自动换汇。不是把现有 Quote/PV/CCT、采购来源或历史快照批量改成 USD，也不修改既有报价公式。
- Gate 1 改为准备全新持久化空环境，不搬历史业务数据。旧体验数据原地保留；已有入口替换、删除资产、合并 PR、正式部署、真实账号或新艾诺科采集/绑定/激活/调度仍需具体授权。
- 成衣出货定义、加工服务产值是否计入成衣销售产值、完成变化引起的关账 stale 仍待确认；币种决定不批准税率、确认时点、收付款或利润规则。现有 color-commercial.ts 允许 CNY/USD 工价，Gate 8 前须明确已采用 CNY 工价的处理方式，不得只改币种标签或套用默认 USD。D-042 的 Browser 历史保持；未来 Server 不能把原币混合总数标成 RMB。
- 依据：用户 2026-10-20 明确批准；[Gate 0 资产/能力账本](tasks/active/server-convergence-gate0-2026-10-20.md)。代码事实：closing-service.ts 新记录 legacyFxRateApplied=false、原币与 RMB 命名汇总并存，closing-repository.ts 仍为 Browser owner；本阶段未改变代码。

### D-146 可配置角色与独立用户管理

- 2026-10-19，Active；用户批准[系统设置管理方案](tasks/active/system-settings-administration-2026-10-19.md)，替代D-104的固定预设、组合角色分配及旧管理布局限制；保留可信session、金额独立授权、审计和历史保护。
- 服务器管理员是唯一可管理角色/用户的受保护角色。其他预设与自定义角色可编辑/归档；库中授权为准，启动、读取和用户编辑不得覆盖。保存角色权限撤销使用者会话。管理权限不能授予自定义角色。
- 新建/明确改角色只选择一个；旧多角色不隐式清理。删除用户为可恢复归档，保留账号和业务引用；恢复停用，确认有效角色并重置密码后启用。不能自锁，至少一名启用管理员。
- 密码至少6个Unicode字符，不限组合，不trim，bcrypt72字节上限。既有密码/限流不变。
- 导航与角色页为Phase1；用户页和日志按独立后续阶段交付。三阶段均只隔离验收，尚未合并或生产部署。
- 证据：server/auth/managed-roles.ts、admin-guard.ts、0031_managed_roles.sql、server/integration/managed-roles.integration.test.ts。


### D-145 报价确认权威与订单实际成交价独立

- 2026-10-17，Active，用户批准[完整实施范围](tasks/active/quote-order-price-coordination-2026-10-17.md)。新业务只保留报价来源；合同类可信合同与加工批次身份保持。后续来源弹窗/颜色映射/报价中心议价取代D144对应交互，历史不删除。
- 报价确认权威由CCT是否存在决定：存在时空值也不回退；不存在时使用可证明的保存PV确认。SO使用关系不抹除确认事实。解析器供列表/汇总、导出和商业采用复用；详情无CCT时仍走PV确认命令，已有CCT拒绝第二写入源。
- 订单价格仅来自独立不可变商业版本。在报价中心对指定订单追加成交价版本；不修改共享CCT、不新增PriceVersion、不换汇/重算成本，加工仅工价。Phase1确认解析器、Phase2稳定颜色/逐色商业版本及报价唯一来源、Phase3统一订单议价及只读历史已实现；Phase4加工同步推送、纯工价投影/导出与左侧选择模式已实现；已随 PR119 合并至 main；部署、真实激活及人工业务接受仍须独立证据。
- 代码：server/confirmed-commercial-terms/confirmation-source.ts；server/quotes/business-source.ts、customer-export.ts、service.ts；commercial-source.ts。只用一次性合成库，无真实迁移、采集、合并或部署。


### D-144 无负责人订单与合同后业务来源维护

- 日期：2026-10-17；状态：Partially Superseded by D-145（独立翻单入口与来源侧栏已替换，其他保护保留）。明确用户要求替代D121认领/转交、合同前准备与独立首单血统操作；D129/D130准备采用流程退役。合同类仍先可信艾诺科接纳，加工批次独立入口经用户再次确认保留。
- 历史 D-144 原文（下述翻单、侧栏及价格变化必须重报已由 D-145 替代）：正式订单无负责人。业务来源只有来自报价或来自翻单；首次和产品/工艺/价格变化使用确认报价，完全沿用历史已确认条件才是翻单。顶部维护来源侧栏替代大卡片；加工导入/推送改紧凑标题操作，取消归一/复核UI及公开写操作，历史数据不删除。
- 0027追加不可变产品条件快照，与既有订单商业版本同事务；翻单保存原单/原版本并精确复制规格、工艺及价格。旧商业历史无产品证据不自动回填，报价后改不覆盖已采用订单。确认价格、金额权限、并发CAS、幂等、冻结和创建身份保护继续。
- 代码：business-source-service.ts、product-snapshot.ts、0027、OrderBusinessSourceButton及对应集成测试。旧内部历史服务与权限key仅兼容历史，不开放旧HTTP写入；新API按操作权限，不按负责人控制。
- [用户批准范围](tasks/active/order-business-source-approved-scope-2026-10-17.md)与[功能说明](features/ORDER_BUSINESS_SOURCE.md)。仅合成/新隔离候选验证，不自动合并、部署、真实账号/业务库迁移或新的来源采集。


### D-143 两合同订单/物料单次采集的固定预算

- 日期2026-10-16；Active，D121后续隔离演示的内部工程准备，不增加真实读取、首绑、迁移、启用或部署授权。复用原SDK、固定Catalog、可信Discovery、selected binding与Material Pipeline；不改变原普通模式兼容行为，不新增HTTP/CLI/调度入口。
- 新内部selected-bindings/selected-materials只接受两个不同的规范销售合同号；完整6086103前后发现仅用于新鲜身份核对，详情只读选中两单。颜色仍用原6087105查询但逐行要求精确BillNo；物料6087050仅用Discovery给出的InsideOrderNo，返回逐行ExpContractNo须对应本单。查询成功或字段存在都不是映射正确的证据。
- 每次最多1登录、80报表/81HTTP尝试、180秒；每页50、每报表20页/1000行、全worker4000来源行、单响应4MiB/worker32MiB。网络重试和认证续期均为0；超限前阻断下一请求。失败保留已尝试计数但不返回可发布的部分bundle；进程被终止/无回执时不得把未知计数当0或自动重采。
- Node再次验证来源账号指纹、规范选择、固定预算、封闭错误、计数与完整分页，并交由既有previewSelectedBindings/validateBundle校验身份、稳定性与时效。内部函数只读来源/纯验证，无DB写入；正式绑定/快照继续由已有事务和fresh DB权限执行，不接受请求提供的SO身份代替可信库解析。
- 理论115.50和采购118、未知量、缺单位、重复来源/采购事件以及num_dyc保持原事实；不修改TotalNum/cgnum含义、齐套计算、单位换算或CCT。合成实际Python stdout、一次性PG并发接纳与四流读回为工程验收；真实小范围演示须另有具体目标和新读取/写入许可。

### D-142 财务来源显式操作入口与持久化单次回执

- 日期2026-10-16；Active，D139–141工程接线，业务数量/金额、角色授权及真实范围保持。复用原可信两合同选择、6086941固定worker和不可变快照，新增0026仅记录技术命令，不回填、启用或更改真实数据。
- DB-only目标计划与显式启停绑定实际库/连接、操作人、账号、精确SO/合同、有效归属、目标版本、代际、证据hash及请求有效期。启用须重建已有完整两遍过滤证明；该历史证明不是新快照、完整业务映射或人类授权。停用不依赖新来源读取、profile启用或无关历史绑定健康。管理员既有bind/sync/import/read权限新鲜校验，不新增真实角色授权。
- 两目标启停/审计/终态回执同事务；目标版本前移使旧快照不再可读，旧启用命令重放只返回历史回执，不重新启用。采集须在worker前持久化started；同操作人/请求ID只能消费一次，started和终态都不能作为再读许可。崩溃/提交回执丢失先只读检查，不自动收回lease、重试、重采或断言零写入。
- 每次只采集一次，原8报表/9HTTP/180秒上限不变；请求有效期至多10分钟，只限制本次启动，不新增持续scheduler/HTTP写入口、迁移或账号bootstrap命令。显式源码checkout CLI复用私密文件策略，job/报告须受保护且Git忽略；仅collect-once读取独立凭据文件，计划/启停/回执不读凭据。真实DB/目标/新读取仍单独授权。
- 第一核心13项、完整入口21项合成/一次性PG回归通过，包含真实COMMIT成功后故意丢回执、缺迁移零升级、非空0025升级不改旧事实及旧schema拒绝回退；原财务112、完整PG261通过。类型/Server编译/源码lint通过；最终基线/干净入口/构建与CI按后续证据读取。工程证据见tasks/active/ainuoke-payment-operator.md。当前未合并/部署/真实启用；D141中“尚无操作入口”为其原阶段事实，由本阶段只在验收完成的工程范围前向扩展。


### D-141 货款申请固定范围一次采集与逐SO发布

- 日期2026-10-16；Active，D121 Gate5/D137–140的内部工程接线，不增加真实读取、目标启用、迁移或部署授权。既有两个已选合同worker、账号/三字段见证、每合同最多2页/两遍、8报表/9HTTP及180秒预算保持；不注册进HTTP、Source catalog、原物料scheduler或新账号入口。
- 只读plan绑定实际数据库身份及连接目标、操作人、来源账号、精确SO/合同、目标版本、有效归属和发布代际。执行前必须精确匹配plan；hash不是人类授权。全部目标在唯一worker调用前prepare，所有原文/两遍/快照验证通过并再次检查全范围后才逐SO发布。旧采集不能冒充新范围，未知币种/单位/付款事实不继承旧样本确认。
- 复用已有prepare/publish事务，不重建来源或计算。单SO内原子，两个SO间不承诺分布式原子；后项目标/权限变化返回部分成功、停止余项，保留已接受历史。发布连接异常无法证明回滚时返回UNVERIFIED及candidateSnapshotId/expectedGeneration，不假称零写入，不自动重试、重采或删除。
- 回执不含原行、合同/采购号、账号凭据或金额。待核实项用现有DB-only GET的snapshotId/generation独立核对；当前为空、过期、目标关闭或版本已前移均不能据此断言从未提交，需要保留候选和范围计划等待获准检查。
- 22新增合成/一次性PG测试通过，相关172/172回归、类型、Server编译、完整源码lint通过；实际Python进程仅使用FakeTransport无上游请求。包含真实COMMIT成功后故意丢回执、并发双采集、源中途失效、精确decimal/未知值与原client读取。最初新增提取器类型和测试unknown类型收窄失败已修，未降低断言；无额外真实读取。
- 代码payment-request-collection.ts、contract-probe已校验页提取、对应新测试/Source CI。完整root/基线/默认构建/精确守卫后续记录在任务ainuoke-payment-controlled-collector.md；0025/UI/既有私有报告及原Source/G5树保持。操作CLI、目标启用及真实过滤仍待后续独立Gate，不因内部函数存在声称财务来源已激活。

### D-140 合同级货款申请来源面板与保守客户端时效

- 日期2026-10-15；Active，D121/D134/D139的既有事件Drawer接线候选，不扩大真实财务来源或部署授权。只在原对账tab复用Foundation/表格，明确合同级、未逐行关联选中物料、申请金额非银行实付；无新导航或物料匹配推断。
- 静态50字段共用且顺序保持；显式wire v1加入服务端evaluatedAt，原0025存储字节不改。客户端仅同源GET/no-store/有界32MiB/关闭重定向，严格SO/逐行合同/完整性/金额/单位与追踪形状，精确值作文本，unknown/0/负调整/重复来源行分别保留，不汇总、不推CNY/个或银行付款。
- 按服务端剩余寿命和整段请求/解析延迟保守计算单调deadline，不依赖浏览器Date.now；到期隐藏，订单/身份/权限/失败隔离旧响应，关闭/切换取消迟到结果。恢复可见/焦点只重读织序DB，不读取上游或激活Source。客户端不是授权或hash证明，真实权限/不可变证据仍由D139服务端执行。
- 150客户端/旧探测与实际PG/API回归通过；原物料UI9项、新财务UI9项实际Chromium通过（1920/1536@125%/1440/1280/900/390、七角色、局部滚动、展开字段、单调到期、撤权/启用代际、取消/焦点、无CCT/Browser回退）。渲染源码cefe951d1de1a32763a1e7298e69b2560b1c282d、build20261015-231629；新截图另存，不覆盖旧证据，像素人工验收仍待。
- 已记录真实失败：初轮render读取performance.now违反React纯度，移到异步/定时；前后端并行共写dist导致ENOTEMPTY，改串行构建通过；首次UI迟到响应测试将带数量的采购tab误当纯文本，修定位并增强展开可见性/浏览器时钟偏差断言，新9项重验通过，产品代码不为此改动。原日志/截图保留。按vite默认short推断新CI元数据断言会拒绝，Source CI现显式github.sha，Hosted结果须真实交付后核实。
- 完整root/基线/默认Browser构建及最终精确main守卫在本任务后续登记，不能以局部PASS冒称全部完成。新feature AINUOKE_PAYMENT_REQUESTS与任务ainuoke-payment-read-panel提供恢复点；真实过滤/分页、新SO接纳/目标、采集/迁移/写入/激活及物料级关联仍独立待Gate，不触账号/真实库、旧演示/窗口、宁波18443/18444，不合并或部署。

### D-139 6086941逐SO隔离快照、有效归属与只读接口

- 日期2026-10-15；Active，D121 Gate5/D135–138的工程实施，不扩大真实读取、迁移、写入或启用授权。新增0025只建独立目标/不可变观察/发布指针，零回填；目标逐SO默认关闭，既有物料Source启用不激活财务目标。Session读取开关默认disabled，无HTTP写入或启用入口。
- 内部prepare固定来源链接、原owner/有效SO、账号、归属代际、目标版本、预期发布代际及采集前时间；publish固定调用前输入后重新查数据库权限、目标与归属，不能将旧采集直接转挂新归属。精确重试不重建，不同捕获并发只允许一个成功；SQL保护不可改删、单调代际、归属与观测时间，读取从原页重建校验防损坏。
- GET仅接受SO UUID，以fresh DB的order.view/ainuoke.view/style_progress.read沿用已批准艾诺科全可见；不查询织序CCT/内部测算成本。逐行原数值/数量含义、未知币种/单位保持，不求和、不换汇、不认定银行实付。十分钟从最早页起，到期隐藏明细，返回只是观测时点事实，不是实时承诺；加工不适用，历史别名不静默重定向财务数据。
- 归一预览与完整证据新增财务目标、双重SO引用快照与指针清单，保留原身份，只输出计数/hash；观察不是执行流水或冻结账目。新内容使旧证明过期，外部生产/财务覆盖不省略；三表全缺的旧演练可继续，部分schema拒绝。
- 新19项隔离PG/session/七角色定向通过；最终Source/纯模型/归一/归属219项中218通过、1项Linux CLI在Windows跳过；typecheck、Server编译、完整源码lint通过。初轮upsert先触发INSERT代际检查，修为独立INSERT/受限UPDATE；迁移断言改用runner实际文件名而非版本号。进一步补齐损坏证据、NULL约束、输入修改和历史别名负向检查。完整root/基线/最终精确门禁后续结果记录任务，不覆盖原失败日志。
- 代码0025、payment-request-store.ts、app/index、normalization-preview/full-evidence及新集成测试；[本阶段任务](tasks/active/ainuoke-payment-snapshot-storage.md)与冻结storage-engineering-2026-10-15报告提供范围。真实过滤/分页、目标清单授权、实际采集/发布和侧栏仍未完成。旧Source/G5及私有报告保持，Git网络恢复规则不撤销，不合并或部署。

### D-138 6086941显式合同页与完整快照纯模型

- 日期2026-10-15；Active，D121 Gate5的技术实施决定，不是新增业务规则、正式映射认可或真实操作授权。旧首页v1/page1与读取次数不扩大；新v2逐页模型复用原字段/精确小数/未知值逻辑，保留真实page和局部rowIndex。
- 完整快照构造只接可信Bridge已校验的精确字符串页；显式账号/销售合同/三字段见证，最多200行/2页/两遍。缺页、混单、计数/顺序/两遍变化、重复整页和来源过期拒绝；重复业务行保留，不把id当跨时间事件主键。
- 时效按最早页固定10分钟，不以较新尾页续期；只表示观察到的两遍一致，不是上游事务或授权边界。未来持久化/有效SO/来源profile/fresh权限和真实过滤核验均仍需独立Gate，当前无SQL、HTTP、Source接线或激活。
- 不汇总Num/金额，不推币种/单位或银行实付，不把理论与实际采购差异当冲突。D136的精确旧观察证明不向新capture或其他金额字段传播。
- 代码payment-request-observations.ts显式v1/v2与payment-request-snapshot.ts；104相关Node（原79＋新25）、typecheck/Server编译/增量lint合成通过。首轮回放样本先触发时间倒退，改为单页隔离重复capture断言；初始类型收窄错误已修，旧失败不覆盖。完整根/基线与精确门禁后续按日志收口。
- 原Source48b63101、G5c54a和全部真实私有报告保持。所有真实读取次数用完，新许可尚未收到，未访问凭据/报表/业务DB或环境；快照纯模型不能宣称6086941已接通。



### D-137 两合同完整分页只做有界技术核验

- 日期2026-10-15；Active，落实D121 Gate5/D135–136，不扩大真实读取授权。新增ReadContracts显式动作，与原首页模式互斥；未注册Bridge/持续Source catalog，未接UI、正式快照或DB。
- 两份已人工确认的私有样本按文件hash与来源账号指纹固定，ExpContractNo/is为待真实验证的查询候选；所有来源行精确合同归属、完整分页、正向样本和两遍内容必须一致。最多2合同×2页×2遍、100行/页、8报表/9HTTP；4MiB/响应、16MiB累计报表预算、180秒。空/混单/缺页/重复整页/变化/超限失败，不去重或补0。
- 失败只保存安全、可解析且秘密筛查通过的私有原文；闭合代码/阶段/计数离开进程，拒绝证据不作为正式来源。Windows物理路径、ACL/hash/忽略目录和匿名stdin复用；原首页仍2HTTP/1report，不改数量、币种、CCT或正式齐套。
- 79Node/114Python及类型/Server编译/lint为合成工程与原文件离线检查；没有新HTTP或凭据读取。全部真实次数已用完，下一次运行需给出具体固定范围并获得新明确授权，成功也不自动写业务DB/绑定/激活/部署。
- 范围、私有选择hash、代码与后续Gate见tasks/active/ainuoke-payment-contract-probe.md及冻结contract-probe-engineering-2026-10-15证据。不是全表财务验收、跨时间分录去重或银行实付确认。




### D-136 货款申请出运分配数量与逐行币种证据

- 日期2026-10-15；Active，细化D121 Gate5/D135。用户核对两个受保护样本，确认6086941.OutStoreNum是本次申请关联的实际物料出运分配数量，两行以个计量；采购合同币种为人民币/CNY，申请采购金额、应付金额、本次申请金额沿对应采购合同币种。两行的单位/币种值不推广全表。
- Num/OutStoreNum/bgNum/kpNum与所有金额各自保留；数量不同是合法业务事实。RMB/人民币只规范为CNY标签，不新增汇率换算；缺币种/预付款继续unknown，不默认0或已付。6087050同名字段仍独立命名空间。
- 最小后续工程先做离线、精确decimal文本和逐行来源观察；来源id未证实前不生成稳定财务事件、不去重求和。人工确认绑定来源指纹、采集时刻、raw hash、页/行、完整行hash及采购合同，来源变化/冲突不自动沿用。该确认输入只属于可信集成层，不作为客户端权限声明。
- D135的读取范围/次数及安全边界保持；尚未证明固定合同过滤/完整分页、全量币种/单位或跨时间明细身份，不能解除正式对账侧栏“待接入”。没有新真实读取/账号/DB/绑定/激活/部署授权。
- 公开用户确认与原报告hash见tasks/active/evidence/ainuoke-payment-request-probe/row-context-confirmation-2026-10-15.md；真实行身份只在本机受保护报告。代码payment-request-observations.ts、Python同名模块及同名负向测试，工程范围见tasks/active/ainuoke-payment-request-read-model.md。



### D-135 货款申请明细先独立有界只读核验

- 日期2026-10-15；Active，落实已批准D121 Gate5的6086941接入方向。本阶段只交付合成工程，不扩大真实Source范围，不代表获得新报表真实读取授权。
- 复用现有AinuokeClient登录和报表契约，固定6086941第1页100行；不注册进Bridge/持续Source catalog，不发现合同、不翻页、不重试、不连接织序数据库。单响应4MiB、子进程120秒，禁止代理与重定向。
- 用户提供的49业务字段与id、vDom_PayRegister、样本公式均为候选。原始响应UTF8数值文本保留；Num/OutStoreNum/bgNum/kpNum、Price/kpprice、cgGoodsAmount/GoodsAmount、BGAmount/kpamount各自独立。未知、零、负值和重复行原样保留，不默认币种、不把申请付款认定银行实付。
- 凭据仅由显式-ReadFirstPage的私密终端进程消费；raw仅保存在新建、Git忽略、owner/SYSTEM ACL保护报告。公共回执只给静态字段覆盖/计数/日期/hash，秘密字段和密码/token回显拒绝；字段存在不表示映射正确。
- 代码8655a052f22458506094fa0941ba7344fbff9bff：server/ainuoke-source/payment-request-probe.ts、Python同名模块与私密PowerShell包装器；37项Node、83项Python及24项既有预检为合成验证。真实读取先批准固定范围，字段/单位/币种/身份核实后才做正式映射与UI接线。详见tasks/active/ainuoke-payment-request-probe.md。


### D-134 团队物料展示排序与来源事件侧栏

- 日期2026-10-15；Active，落实已批准D121 Gate5，不改变正式数量、齐套、商业权限或真实Source范围。
- 面料优先并按需求数值作临时展示排序，不持久化跨单位合计；辅料按团队关键词第一个字面匹配优先，未匹配及相同优先保持来源顺序。空配置不猜默认，设置不可读时保留来源顺序并提示。
- 团队设置管理员/物控可维护，其他有订单/物料查看权的角色读取同份状态。0024仅提供空设置表/不可变请求回执和精确preset权限；CAS、actor幂等、新请求撤权复核和审计同事务。只在一次性DB演练，不修改真实账号。
- 展开仅控制颜色/规格表格，事件移入原Foundation Drawer；逐需求/逐事件保留身份、数量、单位、去重与源采购价格，多余仓沿D133，理论与实际分离。对账未接通明确标识，不假造付款状态。
- 新进度设置页受Server snapshot默认关闭能力约束；生产/关账路由未开，未知保存输入锁定并用原请求确认，导航/退出保护未保存输入。批准范围与验收要求见tasks/active/evidence/material-source-integration/material-display-approved-scope-2026-10-15.md；代码features/style-progress、server/material-progress-settings及0024。新像素仍待测试和人工验收，不冒称合并/部署。


### D-133 入库多余仓作为独立来源事实展示

- 日期2026-10-15；Active。用户逐单核对确认rknum31条之外另有num_dyc1条，二者均为条；保留实际到货32的解释，不把该样本扩展为库存公式或正式齐套改动。
- 既有6087050 Adapter保留原始字段；最小只读Projection仅按入库事件sourceReferences取一致num_dyc，重复行不求和，空值未知、非法/负数/冲突/部分缺失分别标识。单位沿用可信逐需求QtyUnit或已有精确人工确认，缺失不默认个、冲突不提供可汇总数值。
- DTO将多余仓与rknum分开，includedInInbound=false；不改TotalNum/cgnum/rknum、事件身份、理论与采购事实、正式齐套和数据库。单据明细增加已批准列，后续侧栏复用；原历史报告和私有业务标识保护。
- 用户确认、旧来源哈希与技术边界见tasks/active/evidence/material-source-integration/num-dyc-confirmed-scope-2026-10-15.md；代码excess-warehouse.ts、projection.ts及合成负向回归。工程/远端/真实激活/人工验收分别记录，不扩大任何操作授权。


### D-132 旧Source成果与订单身份/商业/历史归属受控整合

- 日期2026-10-15；Active，实施已批准D-121 Gate5，不扩大真实来源、写入、窗口或部署授权。
- 合并保留D113–120与D121–131：单位人工确认仍私有且限定源/账号/具体SO/完整证据，不因有效归属自动迁移确认；数量0颜色保留来源null及待确认语义，物料unknown不变0。
- 列表/详情物料读取按请求在同一只读RR事务捕获权限、有效归属、来源run及快照上下文；批量不跨run、不回退历史epoch。新请求重验数据库权限。合同业务类型决定是否读取来源，不能用原始创建入口漏掉已归一有效合同；历史别名不展示当前物料提醒。
- 顶部退出沿用用户批准菜单，额外复用报价未保存弹窗与准备未确认请求保护。退出失败保留内存草稿/会话，不静默丢弃。旧共享Order CCT写价和经销报价直接SO不恢复。
- 两支发布证据保留：当前G1–G4线性链保持；Source21da完整manifest归档，非决策冻结工程报告以原日期/hash加入清单；DECISION统一以后续前向版本记录，不将两条决策历史伪造成线性祖先或覆盖旧PNG。守卫同时保留完整链、唯一叶、Git祖先与全部负向用例。
- 代码：server/ainuoke-source/reader.ts、read-service.ts、order-alerts.ts、AppShell/QuoteEditor及相关回归；本地工程与最终精确提交验收分开，范围见tasks/active/material-progress-integration.md。没有真实采集/迁移/部署/合并。

### D-131 共用物料Normalizer以完整元组校验短哈希身份

- 日期2026-10-15；Active，落实来源身份可信及不错误汇总要求，不改变已批准业务规则或ID。
- 32位短哈希仅作索引，同批相同ID须有相同结构化规范身份元组；需求/四类事件/Raw任一碰撞阻断整个Preview。真实重复来源继续归并，356两来源一采购事件、115.50理论与118实际独立。静态错误不含业务字段。
- Excel/API共用入口实施，Server只读继续复用既有incomplete清空保护；不重写历史ID、Browser namespace/schema、单位或正式计算。不将合成碰撞推定为真实异常根因；跨批与artifact hash仍另行评估。
- 代码及验证：material-normalization-pipeline.ts、material-identity-collision.test.mjs，16项定向及根840通过；完整类型/Server编译/lint通过。未真实读写、部署或合并。完整边界与原红测证据见tasks/active/material-identity-collision-guard.md。
### D-130 翻单准备现有页面接线与未核实请求恢复

- 日期2026-10-15；Superseded by D-144，落实已批准D121/D129，不改变合同唯一创建、加工批次或商业版本规则。
- 既有Foundation准备弹窗可显式选择未确认经销Quote/Revision/PriceVersion；可信合同SO认领后由owner/admin选择准备补血统。准备需求和合同数量可不同，拟报价不采用CCT或金额。缺拟用依据、撤权不可见、来源删除/变更分别提示。
- 未核实创建/采用先写入独立tab-scoped Server命令缓存；不读写Browser账本/Seed/IndexedDB。刷新仅恢复原请求，人工GET回执核对或精确重试，不自动POST、不换requestId覆盖；损坏/未来缓存保留。缓存边界与关闭标签页限制见DATA_LIFECYCLE，不把sessionStorage称长期业务存储。
- 明确稍后核对可保留请求再离开，未知结果直接关窗阻断；成功回执不代表当前血统，重新读取当前状态。只释放精确本人请求，不全局清缓存。服务端依旧fresh权限、CAS、唯一receipt和原子审计，缓存不是身份授权。
- 实际浏览器暴露多个相邻详情组件共用同key，状态变化时重复挂载卡片/弹窗；按语义前缀独立key修复，并断言始终一份认领卡片。不是布局改版。
- 新只读v2准备页/本人创建回执/允许的报价名称投影与条件搜索；Source CI加入客户端和合成浏览器命令。工程结果独立冻结于阶段报告，不声明远端CI、人工验收或真实部署通过。
- 代码：preparation-client/outbox、PreparationQuotePicker/AdoptionDialog、ServerOrderPreparationCard、preparation-adoption.ts和order-preparation-ui.integration.test.mjs。不新增SQL、不操作真实账号/DB/Source、宁波或18443/18444，不自动合并。

### D-129 翻单准备关联与合同后采用、可信加工身份读取

- 日期2026-10-15；Superseded by D-144，落实D121已批准的准备、血统与商业独立规则；目前后端候选，未真实激活。
- 0023前向新增拟报价精确上下文、不可变采用receipt和profile当前准备引用；没有SO创建、数量/交期、Source或价格写入，没有旧准备/类型回填。未确认Quote可作意向，后续金额必须独立显式采用。手工血统修订清当前准备指向，旧采用历史不删。
- 工程选择：准备是参考意向、不是客户下单批次。不同可信合同SO可显式参考同一准备/Quote，不做全局去重；同SO当前重复采用及请求重试有独立处理，仍保持一可信合同一有效SO。
- owner/CAS/fresh角色/血统锁、防环与原子审计复用；新引用进入归一逐行hash及普通SQLfence/alias/pause保护。旧proof不自动改hash或重签。当前报价上下文失效只显示提示，不静默覆盖实际价格。
- 实际红测发现processing标签无合法消费也能通过商业preview，identity facade现与列表同用可信consumed批次/精确来源语义；历史未证实类型保持unclassified且原字段/价格保留。不是把DeliveryPlan冒称生产模块或自动历史修复。
- Source CI补上有效归属/受控执行/暂停/历史来源/复核及准备采用测试；权限contents:read、Hosted合成测试、无部署/凭据入口不变。具体代码server/sales-orders/preparation-adoption.ts、preparation-source.ts、identity-service.ts与0023；回归order-preparation-adoption.integration.test.ts。UI与远端交付另行收口。

### D-128 Gate4 发布复核方案、当前权限与相关血统指纹

- 2026-10-19 状态：Partially Superseded by D-144。岗位复核公开写入口退役；既有证明、历史读取、权限与覆盖证据保护保留，下文不是重新开放入口的依据。

- 日期2026-10-15；原批准范围：落实D121已批准独立复核/历史保护，不改变正式创建路径、数量、货币或实际操作授权。
- 复用0019不可变proof，管理员内容键幂等发布并事务审计；可信生产/财务岗位读取待办、精确方案/当前签名状态及历史分页。默认未配置真实Adapter/permit，发布和状态查询不授权执行。
- 全库身份/血统hash会错误使无关新SO触发全员重签，改为拟root可达引用链、缺失叶边及相关身份epoch；相关变化/循环与所有目标完整引用/外部冻结数据仍守卫。原hash/proof不改，新指纹须新复核。
- Fresh role/order.view/授权tuple保护；财务复核说明沿用金额字段权限，作者身份不绕过撤权。NaN不能绕过冻结来源或一小时许可。旧成功发布可回历史receipt，失效状态独立校验。
- 代码normalization-review-access/workspace、execution-service/full-evidence/coverage及app；21合成工作区、30执行/45归属及[模块边界](features/ORDER_NORMALIZATION_REVIEW.md)。UI还未接线，未远端交付/真实迁移/归一/部署。


### D-127 Gate4 历史来源原身份与采集上下文

- 日期2026-10-15；Active；落实D121已批准的原身份、来源绑定及历史流水保护，不改变单位/数量/创建路径或真实操作授权。
- 历史material快照按原sales_order_id/run_id查询，不自动改向当前root或相加；提供当前归属仅供导航。历史投影保留数量/事件，但不作当年或当前齐套判断。
- 未发布0022为新采集保存完整scope/source_link/order version；旧NULL上下文保持未知、不用当前事实回填。已知来源合同绑定/镜像身份不可删除重写，当前非身份观察仍可更新。
- Server session/fresh权限、固定profile及readonly事务、字节/分页/hash/epoch/合同身份校验；默认未接通关闭，不网络取数/接触凭据或CCT，不扩大真实Source范围。
- 代码证据0022、server/ainuoke-source/history.ts及service/reader/app/index；17项定向/45项归属合成回归。[模块边界](features/ORDER_SOURCE_HISTORY.md)。浏览器历史UI/整个G4及真实验收仍待，不能把本阶段当作完成归一上线。


### D-126 Gate4 新命令暂停与兼容回退

- 日期2026-10-15；Active，落实D121已批准回退边界，不扩大真实写入授权。
- 0021单行DB控制及不可变模式历史，暂停新SO、价格采用/当前头、归一/纠正和旧订单CCT写入。模式变化CAS/原因/数据库actor，持行锁排空已有事务；不移动任何业务历史。
- 当前进程enabled/frozen配置只能收紧，HTTP不提供控制写入。readonly/准备及既有来源刷新仍可用；首次绑定/新增需要新SO时被DB统一阻断。不是全库只读，Browser/legacy及外部writer不由它假称覆盖。
- 原main Server实际编译/启动校验拒绝新schema，不能直接回退旧镜像；支持使用已验证兼容的新schema候选关闭新命令，真实暂停/重开/切流/恢复仍须具体授权。没有实际改环境变量、账户、DB或部署。
- 代码：0021_order_command_control.sql、command-control.ts、server config/index/app；18项控制/原Server演练及[模块边界](features/ORDER_COMMAND_CONTROL.md)。旧Docker/Browser及真实恢复不冒称通过，历史Source/UI与整个G4仍待。

### D-125 Gate4 有效归属与普通SQL写入保护

- 2026-10-19 状态：Partially Superseded by D-144。归一不再是公开业务操作；有效归属解析、SQL 防绕过、不可变身份/流水保护继续保留，不执行真实归一。

- 日期2026-10-15；原批准范围：落实已批准D-121归一/历史保护计划，不扩大真实操作授权。
- 0018保留原UUID/绑定/流水，0019完整有界证据及独立复核，默认执行关闭；0020在已声明Server表增加普通DML防绕过。来源事实仍写不可变原owner，当前快照按有效根和精确generation发布；不搬移或加总旧计划/价格/流水。
- 新订单商业/执行不能写历史别名；参考记录可以保留历史身份。加工批次身份不能与合同归一，后补可信绑定也必须维护合同唯一。过期RR快照用事务write epoch阻断，数据库约束不能证明所有旧镜像功能兼容。
- Source证据不可改删，旧null scope/epoch历史保留，新发布不冒称旧快照当前。此条记录时点运行态关闭策略仍待，后续本地实现见D126；历史Source/UI、真实外部覆盖、恢复演练及具体授权仍待，整个Gate4不提前标完成。
- 代码/测试：0018–0020、effective-attribution.ts、normalization-execution-service.ts、effective-attribution-write-guards.integration.test.ts；[当前阶段](tasks/active/order-effective-attribution.md)。只在独立工作树/一次性合成PG验收，未PR交付、合并、部署或真实迁移。

### D-124 Gate4 历史订单复核案件与覆盖证据

- 2026-10-19 状态：Partially Superseded by D-144。公开归一案件/复核写入口退役；未知外部流水不推断无流水、原历史保留和内部防护继续，下文交互仅作历史。

- 日期2026-10-14；原批准范围：落实D121批准计划的预览/案件阶段，不扩大真实操作授权。
- 来源观察、交付计划和商业版本不等于生产执行；无法覆盖Browser/外部生产或财务时维持unknown，禁止以Server无行推导“无流水”。有限引用摘要不是归一执行令牌。
- 规范化SO对唯一案件、不可改写事件、fresh受信管理员权限、请求幂等/CAS和事务审计；撤回/重开保留历史，不改订单有效归属、创建身份或执行记录。
- 复用现有订单中心Foundation管理员弹窗；保存结果不确定保留原请求，证据变化要求重新预览。不新增生产route或实际归一按钮。
- 证据：0017_order_normalization_cases.sql、normalization-preview.ts、normalization-case-service.ts、normalization-case-dialog.tsx及[模块边界](features/ORDER_NORMALIZATION.md)。36定向/5浏览器为本地合成验证；完整Gate/远端/人工验收另行记录。此条证据为预览交付时点；后续有效归属/受控执行进展见D-125，不承诺整个Gate4完成。


### D-123 Gate3 加工下单批次与双入口共用消费

- 日期2026-10-14；Active，落实已批准D-121，不扩大真实写入授权。
- 一次客户下单使用稳定批次身份；同报价/同PO可有多次合法下单。相似性仅提示，不能替代批次唯一消费。0016为前向增量，真实迁移未执行。
- 登记/确认/取消与消费独立授权，fresh DB grants及基础订单/报价/工价查看共同保护。每批独立事务，SO、processing身份、不可变商业采用、消费与审计原子提交；重试/双入口/并发不能重复建SO。
- 订单中心导入及报价中心推送共用弹窗/API；参考订单搜索仅建立血统；当前版本名称不是历史价格快照。终态不能回改，未消费内容改变采用取消后另登记，旧记录保留。
- 来源类型/精确版本变化阻断未消费批次，已消费记录仍返回原SO。工价零与未确认严格区分，不伪造艾诺科合同或流水。
- 代码：0016_processing_order_batches.sql、processing-batch-service.ts、processing-batch-dialog.tsx；验证及限制：[Gate3证据](tasks/active/evidence/processing-batches/gate3-results.md)。未合并、未部署、未人工验收；G4历史归一/G5来源页面仍独立。


### D-122 Gate2 独立订单商业版本与基础来源读取边界

- 日期2026-10-14；Active，落实用户批准D-121 Gate2，不扩大真实写入授权。
- 报价CCT是确认来源；订单当前价仅来自明确采用的不可变版本。旧Order CCT写接口拒绝，未采用不回退共享价；D-084/D-087共享当前价在订单读取部分由本项替代，报价确认与权限保护保留。
- 采用精确Quote/Revision/PriceVersion及来源版本指纹，记录来源确认时间与采用时间。每单CAS、请求幂等、金额权限与审计原子提交；修改报价或另一订单不覆盖已采用值。
- 用户批准计划中的差异预览/显式采用界面，复用Foundation；路径范围见release/ui-changes/order-commercial-versions.json。合成浏览器通过不等于人工验收。
- 基础来源创建/刷新不依赖认领侧表，冻结旧工具不暗中扩大迁移；正式列表/详情继续展示认领。此修复必须回到Gate1独立交付基线。
- 证据：0015_order_commercial_versions.sql、server/sales-orders/commercial-version-service.ts、commercial-source.ts、commercial-legacy-preview.ts、server-order-commercial-card.tsx。当前仅本地工程，最终发布门禁/全回归仍以CURRENT_STATE记录为准。
- 真正Server关账及历史归一另行Gate，不宣称已有完整冻结接线；真实历史价格回填另行批准。

### D-121 订单创建身份与商业依据分离（已批准，分Gate实施）

- 日期：2026-10-14；状态：Partially Superseded by D-144。合同/加工创建身份和历史保护继续；认领、转交与合同前准备已退役。
- 用户明确执行修订版最终计划。合同类SO仅可信合同接纳；加工类按稳定下单批次，两个入口共同幂等；同报价多次真实下单合法。
- 保留不可变创建历史、来源唯一约束和执行流水。新增侧表认领、独立血统与翻单准备；准备不能承载正式执行。
- 替代旧未批准经销报价直接建SO方案；D-084/D-087及后续金额权限中共享CCT的订单读取策略由Gate2替换，权限保护继续有效。Gate1代码仍未实现该替换，不提前宣称价格隔离。
- 用户批准现有订单页新增认领、转交、血统与准备操作及列表待认领状态，复用Foundation；不授权其他页面重设计、真实迁移或部署。
- 代码证据：0014_order_identity.sql、server/sales-orders/identity-service.ts、server/app.ts、server-order-identity-card.tsx。13项领域/HTTP回归及七角色权限验证是当前工程证据；浏览器5项/隔离升级已验证，最终门禁待收口。
- 完整规则、后续G2–G5及安全边界：[订单身份计划](tasks/active/order-identity-program.md)。旧工作树/旧决策证据保留，真实历史分类及归一另行批准。

### D-120 隔离四单两小时有界采集
- 日期：2026-10-14；状态：Active。用户明确授权现有隔离四单每10分钟一次、2小时后停止。固定四单、原独立目标，最多12次，无自动续期/扩单/新增绑定；失败停止，保留数据。此授权不涉及宁波/18443/18444、正式账号、main合并或部署。
- D119首绑/原两轮历史记录保留，新窗口单独绑定目标/时间/操作工具身份；到期停止采集，应用仍可访问，快照正常过期。证据[scripts/isolated-source-window.mjs](../scripts/isolated-source-window.mjs)、[窗口结果](tasks/active/ainuoke-bounded-window-2026-10-14.md)。

### D-119 显式小范围首次绑定
- 日期：2026-10-14；状态：Active；用户要求继续实施小范围首绑，真实写入/激活前具体范围确认。
- 完整当前账号可见Discovery保留，只抓显式1–25个合同的颜色；复用既有selected mapper及首绑事务，独立hash域绑定所选范围，空账本/精确重试不变。不得截断Discovery、借受控新增绕过首绑或扩大重试范围。
- 不自动启动scheduler；首次写入与两轮真实刷新仍需隔离目标授权。代码server/ainuoke-source/binding.ts、cli.ts；[工程证据和待授权清单](tasks/active/ainuoke-selected-first-binding-2026-10-14.md)。

### D-118 需求级人工单位与采购责任确认
- 日期：2026-10-14；状态：Active；依据用户对限定单位/两次采购/工厂自购的明确回执及继续推进要求。
- 复用原始6087050 Adapter/Pipeline，人工事实与来源原值分开。确认须匹配合同、需求及来源单位/身份/采购范围，记录确认人/时间/引用；来源变化失配不应用。缺单位不默认个；只支持经确认的1:1语义，不增加换算公式。
- 两笔采购事件保持独立，理论数量不加倍；该批单位等价不证明尺寸错误首批可用于生产，齐套仍待可用性确认。工厂自购需求/来源自购原值/流水保留，只从国贸跟进范围排除，不虚构到料或采购0。
- 当前是只读候选和默认关闭的可信注入端口，无真实确认持久化或激活，无HTTP确认写接口。代码features/ainuoke-material-progress/confirmed-facts.ts、projection.ts、server/ainuoke-source/reader.ts；证据见[tasks/active/material-confirmations-2026-10-14.md](tasks/active/material-confirmations-2026-10-14.md)。

### D-117 待定颜色记0与订单异常列
- 日期：2026-10-14；状态：Active；用户明确要求颜色数量未定时设置0，订单列表新增异常小框“数量0”“单位为空”等，并提供示意图。[批准与工程范围](tasks/active/order-list-alerts-2026-10-14.md)。
- 替代D-116中“具名空数量在织序保持null”的条款：仅当具名颜色SizeNum和所有SizeN均空，织序投影/新首绑颜色量为0；原始Snapshot及sourceQuantity:null保留，quantityPendingConfirmation:true记录暂定语义。不把负数、非法值或已有分码的空总数变0；无名全空仍排除，物料未知数量规则不变。
- 异常列为明确批准的局部UI新增，不改其他列/导航/布局策略。标签可扩展，但只能展示已有可信判定；当前数量0/单位为空/单位冲突/来源过期/来源未就绪。不把失效来源显示为无异常，不泄露物料详情或商业金额。
- 不授权真实数据库写入/回填、Source首绑或持续激活、部署或合并。工程证据为纯Adapter、一次性数据库/HTTP、隔离Chromium和旧私有报告离线重放；旧订单颜色不会被调度自动改写。

### D-116 重复有效采购与空颜色占位规则
- 日期：2026-10-14；状态：Active；用户明确确认。曾因客户首次提供的标签尺寸不正确再次采购，两笔采购均有效且均已付款；不能把不同采购单仅因物料/数量相同而去重、作废或抵销。真实单号只在本机受保护核对清单保留。
- 用户随后确认这批标签中“只/个”严格1:1；此结论仅适用于私有核对清单限定的物料与批次，不是全物料别名。正式受控映射尚未接入，现有逐需求冲突保护保持，下一候选须同时保留原始单位、原始事件及确认范围。不得据已付款推断首批物料仍适合生产，不把理论用量加倍。
- 用户规则：有颜色名称的行必须保留，即使数量为空；颜色和数量均空的占位行可从实际订单颜色中排除。实现保守检查 CnColor、SizeNum 及所有 SizeN 均为空（非零、非非法值），仅排除投影，保留全部原始行/数量/身份和排除原因。纯空占位重复身份不再错误阻断；有真实颜色的身份冲突仍阻断。
- 历史条款（具名空数量保持null）已由D-117用户新决定替代；本条重复采购、原始来源保护、单位范围与纯空占位规则仍Active。旧时点的阻塞和验证事实保留在Git证据中。
- 代码及负向验证：6087105 Adapter、`tests/ainuoke-garment-color-size-source.test.mjs`、`tests/ainuoke-material-progress.test.mjs`、`server/integration/ainuoke-continuous.test.ts`。不授权真实数据写入、Source首绑/持续激活、UI改版或部署。
### D-114 采购双数量事实与持久隔离本机演示
- 日期：2026-10-13；状态：Active。接续用户本轮任务书。采购合同实际执行数量与理论用量是两个不同业务事实；差异不是自动冲突、错误、超采或浪费。没有完整采购目标契约前，不全局替换TotalNum/requiredQuantity，也不改正式齐套与去重公式。
- 已确认三个用户样本的理论与实际采购均正确，356两来源行仍归并一事件。最小定向原始验证证明这些样本的 `Num*(1+Lost/100)*StyleNum` 对应用户确认理论；此样本不授权把全量TotalNum都叫理论，或把全量Num字段语义声明已人工确认。新增只读来源测算明确unverified/observation-only，缺失、不一致或单位不可信时不作跨口径差值。业务主数量和四流独立保留。
- 用户已授权Codex自行用本机受限CredentialFile执行必要的固定报表只读诊断，凭据仅由短命进程消费，不进模型/argv/env/报告/Git。成功全量证据不重复读取。原始问题字段与真实标识只入受保护ignored私有明细；公开仅匿名结论。
- 用户本轮授权：先验证实际本机daemon、资源不存在、归属、镜像/源码与数据库身份，再新建独立Docker project/DB/network/持久volume，使用合成或明确获准脱敏fixture运行真实Server/P6。停止保留卷，不使用两小时自动删除。未授权任何现有业务库/真实账号变更、真实Source激活/持续采集、宁波/18443/18444部署或自动合并。
- D113的原无DB预检阶段及历史执行边界保留；本条仅更新后续有限诊断与新隔离fixture演示授权。真实持续展示、人工业务验收与宁波晋升仍单独记录。证据见[质量与数量Gate](tasks/active/evidence/ainuoke-live-demo-readiness/quality-and-quantity-gate-2026-10-13.md)。


### D-113 本机真实演示先完整无数据库预检
- 日期：2026-10-13；状态：Active。用户授权合并#107，随后“继续”接续本机真实Source演示准备；原UI/真实账号/织序业务DB/部署/新PR不自动合并边界保持。此项不授权初始化任何真实或演示数据库。
- AI工程选择：复用既有bindings及material collector、正式Bootstrap Preview和Material Projection，完整读取当前账号全部可见合同的颜色及四流；两个worker各沿用600秒/100000行/32MiB与10分钟freshness，不按状态排除或抽样、不中途缩小首绑范围。前后及跨阶段Discovery事实不一致、超预算、漏页/合同失败关闭；缺颜色按enrichment保留，未知数量/单位不填零或“个”。
- 真实读取由用户在私密终端执行；凭据经匿名stdin，不进入Codex上下文、argv/env/DB/Git/报告。可由用户自己选择严格权限的本机两行凭据文件，助手不提取密码；宽权限拒绝，不修改原文件。Windows报告使用当前用户/SYSTEM DACL及ignored目录，Linux保护沿用owner-only；不需SeSecurityPrivilege/SACL修改。
- 完整只读收据只证明读取/映射技术范围，不授权操作人或激活Source，不声明演示就绪。新本机目标检查仅生成plan，不创建容器/DB；实际镜像/端口/资源归属需执行前核实并另行取得具体目标授权。后续停止保留数据，不将合成脚本两小时自动删除用于真实验收。
- 推荐首轮演示在明确授权的独立本机账本完整首绑/持久快照与2–3次刷新、3–5代表订单核对之后；24小时/故障重启/备份/六角色与受控新增作为宁波晋升前AI建议，不要求填完全部Excel或实现生产/关账。代码/测试/限制见[本轮任务](tasks/active/ainuoke-live-demo-readiness.md)、`server/ainuoke-source/live-preflight.ts`/`demo-plan.ts`、`scripts/ainuoke-live-preflight.ps1`。

### D-112 首轮上线前受控接纳新增艾诺科合同
- 日期：2026-10-13；状态：Active。用户决定首轮上线前支持受控新增合同。
- main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5` 已按用户授权合并PR107（head `31b5f28862d032fc954b3f831888005f14060a1c` 三项CI成功）。调度只刷新已绑定四流，不自动建单或更新主信息/颜色；已合并工程提供完整Discovery差异、显式选择1–25合同、只读预览、来源重取、事务内幂等接纳与可信审计。精确重试核对已存镜像；来源/接纳互斥与权限重验。尚未真实激活或部署。
- 来源缺失、身份漂移或权限变化阻止接纳，绝不硬删旧订单；既有订单主信息/颜色自动刷新仍是后续独立范围。代码/负向测试与执行边界见 [D-112 工程任务](tasks/active/ainuoke-controlled-new-contracts.md)。
- 此决定不授权真实 DB 写入、来源持续激活或部署。[原决定证据](tasks/active/evidence/ainuoke-targeted-diagnostic/pr104-merge-reconcile-2026-10-13.md)。

### D-111 6087050 QtyUnit 只读逐需求单位映射
- 日期：2026-10-13；状态：Active。用户转述 IT 确认 `QtyUnit` 是每条物料需求的计量单位，同时约束 `TotalNum`、`cgnum` 以及该需求下入库、物料出运、出库数量；用户在艾诺科界面人工核对了目标三行编码。此确认是用户提供的业务证据，不冒称 IT 原始书面回执或全量合同抽样。
- 已核实的私有 6087050 定向报告中，目标三需求四来源行的原始 QtyUnit 均为“个”，三组物料身份/数量与界面核对一致，356 的两来源行仍只是一笔采购事件。公开仅保留脱敏计数与报告 SHA，见[单位确认](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-confirmed-2026-10-13.md)。
- 工程选择：API Adapter 映射 `quantityUnit <- QtyUnit`，只读投影按 demand 检查所有来源行；一致非空才展示单位，空白保持未知，冲突停止该需求的投影数量汇总及状态判定并报告。不同 child Demand 不跨单位求和，不从规格推断，也不改变 `TotalNum`、`cgnum`、理论用量、事件去重或正式齐套公式。历史 Excel 单位列仍无可信映射。
- 证据：`features/style-progress/source/ainuoke-material-api-adapter.ts`、`features/ainuoke-material-progress/projection.ts`、`tests/ainuoke-material-progress.test.mjs`。PR106已按用户授权合并为main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`；不等于真实Source激活、正式持久化单位模型或宁波部署。


### D-110 全合同只读核对与四流代表合同验证
- 日期：2026-10-13；状态：Active；用户明确授权合并PR103，并继续全合同只读核对及采购、入库、出运、出库的代表订单验证；保持UI，不修改真实账号/数据库，不部署，凭据私下输入。
- PR103已在精确head `1de3078dfd0bcb540d87f792f0b43273f294a615` 三项CI成功后，于2026-10-13T00:02:33Z合并为 `8b3f3d811d05182ea1a7f3214eae9d530056fa04`。不把合并视为环境更新。
- 接续D109永久HTTP决定；新增独立显式只读audit，完整读取当前账号可见6086103前后两遍，不按合同状态过滤，核对分页/唯一身份/前后一致。账号可见全集不等于证明账号拥有上游全公司权限。
- AI实施选择：按合同号排序均匀选最多80合同，完整读取其6087050分页，再复用现有页面纯投影，为四流各找最多3个有正数量、日期与单据号的代表合同；80与3是本轮验证预算，不是业务规则或上线验收承诺。不能将抽样说成全部合同物料全量核对。
- 独立audit限900秒来源读取、2000报告请求、100000行/32MiB，原首页probe仍90秒。无DB/HTTP监听/绑定/调度，未知数量不当零，单位未映射不跨物料加总。真实单号与明细仅写本机ignored私有报告；Git证据仅脱敏计数。密码不保存、不传聊天或argv/env。
- 工程/真实回执/不足项见[本轮任务](tasks/active/ainuoke-readonly-validation.md)。新PR不自动合并；首次绑定、持续写入和部署仍另需具体授权。

### D-109 永久接受现有艾诺科 HTTP 传输风险
- 2026-10-13后续：PR103已获明确授权并合并，D110允许更广的独立只读audit；下方90秒/三首页是原probe边界，HTTP永久接受与账号/DB/部署保护保持。
- 用户决定日期：2026-10-12；核实/工程更新：2026-10-13；状态：Active。
- 用户原话：“我永远接受 HTTP 接入的风险，直接推进。同时修复 PR #98 的冲突、过时方案和失效链接，CI 通过后合并。保持现有 UI，不修改真实账号或数据库，不部署。”
- 对已确认来源 `http://61.164.81.194:9043` 的 HTTP 风险接受长期有效，不设置到期时间，不为同一地址反复要求确认。只替代 D105/D108 的该来源 HTTPS/安全隧道强制前置；原订单、权限、UI、数据库和部署边界保留。
- 工程配置使用 `transportPolicy=user-approved-http-d109`，Node 与 Python 独立校验原地址/端口；不全局接受任意公网 HTTP，不改变 TLS 校验、禁止重定向及固定只读报表范围。输出如实标明 `user-approved-plaintext-http`。
- 增加本机私密终端输入：密码隐藏、不保存、不传 argv/env/聊天，匿名 stdin 交短命 worker；不读取旧 Windows 凭据。Linux 持久操作配置仍是仓库外私密文件。探测最多一次登录及三固定报表首页，90秒总限，不连接织序 DB。
- 2026-10-13 用户回传只读探测结果：认证成功；6086103 首页50/总数558，首个可见合同6087105为5/5、6087050为0/0。此为用户执行回传证据，不是助手独立重跑；不证明全部558条覆盖或全部合同物料为空，不代表 Source 激活/持续运行/人工业务验收。
- PR98 已在当前三项 CI 成功后按授权合并；本 HTTP 工程 PR 不自动合并。代码证据：`server/ainuoke-source/collector.ts`、`readiness.ts`、`tools/ainuoke-bridge/ainuoke_bridge/server_source.py`、`scripts/ainuoke-readonly-probe.ps1`；[任务与证据](tasks/active/ainuoke-approved-http.md)。

### D-108 真实来源接入先做无数据库只读探测
- 2026-10-13部分 Superseded：下方历史传输前置仅对现有艾诺科地址由 D109 替代；不连接 DB、首页范围及非激活边界仍 Active。
- 日期：2026-10-12；状态：Active。用户接受统一本机合成演示并明确授权合并 PR100、开始真实艾诺科接入；PR100 于 2026-10-12T14:57:34Z 合并为 `21fbe3b1a7a5968253f923bc904ea067315f00cd`。这不是实际来源、真实账号或上线验收。
- 用户确认仍用原公网 HTTP 地址，其他通道待查；不推断这是放宽 D105 传输规则的授权。现有禁止真实账号/数据库修改、部署及自动合并新 PR 继续有效。
- 工程决定：新增独立 `source:ainuoke:readiness`，先校验私密文件/账号目标，再显式一次登录及固定三报表首页读取；不接业务 DB，不绑定、不持续采集、不激活 Source。零 Discovery 时不声称颜色/物料已核实，不输出原始行或凭据。
- 来源安全传输沿用 D105：HTTPS 或已独立证明端到端保护的字面量 loopback；SSH 到宁波后再访问公网 HTTP 不构成保护。未知通道时继续合成工程，真实凭据探测保持未执行。
- 证据：`server/ainuoke-source/readiness.ts`、固定 Python `probe`、`server/integration/ainuoke-readiness*.test.ts`、[真实接入任务](tasks/active/ainuoke-live-readiness.md)。D106 首绑/调度边界及 D107 登录设计保持。

### D-107 正式 /login 与范围限定的动画登录页
- 日期：2026-10-12；状态：Active；用户决定。
- 用户原话：“要有正式的一个页面，然后正确的路由杠 log in 使用 animatd - login……我希望我的登录页有趣一点。”
- 授权仅覆盖正式登录入口：独立 /login、现有可信 session、安全回到原页面、动画/响应式/可访问性。其余页面继续 D-099/D-102/P6；没有全站重设计、真实账号/数据库/部署授权。
- 用户随后指定 katavii/animated-login（https://github.com/katavii/animated-login；参考 SHA 62f0b80c7694c3dfe07b39c7a85bdd832ff4bb15）；对齐蓝色分栏和四角色互动，以原生 CSS/React 独立实现。2026-10-12 用户随后确认“登录页可以”，批准 PR101 合并；此项只验收登录视觉，不等于订单/物料或真实上线验收。
- 保留 Browser/legacy 与 local-single-user authority，不替换后端、不扩张生产业务路由；凭据仍只经现有 API。
- 代码证据：app/login/page.tsx、app/login/login.css、features/server-auth/components/animated-login-page.tsx、login-route.ts、features/quote-center/components/quote-server-boundary.tsx；回归 server/integration/animated-login-ui.integration.test.mjs。
- PR101 已合并至 3456fe5fc6e213c2e896e4e6a509e28751f1798c；用户授权将 PR100 整合至同一本机合成演示，保留 D-106。当时 PR100 未获合并授权；后续明确验收/合并由 D108 记录，无真实账号/数据库/部署操作。

### D-106 首次订单绑定、持续采集与原P6页面接线
- 日期：2026-10-12；状态：Active。用户明确要求“合并 PR #99，然后从最新 main 建独立 worktree，继续做首次订单绑定、持续调度和现有页面接线。保持现有 UI，先用合成数据测试，完成后提交 PR 并复审。暂不修改真实账号、数据库或部署，不自动合并新的 PR”。
- 本条接续D105首次绑定/调度开发Gate；D105宁波持续展示后上线、D104来源全团队可见、D103织序金额权限不变。首绑复用现有订单/Source Link/6087105，不引入库存账本。
- 受控首次空订单账本绑定：fresh完整Discovery+颜色→预览→目标/previewHash明确确认→fresh核对→整批事务/权限/审计。相同首绑凭证才能幂等重试；旧账本、部分集合、换账号不自动接管。来源缺颜色不等于订单不存在。
- scheduler显式启动，只更新已绑定订单的物料来源快照；错误凭据/授权撤销停止，网络错误有界退避。首绑后新增合同、现有主镜像/颜色刷新仍需后续独立范围，不能冒称自动全生命周期。
- UI接线只复用P6列表/执行详情/物料Control Tower，默认disabled候选开关，保留CSS/列宽/布局/断点；既有入口可用性随能力改变，未支持页面disabled。用户授权功能接线，不授权重新设计。
- 默认API启动不采集；无真实凭据/迁移/账号/部署/人工验收。本机临时合成演示不属于真实上线。
- 证据：server/ainuoke-source/binding.ts、scheduler.ts、cli.ts；server/integration/ainuoke-continuous*、ainuoke-binding*、order-read-capability.test.ts；[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务](tasks/active/ainuoke-continuous-material-display.md)。


### D-105 宁波上线以前持续展示艾诺科订单物料来源

- 2026-10-13部分 Superseded：下方“只允许HTTPS/安全loopback”及“凭据仅Linux文件”的约束，对现有来源按D109接受HTTP并允许不落盘的私密终端探测；其余业务和发布规则保持。
- 2026-10-12后续工程范围由D106接续：首次绑定/调度/页面接线开发已获授权；下方“无scheduler”等为PR99阶段实现记录，真实激活仍未授权。

- 日期：2026-10-12；状态：Active。用户明确批准 feat/ainuoke-server-source、独立worktree、合成测试/PR/复审；禁止真实账号/DB/部署/自动合并。
- 发布决定：报价当前暂时OK；宁波Ubuntu在艾诺科采购、入库、物料出运和出库持续按订单展示后再上线。暂不做独立库存台账；不将生产/关账全部Server化追加为首版前置。
- 仅更新D-098的宁波发布时序，以及D-096“不自动同步艾诺科补数据”的未来开发范围：允许受控Server来源采集与只读展示开发。旧账本不导入、数据不删除、独立DB/volume、明确运维授权仍有效。本阶段不自动创建或修改正式订单；首次绑定与调度留待独立Gate。
- 来源沿用D-073唯一算法与固定catalog，不调用D-074 Browser commitImport，不覆盖手工Effective/ExpectedArrival。独立来源快照不是另一套业务库存账本。首次上线六角色同见已授权Source与采购价，D-103织序金额规则不变。
- 凭据仅未来Linux私密普通文件/执行用户权限，不进聊天/Git/业务DB；原Windows Credential Manager不变。只允许HTTPS或已验证安全通道loopback，不放宽旧公网HTTP。首轮本人账号“全部合同”的用户陈述须真实核实。
- 实现：server/ainuoke-source、0012来源三表、固定Python worker、既有Material DTO；默认disabled、原子发布、过期/失败关闭。无scheduler、无生产路由开放；候选合成PASS不等于真实Source/持续运行/人工验收或部署。
- UI保持D-099/102/P6。本轮上线参数（建议5分钟/30分钟/24小时）为AI建议，待真实速率与业务验收确认，非用户已确认承诺。
- 证据：[功能](features/AINUOKE_SERVER_SOURCE.md)、[任务与复审](tasks/active/ainuoke-server-source.md)、server/integration/ainuoke-server-source*。

### D-104 宁波首批六角色与可信账号管理

- 日期：2026-10-12；状态：Partially Superseded by D-146（固定预设及旧管理交互限制）。来源：用户批准“先用合成账号完成六角色测试…保持现有UI…不修改真实账号、数据库或部署…不自动合并”。真实账号以后用户自行创建。
- 六角色：系统管理员、管理者、报价经理、物控经理、生产经理、财务经理。登录团队可见已授权采集的艾诺科订单/物料/来源采购价；织序金额沿用D-103独立保护。首轮来源使用用户本人账号，覆盖全部合同是用户陈述，未实测；不保存真实凭据。
- 接受建议后的矩阵：管理者/财务只读金额+导出审计；报价经理报价/金额/主资料；物控无织序金额；生产只有工价查看，不授成本/售价。精确keys见server/auth/team-roles.ts。未接Source/Order/Production/Closing不因权限键存在而上线。
- 复用session/RBAC/表/审计/密码基础；设置页/API只允许可信授权管理。缺失预设由显式写入安装，已有差异fail closed，不自动提权旧账号。CAS、自锁/最后管理员保护、修改撤销会话，无匿名注册或硬删除。
- UI只做授权功能接线，保留MasterDetail/Modal/CSS/断点；Server allowlist只加user-permissions设置页，不开订单/物料/排产/关账生产路由。D-099/102/P6保持。
- D-103“角色管理尚未实施”的工程状态由本条更新，金额规则不废止。无新migration或真实账号/DB/部署。合成测试不等于人工验收。
- 证据：server/auth/team-access*.ts、team-roles.ts、features/permissions/server/、server/integration/team-access*；[任务与复审](tasks/active/ningbo-first-team-access.md)。

### D-103 Server 商业金额的独立查看与修改授权

- 2026-10-19 状态：Active（金额字段授权）；订单共享 current 语义由 D-122/D-145 替代，D-104 已补角色管理，D-145 已补逐色价格与加工仅工价。下文旧阶段范围不限制已批准的新实现。

- 日期：2026-10-11；来源：用户 PR93 Gate2 正式批准。金额授权、精确金额、历史与币种保护继续。
- 新增 `commercial.sale.view/edit`、`commercial.labor.view/edit`。正式 Server 管理员默认拥有四键，其他角色默认不增加；不能从 quote.cost、quote.confirm、order.edit 或客户端角色名称推导。既有可信 `role-server-admin` 由目录同步幂等补授；新管理员复用 bootstrap。未绑定可信管理员角色的旧账号不会按名称自动提权。
- 修改某类商业金额同时需要其 view+edit 及原领域动作权限。CCT PATCH 按实际提交字段授权，未提交字段由事务锁定的当前行保留；显式 null 为合法清空，零为有效值。Quote 端仍检查已保存来源资格、Quote CAS、CCT CAS；linked 工价币种仍由 PV 所有，不能通过空值绕过币种保护。
- GET/PATCH 返回 `commercial-terms-read.v1` 的 sale/labor allowed 或 restricted；无权不返回 value、不伪造 null/0。Quote 历史确认字段、列表、客户文件、内部汇总和日志同样投影/授权，数据库历史与审计不改写。Quote 内部成本仍是 quote.cost.view/edit；物料采购执行价格不纳入商业金额授权。
- 无 schema/migration 新增，不改已发布 SQL。Server 角色配置 UI/API 尚未实施，本次不以 Browser mock 冒充；可信角色关联仍由既有受控运维路径管理，普通角色不会自动获权，也不开放新的生产路由。代码：server/auth/permissions.ts、server/confirmed-commercial-terms/、server/quotes/quote-response.ts 与 commercial-save.ts、server/operation-logs/query.ts。
- 本决定不授权真实角色写入、部署、18443/18444/真实数据库/COS操作或合并；当前标量不是未来颜色级价格模型。
- 2026-10-11 用户最终展示补充：测算销售单价/系统最终报价由 `commercial.sale.view` 保护，不归入 cost.view 单独授权；仅 sale.view 也不授予内部成本，列表 garmentPrice 继续 cost.view + sale.view。详情摘要/sticky、PV 卡片、确认弹窗、历史概览、价格构成统一；销售价减 Estimate 汇总还需 sale.view，服务端生成前拒绝越权。保留原成本输入与计算，无法阻止获授权成本用户自行推算，不宣称数学不可推导。补充本条，不新建重复决策；此前待定口径保留为历史记录。证据：QuoteEditor、quote-metrics-view-model、quote-business-view.columnPermissions 与[本轮验收](tasks/active/commercial-amount-read-security.md#最终价格展示权限收口2026-10-11)。

### D-102 普通电脑新建立即保留 Server 草稿与可信创建默认值

- 日期：2026-10-10；状态：Active。来源：用户 PR #91 Preview 验收修正明确授权；不是新的计算规则。
- 普通电脑点击“新建报价”即通过可信原子命令创建有编号的草稿，直接进入现有 QuoteEditor；空草稿返回后保留。挂载、刷新、返回及未点击不创建；双击与未知结果使用同一 receipt 核对，不重复 POST。
- 仅替代 D-101 普通电脑两步向导及“取消/返回零创建”的交互要求；加工材料显示不改公式、历史与 linked 来源保护、主数据/预设校验、无预设待完善及 Intake 未实施边界继续有效。原两步验收保留为历史，不作为新交互 PASS。
- PostgreSQL 全局设置保存可空默认报价类型、可空默认制作国家及已有默认预设；预设须 active 且国家一致，多预设不自动选首个。未配置类型仅使用明确标注的经销技术回退；无国家/预设不猜汇率、加成、运费。默认变更只影响未来新草稿的独立 PV 快照。
- **第二轮人工反馈确认（同日）**：正式 Server 设置仅“制作方案管理 → 新建报价默认值”；方案代表工厂/标准，可同国多 ID，横向选择明确 ID 并兼容维护国家。移除系统默认费用/工序 UI，停止未来 Server 创建及品牌资料解析中自动套用这些不可见系统值；保留旧字段原始精度、旧 Quote/历史、单据级与品牌/业务员默认费用。此项仅替代 D-089 的 Server System 自动费用回退及旧全局工序继承，不改变 Browser 兼容规则、公式或既有费用。删除详情两块重复摘要，必要加载重试局部保留；列表首次/主动恢复默认铺满，已有偏好不自动改写。用户确认范围，不是新增推测政策。
- 本轮类型摘要只读；已有类型切换仍 NOT IMPLEMENTED，generic PUT 不开放类型修改。制作参数沿用现有权限及 PV 编辑器；全局保存仍为 settings.global.edit、Bundle CAS/单事务/审计。
- 工程入口：creation-defaults / creation-receipts、QuoteCreationRecovery、QuoteEditor、GlobalQuoteSettingsPage；新增 forward-only 0011，0001–0010 SQL 不改。本决定不授权18444 migration/更新或自动合并。

> D-101 的普通电脑两步交互部分由 D-102 替代；下列原实现及验收是历史证据，其余六项业务目标保持 Active。

### D-101 Quote Intake V1 与共同两步报价创建

- 日期：2026-10-10；状态：**Active 业务目标 / 普通电脑两步交互由 D-102 Superseded；Intake/转换及已有类型切换 NOT IMPLEMENTED**。来源：用户《Quote Intake V1 最终契约固化与实施任务拆分》确认 QI-01–QI-06，后续授权普通电脑两步创建（历史实现）及 D-102 验收修正。Intake字段、状态、权限键及图片方案仍是实施提案，不由此升级为新业务政策。
- Intake 独立于 Quote/Revision/PriceVersion；不生成 Quote 编号或历史，不自动创建 SalesOrder。默认本人范围，可信 session、显式团队权限、一次转换、原图与来源冻结保留。
- 普通新建与 Intake 转换复用两步流程：第一页类型/国家/可用预设，第二页确认参数并完善资料；取消/返回不创建。制作预设维护独立页面，继续要求 settings.global.edit。最终创建复用原 Quote Service/allocator/Repository/审计，保留旧 POST {}。
- 加工隐藏材料不改公式；确认前明确切换当前可编辑 Revision，确认后新 Revision 切换。linked CCT/SalesOrder 事实不清空，generic PUT 必须防绕过。无预设可建待完善草稿，技术币种默认不等于已配置。六项完整规则见 BUSINESS_RULES。
- **精确关系**：补充 D-003 的历史保护与新 Revision 清确认、D-035 的 PV 参数快照、D-088 的 Server 编号及旧 POST、D-090 active preset、D-096 空设置不猜默认、D-084/D-087 共享确认边界。D-029（新建报价主数据 Quick Create）仍适用于品牌/业务员，不适用于将制作预设维护嵌入新建页；未废止其显式保存与保留成本保护。D-097/D-099 的 POST{} 后加工 PUT 是当前实现/历史过渡，新的两步原子命令实施后仅替代新 UI 创建路径；旧 API 仍兼容。D-057 是订单/关账默认币种，不作为 Quote 新默认依据。
- D-100 已由现已合并的 PR #87 使用，本条不重用。电脑端实现复用原Service/allocator/Repository/审计：server/quotes/creation-contract.ts、creation-workflows.ts、server/app.ts、QuoteCreationWizard；0010提供可信用户隔离的持久预检/回执。普通创建两阶段校验业务员/品牌、预设/国家及受审版本；取消不创建，无预设CNY仅技术默认。实施证据见 [两步创建](tasks/active/quote-two-step-creation.md)，原 [实施契约](tasks/active/quote-intake-v1-implementation-contract.md) 的未实施部分仍是目标。
- 本决定本身不授权真实migration、部署、真实数据读取或自动合并。本轮只disposable验证/候选构建，18444新增migration需另行批准。



### D-100 C4.3 DeliveryPlan collection ownership and source-null recovery

- 日期：2026-10-09；状态：Active。落实 D-083；数量与 null 边界由本任务用户明确确认。
- 首次 Ainuoke 创建有有效来源日期时初始化唯一默认行，数量固定为首次 source quantity（含 0）；后续数量变化只投影 short/matched/excess，不自动重分配。首次无日期不建默认行，后续出现日期不自动补建。
- untouched 默认日期清空时保留 UUID/数量并变为无有效日期，日期恢复复用同一 UUID。任何人工 upsert/void（包括同值提交）将整个集合永久变为 user_managed；source 更新不能重新取得所有权。
- 技术：0009 独立集合/行表，集合独立 CAS；source date/quantity 更新在 Mirror 同事务触发器中推进集合版本，防止弱底层 upsert 绕过 D-083。用户命令与内部 source-refresh 依次锁 order root、mirror（仅 refresh）、collection；可信 audit 与业务同事务。行只能作废，不删除/换 owner/重建默认 ID。
- 旧订单无所有权证据保持 uninitialized；migration 无 backfill，首次人工命令可创建 user_managed 集合，不伪造 untouched。
- 证据：`database/migrations/0009_sales_order_delivery_plans.sql`、`server/sales-orders/delivery-plan-*.ts`、`server/integration/delivery-plans.integration.test.ts`。仅 disposable PG；不代表真实 activation、UI 接线或通用订单写入。

### D-099 Quote 原版视觉基线与 Server 能力底线

- 日期：2026-10-09；状态：Active，用户明确批准 UI Baseline Restoration / Server UI Convergence。
- PR64 merge `7658663038b1da504c95086711f627b6dce5c7a0` 的 Quote Center 是视觉/信息架构基线，当前正式 Server 是数据、安全和业务能力基线；Server 化不得成为重新设计 UI 的理由。
- 优先级：数据安全 > 正式业务行为 > 原版信息架构 > 视觉一致 > 代码整洁。复用共享组件；不得回退 Browser 数据/权限、改公式/API/schema、覆盖个人列设置或开放未支持动作。
- 组合单元格只呈现有权限且个人允许显示的正式字段，导出仍使用独立业务字段；缺失缩略图与列表制作快照不猜测/不逐行请求 aggregate。
- 后续用户列表验收明确授权三项修复：组合列宽与独立字段宽度分离、拖动单列不压缩其他列、从合法默认 Revision 附件关系接通只读款式图。沿用受保护读取，不新增存储架构；这是 D-098 允许的实际反馈范围，不追溯改变首轮缩略图延期记录。[修复证据](tasks/active/d099-list-acceptance.md)。
- 这是 UI/架构边界，不是报价计算规则；工程浏览器回归与用户人工 UI 验收分开，真实部署另需授权。D-096/097/098 保持。
- 证据：用户本轮指令；`tasks/active/quote-original-ui-convergence.md` 的版本/代码审计与后续隔离验收。

### D-098 优先形成可使用的报价试用版，由实际使用反馈驱动后续范围

- 2026-10-12范围更新：宁波上线时序由D-105接续，须先持续展示艾诺科物料来源；其余范围控制/验收分维度原则保留。

- 日期：2026-10-09；状态：Active。用户明确要求按可使用版本组织工作，尽早实际完成报价，不无限追加功能。
- 首轮范围使用已合并的基础资料、新报价/成本、Revision/PV、Estimate、确认、附件、客户 Excel/ZIP、内部汇总和只读日志。整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理、缩略图暂缓，不自动成为首次试用前置。
- 工程验证、候选构建/隔离部署、真实部署、人工业务验收分开记录；人工未执行就是 NOT RUN。用户反馈证明必要的范围再单独实施。
- D-096 空数据、旧环境保护、Quote-first、权限/CAS/事务/备份与历史不可变不变。范围锁定不是迁移冻结；新环境和真实部署必须明确目标/授权，不能用 Local Single-User 公网试用。
- 证据：用户 Quote Trial Release Preparation 指令；CURRENT_STATE、AGENTS 与本轮候选验证/交接记录。发布和 Git 参数约定属于工作/运维文档，不是计算政策。

### D-097 Fresh Start Quote authority 显式选择与正式 UI 基本闭环

- 日期：2026-10-08；状态：Active。用户授权聚焦接通正式 Quote list/new/detail，非部署、非历史导入、非全模块重写。
- `NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY=browser|server` 独立于 masters authority 和 writer mode，默认 browser；server 必须 masters=server、writer=writable，build-info/runtime 一致性检查 fail closed。普通构建不得默默切旧环境。
- Server 入口复用现有 Session/Identity/RBAC、正式 QuoteEditor、exact adapter、Q3 master dependencies 与唯一附件 panel/controller；不初始化 Browser 业务 namespace/mock permissions，不以 localStorage/IndexedDB 兜底；不支持的模块直接 URL 也不挂 Browser 页面。
- 创建页恢复既有 processing/distribution 用户选择；不改 POST `{}`/Server 默认经销。加工通过已返回 ID/version 正常 PUT 初始化，失败保留 ID、停止重复 POST、明确类型未确认；仅补创建入口，不放开详情或历史 Revision 类型编辑，不改变计算/权限政策。
- 每个编辑器持有版本/保存 baseline，aggregate 与专用附件命令共用写锁；成功才推进版本，409/不确定结果保留草稿、停止自动重试，精度不可无损读写即拒绝。当前 UI 只支持明确列出的基本动作；Revision/PV workflow、Estimate、客户确认、导出、复制/删除、转订单与日志查看仍待独立接线，不更改旧 Browser 行为或历史不可变规则。
- D-096 historical import NOT REQUIRED 不变；D-093 local-only 与未来远程认证要求不变。代码 merge 不部署、不激活真实 0008/新 DB/storage。
- 证据：`quote-authority.ts`、`production-quote-pages.tsx`、`quote-server-boundary.tsx`、`quote-editor-persistence.ts`、`server/quotes/list-summary.ts` 与 disposable actual Chromium `quote-server-ui.integration.test.mjs`。

### D-096 新系统全部业务数据从空开始，旧环境保留

- 2026-10-12范围更新：D-105允许受控Server来源读取开发；仅替代下文“不自动同步艾诺科补数据”的未来开发限制，不授权真实同步/建单/删除/部署，其余空账本与保护边界不变。

- 日期：2026-10-08；状态：Active，用户明确确认：“新系统所有业务数据，包括基础资料和订单，都从空开始。”
- 新系统不导入旧品牌、客户业务员、面辅料、制造预设、业务设置、Quote/Revision/PriceVersion、订单、排单、关账、款式进度、附件关系、Browser OperationLog 或旧业务账号，不自动同步艾诺科来补数据。保留功能、模型、算法与 API/UI，不重写 ERP。
- Q5 historical import 对当前上线为 **NOT REQUIRED**。Fresh Browser source、迁移专用 freeze、historical rehearsal、Q5 VerifyOnly/Execute 不再是当前上线前置条件；旧工具/测试与历史 PASS 留存。已发生的 Q3 import/cutover 不被撤销。
- “不导入”不是删除授权：旧数据库、volume、Browser namespace/IndexedDB、备份和 COS 对象原样保留。新环境必须使用独立 DB/volume/访问入口，不复用旧 dump 或自动恢复旧 Browser 数据。
- 技术初始化可包含 schema ledger、权限目录、必要角色、显式新建管理员；业务设置无记录即未配置，不自动填公司汇率/加成/运费/预设。新产生的历史 Revision 不可变、null/zero、快照、正常事务/权限/审计/备份规则不变。
- D-091 仍约束真实 schema activation 等运维执行证据与禁止伪造 CRUD；历史 source/projection/rehearsal 字段只适用于不再采用的历史导入路径。D-093 仍仅允许本机开发，无认证 Local Single-User 不可用于 LAN/WAN/多人。D-094 仅是保留的历史附件投影规则，不授权清理源或 COS。D-095 仅在另行授权的历史迁移路径中要求迁移 freeze，不是新空系统上线条件。
- COS real preflight 已 PASS，沿用 PR #73 来源受限的真实证据；不重做 COS 联调，不宣称 runtime storage 已激活。多人/远程认证授权及 Quote-first 逐模块 Server 能力验收仍必须完成。
- 证据：用户本轮明确决定；`server/integration/fresh-start.integration.test.ts`、`server/startup.ts`、`server/auth/bootstrap.ts`、现有 0001–0008 runner 与 Server-only clients；详细空库边界见 `features/FRESH_START_FOUNDATION.md`。

### D-095 Quote migration freeze is independent of Q3 master/settings authority

- D-096 适用范围补充：保留历史迁移 engineering safety contract；迁移专用 freeze/source 时序不再是当前空数据上线前置条件，不改变旧 Browser 数据保护。

- 日期：2026-10-07；状态：Active。落实用户 Q5-C 指令，仅工程实现，不授权真实冻结部署或迁移。
- Build-time `QuoteWriterMode=writable|frozen` 默认 writable；独立于 `MasterSettingsAuthority`。目标组合是 Q3 `server` + Quote `frozen`，不能拿 Q3 frozen 代替 Quote freeze。
- Frozen Quote 只读现有 canonical schema v13 envelope；无 seed、normalize/migration rewrite、legacy merge 或删除。缺失/无效 source fail closed。Repository 和 Quote attachment controller 双层保护；Quote surface 的共享条款和转订单动作也停用。Q3 Server 编辑、无关 Order 附件及 UI preference 不受全局冻结。
- 标准 full backup 保持既有格式且不改 Quote raw bytes；restore/reset 拒绝。旧 URL、附件引用和 IndexedDB 源不清理，D-094 仅作用于 Server projection。
- Frozen preparation 不声称 capture 后无变化，旧标签页关闭必须 operator 显式确认；capture 后才可结合 raw SHA 一致性生成 Q5-B v1 freeze proof。真实窗口和 Execute 另行授权。
- 证据：`features/quote-center/authority/`、`server/quotes/freeze-readiness.ts`、Q5-C repository/export tests 和 isolated Chromium harness。

### D-094 Q5 historical Quote migration clears legacy attachment URL compatibility fields

- D-096 适用范围补充：仅用于 dormant historical projection；当前新系统不导入旧附件/URL/关系，不要求执行此投影，也不清理旧来源。

- 日期：2026-10-07；状态：Active，用户明确确认。Q5-A 只建立工程投影与一次性数据库排练，不授权真实导入或删除 Browser 数据。
- 旧 Browser QuoteRevision 的 `garmentMedia`、`quoteDocuments` 在 Server historical projection 中均清空为 `[]`；正式附件 ID 引用同时依既有排除规则投影为 `[]` / `[]` / `null`。Preview 分别统计源引用与受影响 Quote/Revision；源 Browser backup、localStorage 和 IndexedDB blob 不修改、不删除。
- 这不是附件损坏判定，也不是新的 Server attachment relationship。Q4B 的共享历史附件 metadata 改名/名称快照规则仍是独立的 USER DECISION REQUIRED，不由此决策推导。
- 证据：用户 2026-10-07 明确确认；`server/quotes/historical-preview.ts` 与 Q5-A synthetic/disposable tests。

### D-093 Development phase uses a local single-user identity; real authentication is deferred

- D-096 适用范围补充：空业务数据不降低此模式的本机限制；新远程/多人系统必须先完成真实 authentication/authorization Gate，旧账号资料不复制。

- 日期：2026-10-04；状态：Active、临时开发架构决定；用户明确确认。此决定取代当前开发阶段 Q3B2I-C2 B3/B3-R 的登录/Cookie/session 验收要求，不是生产安全模型。
- 本地 Server Authority 必须显式选择 `ZHIXU_IDENTITY_MODE=local-single-user`，确认无认证风险，并限制 Browser origin 为 loopback。编译产物 `build-info.json` 与运行时模式必须一致；默认 `session`，缺少显式选择不会暗中开启无认证模式。执行状态（2026-10-05）：真实 3001 已部署 PR #64 根路径/正式基础设置统一侧栏修复并通过用户真实浏览器验收，Q3B2I-C2 CLOSED / PASS；本条架构决定保持 Active。
- 每个请求由单一 Server `IdentityAuthority` 提供同一个 `TrustedIdentity` 与完整 `PermissionKey` 目录。`app_users` 既有 admin 行只作为 OperationLog 非空 FK 的技术兼容 actor，公开身份显示“本地开发用户”，不暴露为登录账号，也不要求密码或 session。业务 service 的权限、事务、Origin/`X-Zhixu-Request` 与可信 actor 边界保留；body/header 不能提供 actor。
- 当前 UI 不提供账号密码登录、logout、测试账号切换或用户权限管理入口。旧 `app_users`/`app_sessions`/RBAC schema 与 session 实现保留为 dormant compatibility infrastructure，不清理真实数据或 migration 历史；未来正式多用户认证须独立重新设计、实施和验收。旧根路径 ERP 登录组件保留供非本地身份模式兼容；Local Single-User 的 `/` 已跳转 `/quote-center`，Browser Quote aggregate 仍由 Browser Repository 持有。
- D-076 的 Node/PostgreSQL/migration/逐领域切换与 OperationLog 完整性仍有效；其中“当前必须由 trusted session 派生 actor”仅对旧 session 模式及历史 Gate 有效。D-026 的 Browser mock 账号切换只保留兼容代码/历史数据，不再是当前 local-single-user UX。
- 证据：`server/auth/identity-authority.ts`、`server/config.ts`、`server/app.ts`、`server/index.ts`、`vite.config.ts`、`features/server-auth/`、`features/permissions/components/permission-provider.tsx` 与 disposable PostgreSQL/前端测试。

### D-092 Q3 maintenance serves the reviewed frozen bundle without a database writer

- 日期：2026-09-29；状态：Active engineering safety decision，非真实 cutover 授权。
- Q3 master/settings 的 Browser freeze 与真实 DB writer freeze 必须同时成立。原 Node Server 既提供 `/build-info.json` 又持有 DB client，因此停掉 writer 后，不能由同一容器继续证明 frozen bundle 在线。
- `frozen` 正常 Server 与 maintenance-static 必须使用**同一 image ID**、reviewed revision、build ID/time 和编译进前端的 authority，交接前后保持操作者明确指定的同一 Browser origin。交接脚本核对镜像/端口/运行中 build-info，停止精确匹配的 writer，使用 standalone、无 DB env/volume/Compose DB network 的 static-only 容器继续服务并再次核对 build-info。静态模式不加载 DB config/pool/migration/RBAC/admin，不提供 API；`/maintenance-health` 只表示静态服务在线。不得通过忽略任意容器来放宽 writer guard。
- Docker build 仅接受 `browser | frozen | server`；默认仍为 Browser。生产 runtime 配置与已编译的 build-info 不符时 fail closed；新的静态、构建、handoff 路径被纳入 import/rehearsal reviewed-source guard。真实 Browser profile、独立 D-091 保管位置和实际部署交接仍需后续确认。
- 2026-09-29 split-topology 补充：若 Browser provider 与 DB writer 不同（现场 3001 Windows host frontend、3002 Compose writer），不把二者假装成同一镜像。操作者先释放原 3001；独立、不可变的 `frozen` image 以无 DB 凭据/卷/Compose DB network 的 maintenance-static 占用原 3001。关闭旧 Browser tabs 并签署 freeze evidence 后，另行验证并停止精确匹配的 3002 writer；3001 static container ID、image ID、revision、build ID/time、authority、origin/port 在停止 writer 前后必须相同。容器重建使原 freeze continuity 无效；重新关闭旧客户端并生成新的 freeze evidence。既有 colocated topology 仍使用 same-image handoff。两种模式均不放宽 writer guard，也不授权真实部署或导入。
- 证据：`Dockerfile.server`、`vite.config.ts`、`features/basic-settings/authority/master-settings-authority.ts`、`server/maintenance-static*.ts`、`scripts/Invoke-Q3MaintenanceStaticHandoff.ps1`、`scripts/Invoke-Q3GuardedMasterImport.ps1` 与 `scripts/__tests__/q3-maintenance-topology.test.mjs`；测试只用 disposable 容器。

### D-091 Historical migration/import uses migration-level evidence, not fabricated runtime CRUD audit

- D-096 适用范围补充：schema activation/运维安全证据及禁止伪造 CRUD 继续有效；历史 source backup/projection/导入排练证明只用于另行授权的历史迁移，不作为当前空数据上线 blocker。

- 日期：2026-09-28；状态：Active，用户已确认。此决定不授权任何真实 migration/import。
- Server runtime `OperationLog` 只表示可信 runtime 身份下实际发生的业务 mutation。历史 migration/import 不伪造逐 row CRUD、Server session 或 actor，不导入 Browser 历史 OperationLogs，也不为 49 条 master/settings row 生成 49 条伪日志。
- 每一次受控 execute attempt 对应一份独立的 migration-level execution evidence。最低内容为 execution identity/type/outcome、startedAt/finishedAt、operator identity、授权/checkpoint 引用、repo commit、target fingerprint、脱敏 database identity、migration ledger/filenames/checksums、rollback backup SHA-256；适用时还包含 source backup file SHA-256、sourceHash、projection/content hash，以及 planned/committed/readback counts 与 readback hash。失败 attempt 同样留存脱敏 failure evidence，不能把未提交事务表述为成功。
- Evidence 不得包含 password、DATABASE_URL、raw backup 或敏感业务 payload，也不得冒充普通业务 CRUD OperationLog。正式保管载体（DB table、append-only artifact 或其他 durable storage）留待未来 guarded execute-runner Gate 根据既有架构审查；本决定不擅自新增 production table。
- 证据：用户本轮明确确认；`server/db/migration-evidence.ts` 的纯 typed validation/serialization contract 与对应测试。该 contract 尚未接入真实 execute runner，未写真实数据库。

### D-090 制作预设默认关系只能引用 active preset

- 日期：2026-09-22；状态：Active，用户已确认。Server 是本规则的最终 authority，不得只依赖 Browser UI。
- `defaultManufacturingPresetId` 只能为 `null` 或当前 `status=active` 的 Manufacturing Preset。单独 Global Settings 写入与 settings bundle 都必须拒绝不存在或 inactive preset；`resolveDefaults` 遇到旧数据中的 inactive reference 必须 fail safe 为无制作预设默认。
- 当前 default preset 从 active 停用时，preset 状态更新、Global Quote Settings default 自动清为 `null`、各自 optimistic version 与两条 trusted OperationLog 必须在同一个 PostgreSQL transaction 中完成；任何一步失败全部 rollback。Bundle 同时停用当前 default 时也自动清空，但显式选择原本 inactive 或本次新建即 inactive 的 preset 必须拒绝。
- inactive preset 重新启用只恢复可选状态，不自动恢复历史 default；用户必须显式重新选择。Browser candidate draft 在停用当前 default 时同步清空，默认下拉只列 active presets；migration preview 将 inactive default 安全投影为 `null` 并给出 warning。
- 停用、重新启用或修改 preset 绝不改写已有 Quote、QuoteRevision 或 PriceVersion 中的制作预设、国家、币种、加成率、运费等快照。
- 证据：`server/quote-masters/service.ts`、`features/quote-center/model/quote-settings.ts`、`features/quote-center/components/global-quote-settings-page.tsx`、`features/basic-settings/server/master-settings-migration-preview.ts` 与 Q3A/Q3B regression tests。

### D-089 默认其他费用按作用域最多一条并作为报价快照复制

- 日期：2026-09-21；状态：Active（Server System 自动回退部分于2026-10-10由 D-102 第二轮确认替代；Browser/品牌/业务员及历史保持）。本决定取代 D-009 对默认设置 0..N 的旧定义，但不改变 Quote `OtherCostLine` 的 0..N 明细语义。
- System、Brand、CustomerSalesperson 每个作用域最多保存一个 nullable `DefaultOtherCost`；非空对象只包含业务 `name` 和 nullable `amount`。解析优先级保持 CustomerSalesperson > Brand > System。
- 默认值应用到新 Quote 时必须复制成具有独立身份的 `OtherCostLine` 快照。之后任何作用域的默认设置变化均不得回写已有 Quote；历史 Quote 中已保存的多条 `OtherCostLine` 必须原样保留。
- 旧版 0..N 全局费用只作为 legacy migration source；沿用现有兼容投影，只取首条 enabled 且 name 或 amount 有效的记录作为新的 `DefaultOtherCost`。该投影不授权修改 Browser 数据，也不把 enabled、note 或旧设置 ID 带入新默认模型。
- 证据：用户确认的 Q3A 业务规则、`features/quote-center/model/quote-settings.ts` 的 legacy normalization、`features/basic-settings/model/basic-settings.ts` 的 `DefaultOtherCost` 与新报价默认值复制逻辑。

### D-088 Server owns immutable Quote business numbers and runtime Quote identity

- 日期：2026-09-21；状态：Active，用户已确认。本规则不是 AI 建议；Q2B2B 实现不等于真实数据库 activation。
- Runtime authority：新建 Server Quote 的技术 ID、初始 Revision ID、初始 PriceVersion ID 均由 Server 生成 UUID；Quote business number 也只能由 Server 生成。Browser/API caller 不得选择、编辑、覆盖、回收或复用 ID/编号，`quoteCode` 创建后不可变且数据库唯一。
- 编号格式为 `QT-YYYY-MMDD-NNN`。日期取 Server creation instant 在 `Asia/Shanghai` 的年月日，Browser 时钟/时区不参与。数字后缀来自一个 Quote Center 全局、单调递增、永不按日重置的 PostgreSQL BIGINT sequence；最小显示宽度为 3，超过 999 自然扩展。并发分配必须安全，rollback/失败可留下永久 gap，已消费值绝不回收。
- Schema：migration `0006_quote_number_sequence.sql` 使用独立的 `quote_center_quote_number_seq`，避免与 legacy 根 ERP 已存在的 `quote_number_seq` 混同。初始化取既有合法 `^QT-[0-9]{4}-[0-9]{4}-([0-9]+)$` 编号最大 suffix + 1，无合法值时从 1 开始；allocator 若遇到已占用 exact candidate，只消费下一值，不修改历史行。
- Runtime/import 分离：`POST /api/v1/quotes` 只接受 `{}`，trusted Server session + `quote.create` 触发 neutral draft、Server identity/number 与同 transaction trusted OperationLog。Q1 internal aggregate persistence 继续保留给未来受控 Q5 migration，且不是 Browser HTTP endpoint。
- Historical migration：Q5 必须原样保留 Browser Quote/Revision/PriceVersion/cost technical IDs 与 `quoteCode`，不得调用 runtime allocator 或重编号。import 前必须扫描 exact legacy `quoteCode` 唯一性，duplicate 时 fail closed；import 后按最大合法 suffix 校准 sequence 并验证下一 candidate，collision-skip 是最后防线。
- Activation boundary：规则已确认且 Q2B2B implementation 提供 0006、runtime create 和 isolated lazy-create UI；真实 0004/0005/0006、真实 Quote migration 与 production `/quote-center` cutover 均未授权/未执行。
- 证据：`database/migrations/0006_quote_number_sequence.sql`、`server/quotes/numbering.ts`、`server/quotes/draft.ts`、`server/quotes/service.ts`、`server/integration/quote-numbering.integration.test.ts`。

### D-085 Quote Q1 persistence preserves owner-scoped identity and snapshot values

- 日期：2026-09-20；状态：Active engineering decision within Q1, not production activation.
- `0005_quote_foundation.sql` uses a distinct `quote_center_*` table family; legacy `quotes` is not the new model. Existing TEXT IDs survive, with Revision/PriceVersion/cost identities scoped to their owners because a new Revision legitimately reuses child IDs.
- Monetary/decimal fields use NUMERIC and typed decimal-string boundaries without new rounding. Metadata remains snapshot-owned, including dangling master IDs/names, missing country/preset, legacy fields and historical confirmations. No master FK or recomputation may destroy historical values.
- Internal aggregate transactions enforce optimistic version and immutable historical Revision/Estimate content. Trusted production aggregate API authorization/audit remains Q2. Shared current ConfirmedCommercialTerms is a separate domain implemented by migration 0004, not duplicated in Q1.
- Version 4 owns ConfirmedCommercialTerms; version 5 has no dependency on it. The runner supports either explicit application order while retaining checksum/missing-file guards. Integration validation used disposable databases only; real 0004/0005 activation remains separately unauthorized and unexecuted.
- Evidence: `server/quotes/`, `server/integration/quote-foundation.integration.test.ts`, `database/migrations/0005_quote_foundation.sql`, `docs/features/QUOTE_PRODUCTION.md`.

### D-086 Server startup verifies migrations but never activates schema

- 日期：2026-09-20
- 状态：Active；M0 migration activation safety gate。它约束所有现有及未来 server migrations，包括 0004/0005，但不授权任何真实 migration。
- 决定：正常 `server:dev`、`server:start` 与生产容器启动不得执行 migration DDL 或初始化 `schema_migrations`。启动只在 read-only transaction 中验证 ledger、applied filename/checksum、missing-file 与 pending 状态；缺失 ledger、pending migration、checksum mismatch 或已应用文件缺失都必须在 permission catalog sync、admin bootstrap 与 HTTP listen 前 fail closed。
- Activation：schema 只可由经过单独授权的 `npm run db:migrate` 显式激活。该 apply path 继续使用 session advisory lock、逐 migration transaction、checksum ledger、失败 rollback 与 rerun skip。标准顺序为 backup/preflight → explicit migration → read-only status verification → server startup，不允许用启动/重启隐式升级数据库。
- Operator UX：`npm run db:migrate:status` 只报告 ledger existence、applied、pending 与 integrity，不写 schema。pending 错误只含安全 migration filenames 与显式 operator action，不含 DB URL、password 或 credential。
- 证据：`server/db/migration-runner.ts`、`server/startup.ts`、`server/index.ts`、`server/integration/migration-activation.integration.test.ts` 与 `tests/server-migration-activation-safety.test.mjs`。M0 只在 disposable PostgreSQL 16 验证；真实 0004/0005 与任何业务写均未执行。

### D-087 ConfirmedCommercialTerms uses a shared Quote-provenance context with explicit SalesOrder associations

- 2026-10-19 状态：Partially Superseded by D-122 / D-145。保留 CCT 报价确认域、精确 provenance、CAS、币种与审计；所有 SO 共享读写 current row、order-owned writer、订单端改工价不再适用。订单只读独立采用版本，下文保留原实现历史。

- 原状态（2026-09-14，已部分替代）：Active（implementation complete in PR；real migration not authorized）
- 日期：2026-09-14
- 决定：`ConfirmedCommercialTerms` 使用独立 PostgreSQL UUID identity。完整 `quoteId + revisionId + priceVersionId` 是可选的精确 provenance，并在 terms context 上唯一；一个该 context 可关联一张或多张 formal SalesOrder，所有关联订单因此读取/修改同一个 current row。没有 Quote provenance 的 SalesOrder 使用一对一的 order-owned context，绝不填充伪造 Quote 字段。
- 金额：客户确认价格是 CNY/件；确认工价使用 PostgreSQL `NUMERIC` 并携带 `CNY|USD` qualifier。API 以 decimal string 传输，不引入浮点或新舍入规则；`NULL` 与 `0` 严格不同。
- 币种所有权：linked context 的工价币种由 exact Quote PriceVersion 建立和变更。Order surface 只能保留该 qualifier；双向变更或未建立时由 Order 发明币种均返回 409，且不产生 terms/OperationLog。unlinked order-owned context 仍允许 Order 明确选择 `CNY|USD`。
- 并发与审计：terms 自有 optimistic `version`，Quote/Order mutation 都要求 `expectedVersion`，stale 返回 409。terms 与单条 append-only `OperationLog` 在同一 transaction 提交，actor 只来自 trusted Server session；SalesOrder aggregate version、source mirrors 与 sequence 不变。
- 边界：Q1 `quote_center_cost_snapshots.confirmation_*` 只保存 Quote aggregate snapshot，不是共享 current writer；ConfirmedCommercialTerms mutation 不回写 Q1 Quote aggregate。未关联当前 Quote 仍走 legacy local confirmation；精确 linked current Quote 只读写 Server terms，不回退写本地 numeric copy。Quote linkage integration 由默认关闭的显式 build-time activation gate 控制；关闭时禁止形成正式 Quote-linked SalesOrder 是 rollout prerequisite，开启后 anonymous/unavailable/未完成 lookup 均视为 unknown 并禁止 local fallback。0004 无 backfill，真实 `zhixu` activation/data migration/Browser write acceptance 均需后续单独授权。
- 代码证据：`database/migrations/0004_confirmed_commercial_terms.sql`、`database/migrations/0005_quote_foundation.sql`、`server/confirmed-commercial-terms/`、`server/quotes/`、`server/app.ts`、`features/confirmed-commercial-terms/`。

### D-084 Linked Quote and SalesOrder share only current confirmed commercial terms

- 2026-10-19 状态：Partially Superseded by D-122 / D-145。订单共享当前金额及两端编辑已替代；报价确认的单一权威、精确金额、可信审计、历史不回写仍保留。下文决定为原时点记录。

- 原状态（2026-09-14，已部分替代）：Active；确认 C4.0 审计 C4-D10，取代“Quote 与 Order 的当前客户确认价格和确认工价各自独立维护”的旧 AI 建议。C4.2 implementation 由 D-087 落地，真实 activation 尚未授权。
- 日期：2026-09-14
- 决定：在同一业务流中已稳定关联的 Quote 与 SalesOrder，“客户确认价格”和“确认工价”分别是一个共享的当前业务事实，不得在 Quote 与 Order 各保存一份可独立漂移的当前值。Quote Center 与 Order Detail 都可编辑这两项共享当前值，任一表面的修改都必须在另一表面读到同一结果。概念上可称为 `ConfirmedCommercialTerms`，本 docs-only 决策不锁定 SQL 表名或 API 名称。
- 审计/历史：每次修改必须通过可信身份记录 actor、timestamp、old value 和 new value，遵守 server OperationLog 原则。Quote Revision / PriceVersion 历史快照仍为 immutable historical facts，共享当前值变化不回写历史快照。
- 边界：不对 Quote PriceVersion 与 Order PriceVersion 做全量 live-link。面辅料成本、margin、汇率、加工假设、Quote 制作国家及其他 PriceVersion 事实仍相互独立。未关联 Quote 的 SalesOrder 不得伪造 Quote 关系。
- 现状证据：Browser `PriceVersionConfirmation` 与 `OrderPriceVersion` 仍是保留的 legacy/independent structures；C4.2 通过 D-087 的专用 Server domain 实现 linked current authority，不把两套 Browser numeric fields 作为 shared writer。

### D-083 Ainuoke source delivery date and Zhixu DeliveryPlan are separate domains

- 日期：2026-09-14
- 状态：Active；确认 C4.0 审计 C4-D09，取代“将单个业务确认交期标量或每次 source refresh 重建的计划直接作为未来交付真值”的旧 C4.0 AI 建议。C4.3 Server 领域由 D-100 落地；真实 0009 activation 未执行。
- 决定：Ainuoke 工艺单/合同交期是不可由织序用户覆写的 source fact。`DeliveryPlan` 是织序拥有、可编辑的客户交付要求/计划集合，支持多行；Order Detail 必须能展开多条计划，同时以弱化的次要文字保留 source delivery date，不得因用户修改 DeliveryPlan 而改写 source mirror。
- 初始化：Ainuoke SalesOrder 首次创建且存在有效 source delivery date 时，初始化一条日期相同的默认 DeliveryPlan。当且仅当用户从未编辑、拆分、新增或其他手工改动整个集合时，该 untouched system-derived default 才可在后续 source delivery-date 变化时同步。
- 用户所有权：一旦发生任何用户介入，整个 DeliveryPlan collection 转为 Zhixu-owned；后续 Ainuoke refresh 只更新 source fact，不覆写用户计划，有差异时显式呈现 drift/reconciliation evidence。后续实现必须能确定性区分 untouched derived default 与 user-managed collection，本条不预设具体 flag/列名。
- 现状证据：`features/ainuoke-sync/service/ainuoke-sync-service.ts` 的 Browser legacy 行为仍在 refresh 时重建 `source="ainuoke_sync"` 行并保留 manual rows；它不具备上述 collection-level 所有权切换，不是本决策已实现的证据。

### D-082 Ainuoke-backed SalesOrder source facts remain authoritative and read-only

- 日期：2026-09-14
- 状态：Active；确认 C4.0 审计 C4-D01、C4-D03、C4-D06 和 C4-D07，取代与本条冲突的旧 AI 建议。C4 实现仍未开始。
- Source authority：对 Ainuoke-backed SalesOrder，已由真实 report metadata/rows 证明的 Ainuoke 字段是权威 source facts，织序不得直接覆写。需要不同运营/业务值时，必须建立可区分的 Zhixu-owned 字段或独立 domain；source drift/conflict 显式呈现，不通过改写用户业务值静默解决。当前已证明范围包括 BillNo/SalesContractNo、InsideOrderNo、source lifecycle、contract/process delivery date、source quantity、source style/customer/brand/company 与 6087105 color enrichment；具体映射仍必须逐字段有实际证据。
- Customer PO：业务所有权属于 Ainuoke，织序用户不可编辑；它不是唯一订单身份，也不得成为用户维护的替代值。但 6086103 `QuotationNo` 已证明不是客户 PO，当前 Direct API 具体 source mapping **NOT YET PROVEN**；在真实 metadata/rows 证明前，server/UI 值必须保持 null/只读，不得猜测映射。
- Quantity：正式 Ainuoke-backed SalesOrder 的 source order quantity 为 Ainuoke-authoritative 且不可由织序用户编辑，不建立可编辑的商业数量 baseline。Scheduling quantity 是独立事实；order quantity 变化不自动改写 schedule quantity。未来 source quantity 变化可产生 drift/reconciliation evidence，但不授权人工改写 source quantity。
- People/country：SalesOrder 的业务“业务员”是品牌/客户侧人员，不是织序 authenticated user，不得映射 `app_users`；未来可采用 customer/brand personnel master + order-time snapshot，具体 schema 未实现。理单员若与该业务员语义不同，继续 pending。Production country 只属于 Quote/Quote PriceVersion；不新增、不迁移 `SalesOrder.productionCountry`。Scheduling `ProductionSite`/实际执行地是不同概念，不得重命名或混同。
- 未决边界：Customer/Brand master mapping、orderDate 语义、source style 向 Zhixu Style master 的长期关系、超出当前 source/adjustment 规则的颜色人工模型、settlement basis、execution snapshots、attachments、process/customer requirement/inspection/remark 语义和 Browser retirement 细节仍未确认，不得由本决策推导。
- 现状证据：`server/sales-orders/model.ts`、migration `0002`、`features/ainuoke-sync/source/ainuoke-contract-api-adapter.ts`、`features/operations-settings/model/operations-settings.ts`、D-035、D-043、D-056、D-077–D-081。当前 Browser `SalesOrder.productionCountry` 及其 legacy sync default 只是已存在的兼容/测试行为，不是正式 server 目标模型。

### D-081 PostgreSQL owns immutable global SalesOrder numbers; final Preview includes non-usable color enrichment

- 日期：2026-09-11
- 状态：Active；实现 D-078 的编号政策并完成 Phase 2B2.3 final fresh Preview。它不授权或执行 real bootstrap / Browser cutover。
- Number allocator：`0003_sales_order_number_sequence.sql` 使用 PostgreSQL sequence + insert trigger 生成 `SO-00000001` 格式编号。UUID 仍是技术 identity；官方 create input 不接受 `orderNo`，显式 override 与 update 均拒绝；rollback sequence gap 允许且不回收。
- Candidate：每个 fresh Discovery BillNo 都形成 candidate。6087105 usable 写完整 color mirror；missing/invalid 写 `colors=[]` 并保留 sanitized reconciliation metadata。SizeRule/Size1..26/SizeNum 只作为 typed evidence，不新增 size relational schema。
- 证据：fresh before/after Discovery 511/511、hash 相同、BillNo blank/duplicate 0/0；6087105 511/511 success，usable/missing/invalid 505/0/6，drift 8，quantity parity 505/0/0。Disposable PG16 通过 0001/0002/0003 创建 511、幂等返回 511、trusted logs 511、rollback probe 1，编号 `SO-00000001`…`SO-00000511` 且无重复/复用。
- 边界：Ainuoke reads 533；Ainuoke/real PG/Browser/Quote/Style Progress/Scheduling/Closing writes 0。6086997 legacy support 保留；disposable container/database 已销毁。

### D-080 SalesContractNo / BillNo 是 Ainuoke SalesOrder 稳定跨报表关联键

- 日期：2026-09-11
- 状态：Active；补充 D-077/D-078，并约束后续 Ainuoke SalesOrder bootstrap / refresh。它不授权真实 bootstrap 或 Browser cutover。
- 决定：`SalesContractNo` / `BillNo` 是 Ainuoke SalesOrder 稳定业务关联键；PostgreSQL UUID 继续是正式技术 identity，immutable source binding 继续由既有模型承担。完整 6086103 Discovery 必须建立 normalized、non-empty、unique BillNo index；duplicate BillNo fail closed。
- InsideOrderNo：只作为 mutable source attribute 和某些旧 report 已证明支持的 transport lookup key。同一 BillNo 下 InsideOrderNo 变化不得新建 SalesOrder、替换 UUID/order_no、解除 source binding、丢失 source-owned details 或形成 identity conflict；跨报表差异记录为 `inside_order_no_drift` informational evidence。
- Query audit：6086103 `order_discovery` 使用 empty query；6087105 已证明支持 `BillNo contains`；6086997 与 6087050 当前 catalog 只证明 `InsideOrderNo is` / `insideorderno is`。未证明 BillNo transport contract 的 report 不得猜测 fieldName/compareType，可由 Discovery 取得当前 InsideOrderNo 查询，但结果必须回绑原 SalesContractNo / SalesOrder UUID。
- 证据：Phase 2B2.2 全量只读验证的 before/after Discovery 均为 511、hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`；511/511 BillNo queries 成功，8 个旧 missing 全部以相同 BillNo 找回且全部产生合法 drift；PI2512-121 从 Discovery `5384/086-1(46021-N)` 对应到 6087105 `5466/086(46021-N)`，颜色数量 9000 与合同一致。

### D-079 6087105 正式取代 6086997 作为 SalesOrder 颜色/分码来源

- 日期：2026-09-11
- 状态：Active；用户已明确批准 source replacement。
- 决定：6087105 是正式当前 SalesOrder color/size source，固定 query 为 `{ salesContractNo }` → `BillNo contains`，返回后 exact normalized BillNo filter。6086997 catalog、adapter、tests 与 Phase 2B2 证据保留为 legacy / historical，不再作为正式当前 SalesOrder color source。
- Missing/invalid：6087105 没有 exact BillNo rows 时为 `missing`，关键行异常时为 `invalid`；两者都是颜色 enrichment 状态，均不得阻止 SalesOrder 创建。InsideOrderNo drift 既不 invalid 也不 missing。
- 边界：本决定不执行真实 PostgreSQL bootstrap、不切换 Browser Order Center、不写 Ainuoke/Browser/Quote/Style Progress/Scheduling/Closing。当时的下一步 fresh Bootstrap Preview 已由 D-081 完成；real bootstrap 仍需另行授权。
- 证据：Phase 2B2.2 全量验证 511/511 query success、511 exact BillNo orders、1390 exact rows、505 usable、0 missing、6 invalid、505/505 usable quantity parity；before/after stale guard stable。

### D-078 正式 SalesOrder 编号、bootstrap scope、source disappearance 与 retention policy

- 日期：2026-09-11
- 状态：Active；补充 D-076/D-077 在真实 bootstrap 前待确认的业务政策，但不授权真实 bootstrap、Browser cutover 或 6087105 source replacement。
- `order_no`：由 server/PostgreSQL 全局递增生成 `SO-00000001`、`SO-00000002`……，用户不可编辑。PostgreSQL UUID 仍是真正技术 identity；InsideOrderNo 与 SalesContractNo 是独立 source facts，不得代替 UUID 或互相推导。
- Scope：正式 bootstrap 组织范围为 `current_account_visible`。每次必须使用 fresh complete Discovery；505、507、511 等历史/当前 total 都只是观察快照，不是固定业务常量，Status 继续不参与 inclusion/exclusion。
- Disappearance：正式 SalesOrder 建立后，source 从 Discovery 消失不触发 hard delete、auto-cancel、UUID replacement 或 source unbind。系统标记 missing、保留历史；source 重新出现后恢复 seen。
- Retention：长期保存 normalized current source mirror、source/discovery hash、fetchedAt/lastSeen/missing 等必要时间和 reconciliation metadata；默认不长期保存完整 raw upstream payload。
- 证据：用户对 Phase 2B2.1 的明确规则确认、`docs/BUSINESS_RULES.md`、`docs/features/SALES_ORDER_PERSISTENCE.md`。Sequence 已由 D-081 / migration `0003` 实现；tombstone schema 与真实 bootstrap 写入仍属于后续独立 Gate。

### D-077 PostgreSQL SalesOrder 采用稳定 aggregate + immutable source binding + current source mirrors

- 日期：2026-09-11
- 状态：Active；落实 D-076 的逐领域 server persistence 与 clean-bootstrap 方向，但不授权真实 bootstrap 或 Browser cutover。
- 决定：Phase 2B1 使用 PostgreSQL UUID 作为正式 SalesOrder identity；`sales_orders` 保存规范化唯一 `order_no`、不可变 creation provenance、Zhixu lifecycle 和 optimistic version。Ainuoke source identity 通过 `sales_order_source_links` 唯一且不可换绑；当前合同头与分色事实存入独立 typed mirror tables，refresh 只替换 source-owned slice，不覆盖 aggregate identity/provenance/version。
- 事务/审计：`createAinuokeSalesOrder` 在 source-scoped advisory lock 和单 PostgreSQL transaction 中完成 aggregate/link/current mirrors/server OperationLog。重复 source identity 幂等返回既有 ID/version；任一步失败整体 rollback。OperationLog actor 只能由 TrustedIdentity 注入，不能从业务 input 或 request body 接受。
- API/边界：本阶段只开放带 Trusted Session + `order.view` 的 list/detail GET，返回 composed DTO。Browser Order Center 仍使用 Browser Repository；没有 live Ainuoke read/write、真实 505 bootstrap、Browser migration/dual-write/cutover，也没有 Quote、Style Progress、Scheduling 或 Closing migration。
- 下一步：Phase 2B2 只构建 Discovery/detail-read → bootstrap candidate → reconciliation → preview report，不执行真实正式 bootstrap。真实写入、cutover 与 Browser retirement 均需后续独立 Gate。
- 证据：`database/migrations/0002_sales_order_foundation.sql`、`server/sales-orders/`、`server/app.ts`、`server/integration/postgres.integration.test.ts` 与 `docs/features/SALES_ORDER_PERSISTENCE.md`。

### D-076 正式持久化采用 Node/TypeScript API、可信 RBAC 与逐领域切换

- 日期：2026-09-10
- 状态：Active（Node/PostgreSQL/migration/逐领域切换）；当前开发身份/session 要求由 D-093 临时替代。此决定替代 D-002 作为未来正式生产目标，但 legacy static + `api_dispatch` 路径在独立退役 Gate 前继续兼容运行。
- 决定：正式架构为 Browser → same-origin `/api/v1/*` → Node/TypeScript application/repository → PostgreSQL 16。新业务规则留在 TypeScript，不扩展通用 SQL/表名/op dispatch 或复杂 PL/pgSQL controller。
- Migration：`database/migrations/NNNN_*.sql` 只前进；`schema_migrations` 保存 filename/checksum/applied_at/duration，advisory lock 串行化 runner，每文件 transaction，checksum drift/missing file/failure fail closed。没有自动 down，回退使用 forward fix 或经授权的已验证 restore。
- Identity/RBAC：`app_users` 是唯一 identity source，以不可变 UUID `public_id` 对外；V1 session 只持久化 token digest。授权关系为 users/roles/permissions/user_roles/role_permissions，权限目录复用现有纯 TypeScript `PermissionKey`，只按 key 授权且没有角色名/admin bypass。
- Audit：server `operation_logs` 与 legacy `audit_logs` 分离；actor 使用内部 FK + stable public ID/name snapshots，由 trusted session context 注入，数据库拒绝 update/delete。现有 browser OperationLog 在领域 cutover 前继续独立运行，不做长期未对账双写。
- Cutover：每个业务领域必须独立完成 schema/repository/service transaction/authorization/OperationLog/backfill/reconciliation/read-write cutover 后才能退休 browser store。Phase 1 不创建 SalesOrder/Quote/Scheduling/Closing/Style Progress/Ainuoke/附件业务表，也不迁移浏览器数据。
- 证据：`server/`、`database/migrations/`、`Dockerfile.server`、`server/integration/postgres.integration.test.ts` 与 `docs/features/SERVER_PERSISTENCE.md`。

### D-044 业务表格采用 Fit-first 个人布局，工作台身份信息去重

- 日期：2026-09-04
- 决定：正式 `DataTable` 的列宽与稳定列顺序按 `User + Table` 保存；旧 width-only 偏好向前迁移，删除列忽略、新列按默认顺序追加。Preferred Width 参与可用宽度比例 fit，不得把主业务列表的横向滚动当作默认交互。
- 决定：Desktop Sidebar 支持按用户保存的展开/折叠；基础设置与系统设置菜单只因用户动作打开，pathname 只负责高亮并在切换时关闭临时菜单。
- 决定：订单 Header 负责身份，Summary 只保留有效数量、合同交期、生产状态与下一步；正式 Ainuoke Order 不提供普通数量/合同交期覆盖入口。生产排单移除重复摘要与大异常 Banner，组选择器压缩后固定在 AppShell 唯一主滚动的顶栏下方。
- 边界：报价成本录入矩阵、关账分组汇总、Ainuoke 对照表和附件表等具有固定业务语义的自定义表不允许任意重排；它们仍须 fit-first 或使用窄屏 Record/Card，不能用隐藏 scrollbar 伪装溢出。
- 证据：`components/foundation/data-table.tsx`、`table-preference.ts`、`sidebar-preference.ts`、Quote/Order/Production/Closing UI、Second Acceptance tests 与截图目录。

### D-042 关账归属保存月度事实快照，锁定后只允许有原因地重开

- 日期：2026-08-28
- 决定：正式关系为 `SalesOrder → ClosingAllocation[]`，`ClosingAllocation.scheduleAssignmentId` 可空；关账数量独立于订单数量、排单数量和完成数量。内部、外发与待分配可在同一订单、同一月份并存，关账事实不得写回 SalesOrder 或 ScheduleAssignment。
- 决定：`ClosingAllocation` 在保存时冻结订单类型、销售单价、加工单价/币种、汇率、税率和执行方；加工产值原币为 `quantity × closingProcessingUnitPrice`，USD 按关账汇率快照折算 RMB，经销销售产值为 `quantity × salePriceSnapshot ÷ (1 + taxRateSnapshot / 100) ÷ 10000`，加工订单销售产值不适用。计算集中在 Closing Service。
- 决定：`ClosingPeriod` 生命周期为 `open → confirmed → locked`。锁定拒绝普通 mutation；重新打开需要 `closing.reopen` 与原因。排单变化不静默改写既有关账，Service 以 ScheduleBasisSnapshot 识别 stale，用户显式同步或保留快照。
- 决定：浏览器 schema 升至 v8，只新增稳定 `closing-center` record；v7 其他 payload 原样重封装。关账动作复用唯一 OperationLog，权限、SearchProvider、订单投影与 Backup/Restore 同步接入。
- 边界：不实现应收应付、发票、付款、总账、利润核算或 PostgreSQL 关账表；根路径旧 ERP 数据库不修改。D-041 中“关账尚未实现”的阶段性边界自本决定起被替代，排单领域决定本身继续有效。
- 证据：`features/closing-center/`、`app/closing-center/`、订单详情关账投影、ClosingSearchProvider、数据生命周期接入和 `tests/closing-center.test.mjs`。

### D-041 排单事实独立于单款 SalesOrder，并由 Service 统一投影（Superseded by D-043）

- 日期：2026-08-28
- 决定：正式关系为 `SalesOrder → ProductionPlan[] → ScheduleAssignment[]`。Assignment 通过 `productionPlanId` 归属计划，不重复保存 `salesOrderId`；内部执行只引用 ProductionGroup，外发只引用 OutsourceFactory，一单允许多计划、多执行方和内部/外发混合。
- 决定：SalesOrder 不保存执行方式、执行方、排单数量、完成数量或生产状态。订单有效量、计划量、排单量、内部/外发量、完成量、执行模式、生产状态与 DeliveryPlan 累计交期风险全部通过 `production-scheduling-service.ts` 计算。订单数量变化不自动修改排单，超额只提示不截断。
- 决定：schema 升至 v7，仅新增稳定 `production-scheduling` record；v6 其他业务 payload 原样重封装。排单动作复用 OperationLog 和现有 schedule 权限，SearchProvider/Backup/Restore 同步接入。停用基础资料不能用于新排单，但历史引用保持可读。
- 边界：不创建 ClosingPeriod、ClosingAllocation、关账中心、产值计算、锁账或重开；不修改旧 PostgreSQL `orders/schedules/audit_logs`。
- 证据：`features/production-scheduling/`、`app/production-scheduling/`、订单详情摘要、ScheduleSearchProvider、数据生命周期接入与 `tests/production-scheduling.test.mjs`。

### D-040 一张 SalesOrder 只允许一个款式

- 日期：2026-08-27
- 状态：Superseded by D-043。数量口径、混合执行、Service Projection、权限与旧 PostgreSQL 隔离继续有效；ProductionPlan 中间层和 Assignment.productionPlanId 已被替代。
- 决定：SalesOrder 同时承担订单身份与单款执行单位，不再拥有 `OrderItem[]`。Quote 来源、款式、初始数量、执行资料、附件、DeliveryPlan、OrderQuantityChange、OrderPriceVersion 与 `currentPriceVersionId` 均直接属于 SalesOrder；当前价格只能通过该指针读取，损坏时禁止 fallback。
- 决定：Quote 直接生成 SalesOrder；翻单关系为 `SalesOrder → SalesOrder`，只保留 `sourceOrderId`，`sourceOrderItemId` 正式废弃。相同 `customerPoNo` 可以对应多张不同单款订单，不能因此合并。
- 决定：v5→v6 的单款 payload 迁移保持有效，稳定 `sales-orders` key 不变；当前整体 schema 已由 D-041 升至 v7。v5 单 Item 保留原订单 ID/订单号，多 Item 逐款拆单；确定性旧 Item→新 SalesOrder mapping 保护翻单链路、诊断和旧日志展示。旧 OperationLog 不改写，新日志不再写 `orderItemId`。
- 后续：`SalesOrder → ProductionPlan → ScheduleAssignment` 已由 D-041 实现；`ClosingAllocation.salesOrderId` 与可空 `scheduleAssignmentId` 仍只是未来边界。本决策不创建 ClosingPeriod、ClosingAllocation 或关账中心，也不修改旧 PostgreSQL orders/schedules。
- 证据：`features/order-center/model/order.ts`、`migration/order-v5-to-v6.ts`、Order Service/Repository/UI、OrderSearchProvider、订单日志/备份适配与 `tests/order-center.test.mjs`。

### D-038 订单、排单与关账先共享稳定基础设施，业务实体延后实现

- 日期：2026-08-26
- 决定：先建立独立 `operations-settings` 领域保存生产组、外发厂、默认销售产值税率和月度生产目标；生产组/外发厂以稳定 ID 引用、允许同名并通过停用保留未来历史引用。浏览器 schema 升至 v4，v3 → v4 只增加独立记录并保留既有 payload 与未知字段。订单、排单和关账权限键先进入统一 RBAC，但报价员和查看员的既有权限不自动扩大。
- 决定：审计继续扩展唯一的追加式 `OperationLog`，设置写入使用一次业务操作一个 `operationId` 并保存字段级 `changes[]`；新上下文 ID 只作未来关联预留，不新建第二套 `AuditEvent`。未来订单、排单、关账业务对象仍需独立设计和实现。
- 决定：`OrderType` 复用 `processing | distribution`，执行方式为 `internal | outsource`，关账期间状态为 `open | confirmed | locked`。外发厂引用未来应落在排单分配；订单数量、排单数量、完成数量保持独立。默认税率只作为创建关账快照时的来源，已确认/锁定月份不得实时读取全局设置。
- 原因：先稳定跨模块身份、权限、审计和数据保护边界，避免未来订单/排单/关账各自复制一套主数据或在没有正式模型时污染现有报价和 PostgreSQL 旧表。
- 证据：`features/operations-settings/`、`features/shared-domain/model/operations.ts`、权限与 OperationLog 扩展、local data v4 migration、`tests/operations-infrastructure.test.mjs` 和 `docs/features/OPERATIONS_FOUNDATION.md`。

### D-037 面料单耗统一为四位正式业务值，审计日志扩展到设置与批量导出

- 日期：2026-08-26
- 决定：kg/meter 面料公式先计算原始值，再在 `quote-calculations.ts` 统一按第五位四舍五入到四位；面料成本、UI、正式 Excel 和占位符 Excel 都消费该值。当前架构的单耗是明确的计算派生值，因此不在 FabricCostLine 冗余保存第二份 raw/stored 字段，也不原地改写历史 Revision；历史导出按同一读取规则规范化。Excel 写 number，格式为 `0.0000`。
- 决定：审计继续使用唯一 `OperationLog`，扩展品牌、客户业务员、系统报价设置、制作预设和 PriceVersion 预设切换事件。批量导出只保存完整的最小业务快照清单，不保存 Quote/Blob 大对象。
- 原因：单耗必须在成本、显示和导出间可解释一致；关键主数据和系统设置写操作也必须能按稳定 ID 与字段差异追溯。
- 证据：`quote-calculations.ts`、两个 Excel exporter、`settings-operation-logs.ts`、批量导出日志接线及相关自动化测试。

### D-036 USD 工价人民币折合使用固定 1.13 系数

- 日期：2026-08-26
- 决定：当 PriceVersion 加工币种为 USD 时，统一由 `convertedLaborRmb` 计算 `原始 USD 工价 × PriceVersion 汇率 × 1.13`；固定 `1.13` 与 PriceVersion 的 `markupRate` 是两个独立业务概念。CNY 工价直接使用用户录入人民币值。详情摘要、Sticky、Excel 和其他消费者读取 calculator 结果，不自行重复公式。
- 原因：USD 加工单价需要遵循明确的固定折算口径，同时保留各制作预设独立的报价成本加成率，避免两种“13%”语义混淆。
- 证据：`quote-calculations.ts`、`quote-presentation.ts`、报价摘要/加工费组件、Excel export mapper 和 `tests/quote-calculations.test.mjs`。

### D-035 制作预设与全部报价计算参数属于 PriceVersion 快照

- 日期：2026-08-26
- 决定：制作预设只在系统设置维护，但 `manufacturingPresetId`、预设名称、制作国家、加工币种、USD/CNY 汇率、`markupRate` 和运费策略均以 `PriceVersion.pricingParameters` 完整快照保存。应用预设只更新当前 PriceVersion 及其预设运费行；复制 PriceVersion 深复制该快照并清除客户确认。计算、展示和 Excel 导出只读取目标 PriceVersion 快照。旧 Revision 级参数仅在 schema v2 → v3 读取迁移时使用，迁移后不再保存。
- 原因：同一 QuoteRevision 必须同时支持不同制作国家、币种、加成和运费口径，且系统预设后续变化不能污染任一已有或历史 PriceVersion。
- 证据：`quote-view-model.ts`、`quote-settings.ts`、`quote-calculations.ts`、`mock-quote-repository.ts`、报价设置/导出组件和 `tests/price-version-manufacturing-preset.test.mjs`。

### D-033 面向客户的最终成衣报价统一截断到一位小数

- 日期：2026-08-26
- 决定：内部成本与成衣销售单价计算保持原始精度；所有面向用户的最终成衣报价显示及客户 Excel 输出统一调用共享 formatter，保留一位小数并使用截断而非四舍五入，例如 `41.25 -> 41.2`。空值继续显示/导出为空，明确 0 显示 `0.0`。
- 原因：这是客户报价口径，不能由 React、列表和不同 Excel exporter 各自格式化并产生舍入差异。
- 证据：`features/quote-center/model/final-quote-format.ts`、报价展示组件、`features/quote-center/export/` 和相关测试。

### D-032 Quote Center 浏览器数据采用稳定命名空间与非破坏性迁移

- 日期：2026-08-25
- 决定：Quote Center 与新订单中心所有可序列化长期数据写入稳定 `zhixu.erp.local.*` localStorage namespace，当前 `schemaVersion = 6`；旧报价 sessionStorage、旧 envelope 和旧带版本 localStorage key 只作为迁移来源。启动时优先读取已有稳定数据，其次迁移旧数据，只有空 namespace 才执行一次 Seed。附件与用户模板继续使用原 IndexedDB database/store，并纳入显式 JSON 备份/恢复。自动流程不删除旧 key，数据清空只允许在数据管理页二次确认执行。v4 增加 `operations-settings`，v5 增加 `sales-orders`，v6 仅迁移多款订单 payload，其他记录不重写。
- 原因：DEV 3001 已承载长期人工验收数据；sessionStorage、版本化 key 和解析失败后静默回退 Seed 会让数据在关闭标签页、版本升级或数据异常时丢失或看似消失。
- 证据：`features/data-management/`、各 browser repository、`tests/data-lifecycle.test.mjs`、`docs/features/DATA_LIFECYCLE.md`。

### D-031 Quote Detail 宽表按内容宽度铺满，半屏操作固定四列

- 日期：2026-08-24
- 决定：成本 Card 实际内容宽度 `>=1040px` 时使用单行 Wide renderer，面料/辅料/其他费用采用 `table-layout: fixed` 与业务权重百分比，不设置会超过 Card 的固定最小宽度；`700–1099px` viewport 保持完整两行 Compact 编辑，True Mobile 规则不变。全部 Compact/Tablet 的普通与 Sticky 操作区使用四列等宽 Grid，只有 `>=1440px` Large Desktop 自然横排。顶部常驻操作移除“操作记录/删除报价”文字按钮，两项能力连同权限和 handler 收进复用的“更多”入口。Sticky 触发状态源与时机不变。AppShell 客户端模式在浏览器绘制前解析，避免服务端 Desktop fallback 在列表/详情切换时闪现展开侧栏。
- 原因：在 1920×1200、系统/浏览器缩放后的约 1230px CSS viewport 中，实际 Card 只有约 1091px；旧 1230/1160px 固定表宽必然产生无意义横向滚动。半屏操作使用 flex 时也不能稳定控制行密度。
- 证据：`cost-table.tsx`、`quote-editor.tsx`、`quote-center.css`、`responsive.css`、相关响应式测试及 DEV 浏览器 1920/1230/785 实测。

### D-029 新建报价主数据采用嵌套就地创建与显式保存边界

- 日期：2026-08-24
- 决定：品牌和当前品牌下的客户业务员通过 SearchableSelect 的条件创建项打开 Quick Create Modal；品牌默认辅料选择器可在 Modal 内继续打开 body Portal Drawer，并把新记录写入正式 Trim Library。只有主数据 repository 在用户明确保存时写入；报价草稿仍遵守 Lazy Create。新建资料立即选中，默认辅料只保存 Library ID 与长期 override，应用报价时再生成新成本行快照。已有用户成本数据时继续使用保留、应用、取消三向保护。
- 原因：用户需要在新建报价上下文中补齐缺失主数据，同时不能丢失草稿、复制伪 Library 数据、污染历史 Revision 或因快建而产生空白报价。
- 证据：`components/foundation/searchable-select.tsx`、`components/foundation/drawer.tsx`、`features/basic-settings/components/quick-master-data-create.tsx`、`features/basic-settings/components/master-data-forms.tsx`、`quote-editor.tsx` 和 `tests/quick-master-data.test.mjs`。

### D-028 ERP 全局搜索使用权限感知的 Provider 注册表

- 日期：2026-08-23
- 决定：全局搜索 UI 只负责 Command Palette、键盘选择和导航；各业务模块通过 `SearchProvider` 提供查询与结果投影，由 `SearchRegistry` 在查询前执行 Provider 权限判断。第一阶段 Quote Provider 复用 QuoteRepository，只返回列表级非成本字段；最近访问按 mock userId 隔离并再次经过 Provider 权限过滤。
- 原因：把报价查询硬编码在 Palette 会阻塞订单、排单、采购等模块扩展；在查询后才隐藏结果会产生权限信息泄露和不必要数据读取。
- 证据：`features/global-search/`、`components/foundation/app-shell.tsx`、`tests/global-search.test.mjs` 和 `docs/features/GLOBAL_SEARCH.md`。

### D-027 Quote Center 日志在保存事务后独立追加

- 日期：2026-08-23
- 决定：Quote Center 第一阶段 OperationLog 使用独立模型和 localStorage repository，不写入 Quote、QuoteRevision 或 PriceVersion。日志以 repository 保存成功为边界，对上次已保存快照与本次快照生成字段差异；repository 只暴露追加和按报价读取，时间线没有编辑/删除入口。
- 原因：输入过程不是已落地业务事实；把日志塞入 Revision 会污染报价快照并让日志与被审计对象互相嵌套。保存后差异既能记录成本前后值，也避免逐字符日志噪音。
- 证据：`features/operation-logs/`、`quote-editor.tsx`、`tests/operation-logs.test.mjs` 和 `docs/features/OPERATION_LOGS.md`。

### D-026 Quote Center 第一阶段权限使用可扩展前端 RBAC

- 日期：2026-08-23
- 决定：Quote Center 第一阶段建立独立的 `User -> Role -> PermissionKey[]` mock 权限模型。Foundation Button 统一接收权限键并保持无权限操作可见 disabled；复杂编辑区同时使用权限上下文进入只读状态。权限状态只存 localStorage，不写入报价快照，也不与根路径 ERP 的 PostgreSQL 账号体系静默合并。
- 原因：订单、排单、采购等未来模块需要稳定权限目录；把角色名称判断散落到页面会堵死扩展，也无法统一无权限反馈。
- 证据：`features/permissions/`、`components/foundation/button.tsx`、用户权限路由、Quote Center/基础设置接入和 `tests/permissions.test.mjs`。

### D-001 双报价路径暂时隔离

- 日期：2026-08-21 前已形成
- 决定：根路径 ERP 报价继续使用 PostgreSQL API；Quote Center 使用自己的领域模型和 mock repository，不连接旧 `/api/quotes`。
- 原因：两者的数据结构、Revision/PriceVersion 语义和计算口径不同。
- 证据：`app/page.tsx`、`database/001_schema.sql`、`features/quote-center/repository/`。

### D-002 本地生产运行使用静态应用 + PostgreSQL

- 日期：当前仓库基线
- 决定：本地 Docker 由 PostgreSQL 容器保存业务数据，Shell 静态服务器将 `/api/*` 交给 `api_dispatch`。
- 证据：`Dockerfile`、`docker-compose.yml`、根目录 `docker-entrypoint-app.sh`、`docker-serve.sh`。

### D-003 Quote Revision 是完整快照

- 日期：2026-08-21 前已形成
- 决定：Revision 保存某次完整报价状态；PriceVersion 是 Revision 内的并列价格口径。新 Revision 深复制并清除客户确认，历史 Revision 只读。
- 证据：`features/quote-center/model/quote-view-model.ts`、Revision 管理和测试。

### D-004 默认 Revision 使用稳定 ID 指针

- 日期：2026-08-21 前已形成
- 决定：`defaultRevisionId` 是当前默认 Revision 的权威指针；读取旧数据时才兼容 `currentRevisionId`。
- 证据：Quote view model 和 revision helper。

### D-005 Quote Center 统一使用 markupRate

- 日期：2026-08-21 前已形成
- 决定：Quote Center 报价加成使用 `cost × (1 + markupRate / 100)`；不复用旧 ERP 的毛利率除法公式。
- 证据：Quote Center calculation 和测试。

### D-006 默认辅料引用库，报价使用快照

- 日期：2026-08-21 前已形成
- 决定：品牌/客户业务员默认辅料保存库 ID 和长期 override；应用到报价时生成带新 row ID 的独立成本行，用量保持空。
- 证据：`features/basic-settings/` 默认资料服务和测试。

### D-007 基础资料与 Quote Revision 解耦

- 日期：2026-08-21 前已形成
- 决定：品牌、客户业务员、面料库和辅料库不放入 Revision；Revision 只保留使用时的报价快照。
- 证据：基础设置模型、Quote view model 和快照测试。

### D-008 列表偏好按用户隔离

- 日期：2026-08-21 前已形成
- 决定：Quote Center 可见列配置带 `userId`，当前 mock 用户也不得写成系统唯一全局列配置。
- 证据：Quote list preferences repository 和测试。

### D-009 全局费用允许多条并保护覆盖

- 日期：2026-08-21 前已形成；状态：Superseded by D-089（2026-09-21）
- 决定：全局费用为 0..N 条，通过稳定设置 ID 同步到当前默认 Revision；用户覆盖过的行不被静默覆盖。
- 取代原因：正式默认设置模型已收敛为每个 System / Brand / CustomerSalesperson 作用域最多一个 nullable `DefaultOtherCost`，并在新建 Quote 时复制为独立快照；Quote 自身的 `OtherCostLine` 仍为 0..N，历史明细不变。
- 证据：global cost model/service 和测试。

### D-010 表单提交优先使用 HTML form 语义

- 日期：2026-08-21 前已形成
- 决定：局部 Modal/Form 由 Foundation FormShell 统一 Enter 提交和防重复规则；整页报价不因普通 Enter 保存。
- 证据：`components/foundation/form-shell.tsx`、`form-enter.ts` 及测试。

### D-011 详情页使用 query id 兼容静态导出

- 日期：2026-08-21 前已形成
- 决定：报价详情路由为 `/quote-center/detail?id=...`，与当前静态导出方式兼容。
- 证据：`app/quote-center/detail/page.tsx` 和 Quote Center 导航代码。

### D-012 附件二进制与 Revision 引用分离

- 日期：2026-08-21
- 决定：QuoteRevision 保存图片/文件附件 ID 快照和款式图 ID；纯前端阶段由 AttachmentRepository 的 IndexedDB 实现保存 metadata 与 Blob，不将大文件写入 localStorage/sessionStorage。
- 原因：Revision 需要复制引用而不是复制文件，历史版本必须保持可下载，同时为未来 Object Storage/API repository 留出替换边界。
- 证据：`model/quote-attachments.ts`、`repository/attachment-repository.ts`、`repository/indexeddb-attachment-repository.ts` 和附件测试。

### D-013 正式报价以模板驱动的按需 Excel 导出

- 日期：2026-08-22
- 决定：Quote Center 的正式 Excel 导出以 `templates/quote-export-template-v1.xlsx` 为唯一版式基准；用稳定标签解析模板并动态扩展五个成本区域。一个 Revision 生成一个 Workbook，一个 PriceVersion 生成一个 Sheet。ExcelJS 只在用户打开导出流程后动态加载，导出数值来自现有 Quote Center 计算函数和快照，不新增 Excel 公式口径。
- 原因：保持正式模板外观、历史快照和应用内计算一致，同时避免 Excel 库进入报价页首屏依赖。
- 证据：`features/quote-center/export/`、`quote-export-modal.tsx`、`tests/quote-excel-export.test.mjs` 和导出验收工作簿。

### D-014 批量图片先确认再写入附件仓库

- 日期：2026-08-22
- 决定：剪贴板或拖放加入的多张图片先保存在 Modal 的临时待添加列表中；用户确认后才通过 AttachmentRepository 批量写入。批次中途失败时补偿删除本批已写入项，已有款式图绝不被自动覆盖。
- 原因：避免粘贴/拖放瞬间产生不可见持久化和半批次状态，同时保留 Revision 附件引用与底层 Blob 分离的既有边界。
- 证据：`attachment-panel.tsx`、`quote-attachment-upload.ts`、`quote-attachments.ts` 和 `tests/quote-attachments.test.mjs`。

### D-015 Excel 工价双列复用系统人民币计算结果

- 日期：2026-08-22
- 决定：CNY 工价只写 RMB/件；USD 工价同时写系统计算得到的 RMB/件与原始 USD/件。导出映射层读取现有计算结果，导出器不自行执行汇率换算。
- 原因：确保 Excel 与 Quote Center 页面只有一套工价换算口径，并保持空值与显式 0 的区别。
- 证据：`quote-export-mappers.ts`、`quote-excel-exporter.ts` 和 `tests/quote-excel-export.test.mjs`。

### D-016 导出模板使用版本化 Definition + IndexedDB Blob

- 日期：2026-08-22
- 决定：模板 metadata 使用通用 `TemplateDefinition`，用户 xlsx Blob 由 `TemplateRepository` 存入 IndexedDB；现有正式报价模板继续作为内置默认和读取失败 fallback。
- 证据：`features/template-settings/`、模板设置路由与测试。

### D-017 客户报价模板硬隔离内部 EstimateCost

- 日期：2026-08-22
- 决定：客户模板验证拒绝 `estimate.*`；Customer Quote Export 输入模型不包含 EstimateCost，现有“实际成本”列也保持空白。
- 证据：template validation、quote placeholder exporter、模板/估算测试。

### D-018 EstimateCost 是 Quote 级独立快照

- 日期：2026-08-22
- 决定：Quote 同时最多一个 active EstimateCost，并可保留多个历史；它由用户从指定 QuoteRevision 主动生成，不属于 Revision 或 PriceVersion。重新生成归档，恢复通过 Clone。
- 证据：`model/estimate-cost.ts`、`estimate-cost-panel.tsx` 和测试。

### D-019 批量汇总复用 QuoteList 单一列定义

- 日期：2026-08-22
- 决定：Quote Center UI 与内部汇总 Excel 共用 `quote-list-column-definitions.ts`；每款模式使用 aggregate/range，每 PriceVersion 模式读取版本自身。
- 证据：quote list、batch exporter 和批量导出测试。

### D-020 报价详情只保留一个 Sticky 状态源

- 日期：2026-08-22
- 决定：报价摘要、操作按钮、快速导航由一个 sentinel、一个 IntersectionObserver 状态和一个 sticky container 同步控制；普通快速导航不再独立 sticky。
- 证据：quote editor、quick navigation、Quote Center CSS 和导航测试。

### D-021 DEV 与 PROD Docker 使用明确的版本边界

- 日期：2026-08-22
- 决定：DEV 固定为 `127.0.0.1:3001`，直接运行当前源码并支持 HMR；PROD Docker 固定为 `127.0.0.1:3000`，只有显式 rebuild 才更新。Docker 必须在 builder 阶段从当前 build context 构建源码，不能复制宿主旧 `dist`。两套环境都自动生成并暴露 Build Info；HTML/Build Info 不长期缓存，hash 资源可 immutable 缓存。
- 原因：消除“源码已更新但浏览器仍显示旧 production 容器”的判断歧义，并让运行实例版本可以直接核验。
- 证据：`vite.config.ts`、`Dockerfile`、`docker-compose.yml`、`docker-serve.sh`、`scripts/dev.ps1`、两个 rebuild 脚本与 `tests/local-runtime-observability.test.mjs`。

### D-023 全局设备模式由 viewport 与交互能力共同决定

- 日期：2026-08-23
- 决定：全局 Navigation Mode 不再使用纯 width 判定。True Mobile 必须同时满足 viewport `<768px`、`pointer: coarse`、`hover: none`；细指针且可 hover 的窗口在 `<1440px` 时进入 Compact Desktop，包括 650–900px 的笔记本半屏。触摸设备 768–1023px 使用 Tablet。AppShell 将共享 helper 结果写入 `data-responsive-mode`，Bottom Navigation 只在 React 判定为 Mobile 时渲染。Quote Center 的搜索、类型、状态在全部模式保持单行 6:2:2，不再提供筛选 Sheet。
- 原因：ERP 的窗口宽度不能代表设备类型；Windows/Mac 半屏仍需完整导航、表格和报价操作。
- 证据：`components/foundation/responsive.ts`、`components/foundation/app-shell.tsx`、`app/globals.css`、`app/quote-center/responsive.css`、`features/quote-center/components/quote-list.tsx`、`tests/responsive-mobile-batch1.test.mjs`。

### D-026 quoteCode 保留但退出常规业务展示

- 日期：2026-08-24
- 决定：`Quote.quoteCode` 继续作为内部识别、搜索、日志、调试和导出 fallback 字段；详情标题、Sticky 摘要、搜索/最近访问和移动报价卡不主动展示。报价编号列表列保留为个人可配置字段，新用户默认隐藏。
- 证据：Quote Editor、Quote List、Quote Search Provider、quote settings 和 `tests/batch4-1.test.mjs`。

### D-027 基础设置与系统设置按资料性质分组

- 日期：2026-08-24
- 决定：基础设置只承载品牌、客户业务员、面料库和辅料库；系统设置承载报价设置、模板设置、用户权限和操作日志。模板/权限旧路由保留 bookmark 兼容，但导航归属为系统设置。
- 证据：`components/foundation/app-shell.tsx` 与系统设置路由。

### D-028 Sidebar 只有中间导航滚动且隐藏 scrollbar

- 日期：2026-08-24
- 决定：Desktop/Compact Sidebar 的 Brand/Organization 与 User Footer 固定，Navigation 独立滚动；Firefox `scrollbar-width:none` 与 WebKit scrollbar 隐藏仅影响视觉，不取消滚轮、触控板和 touch scroll。展开子菜单不得改变 Sidebar/Main 宽度。
- 证据：AppShell、`app/globals.css` 和 Batch 4.1 测试。

### D-029 全局 Audit Log 复用统一 OperationLog 数据源

- 日期：2026-08-24
- 决定：报价 Timeline 和系统全局 Dense Table 使用同一个 append-only OperationLog repository；全局读取只增加 `list()`，不提供 edit/delete。非报价系统动作允许 `quoteId=null`，由 module/entity 标识。
- 证据：`features/operation-logs/`、系统操作日志路由和权限 `audit_log.view`。

### D-030 全局搜索打开统一并由 query 驱动详情重载

- 日期：2026-08-24
- 决定：搜索结果、最近访问、鼠标点击和 Enter 统一经过 `openSearchResult`；打开前重新检查 Provider 权限。Quote Detail Loader 订阅 query `id` 并以 `Quote.id` 作为 Editor key，确保同路由导航和 Browser Back 都重载正确报价。
- 证据：Global Search Palette、Quote Detail Loader 和 Batch 4.1 测试。

### D-044 订单详情以款号为主、系统订单号只读

- 日期：2026-08-29
- 决定：单款 SalesOrder 详情以 `styleNo` 作为主标题，订单号由系统生成并只读弱化；客户 PO 归入单款执行资料。平均日产仅作为排单参考，不在普通订单详情中作为日常编辑字段展示。
- 原因：订单执行人员首先按款识别工作对象，同时避免系统身份字段被误改。

### D-045 订单详情离开必须保护未保存内容

- 日期：2026-08-29
- 决定：有未保存修改时，返回列表提供继续编辑、放弃并返回、保存并返回三种选择；保存并返回必须等待持久化成功后再导航。
- 原因：避免因路由切换丢失订单编辑内容，也避免保存失败后仍离开页面。

### D-046 排单中心采用生产组总览到单组队列的信息架构

- 日期：2026-08-29
- 决定：主入口先展示每个生产组一张聚合卡，再进入单组高密度队列；未排订单和异常保持独立视图。总览数量随生产组数量增长，不随款式数量成倍膨胀。
- 原因：生产管理首先按执行组查看负荷和队列，同时仍保留订单与异常入口。

### D-047 排单编辑不暴露内部工期口径

- 日期：2026-08-29
- 决定：UI 不显示“排期依据”或 `durationMode`。平均日产与所需工作日直接双向联动，以用户最后编辑的字段形成当前输入口径；正式计算仍由排单 Service 完成。
- 原因：减少内部模型术语对用户的干扰，同时保留两种常用录入方式。

### D-048 报价与订单列表复用统一 Table Preference

- 日期：2026-08-29
- 决定：列宽偏好通过 Foundation Repository 按 `userId + moduleKey + tableKey` 隔离保存；报价列表和订单列表复用 contract、各自拥有默认值和恢复默认能力。偏好不是业务数据，不写 OperationLog。
- 原因：统一个人视图能力，同时避免不同模块的列设置互相污染。

### D-049 结束排单将直接记录与队列建议明确分流

- 日期：2026-08-29
- 决定：首层结束弹窗同时提供“仅记录结束”和“结束并应用建议”；应用建议必须先展示后续排期变更预览，确认后才持久化。两条路径继续共享正式 ScheduleAssignment Service 与统一 OperationLog。
- 原因：常规结束操作不应被迫经过队列调整，同时任何后续排期移动都必须显式可见。

### D-050 面辅料跟进是低权威 Source

- 日期：2026-09-01
- 决定：《面辅料申购统计》只提供 Material Follow-up Source；销售合同与成衣分色分码继续分别作为订单字段和颜色数量的高权威来源。Style Progress 不反向覆盖正式订单。
- 原因：采购跟进表允许修正和缺行，不能替代合同与订单事实。

### D-051 当前预计到料日采用 Source / Effective / Actual 分层

- 日期：2026-09-01
- 状态：Superseded by D-065 / D-066。
- 原决定：`sourceMaterialDueDate` 保留来源，`expectedMaterialReadyDate` 是当前业务 Effective，累计入库达到需求推导 Actual 齐套日。首次导入与未人工修改的重导入跟随 Source；人工 Effective 不被重导入覆盖；恢复后使用当前 Source。Excel `厂供` 仅映射 `actualConsumption`。
- 原因：来源变化、人工判断和实际到料是不同时间事实，必须同时可追溯。

### D-052 款式进度只按销售合同号投影正式订单

- 日期：2026-09-01
- 决定：Style Progress 只用 `salesContractNo` 读取 SalesOrder；禁止款号、工厂款号、品牌或数量模糊匹配，禁止自动创建订单。无订单合同引导至艾诺科同步。
- 原因：复用正式订单去重与匹配边界，避免建立第二套 Matcher。

### D-053 逐物料物流复用现有排单和路线事实

- 日期：2026-09-01
- 状态：Superseded by D-065 / D-068。
- 原决定：逐物料建议扩展既有 `material-logistics-service.ts`，使用 Actual 齐套日，否则使用 Effective；使用最早相关正式 ScheduleAssignment，并在可行方式中选择最慢方式。缺排单或路线明确显示待配置，不猜运输方式。schemaVersion 11 将 Material ImportBatch、Raw、Demand、Events 与 Override 纳入既有 Backup / Restore。
- 原因：物流建议必须随排单与预计到料变化重算，同时保持唯一运输模型和恢复边界。

### D-054 未持久化的集货仓不得由 UI 或基础资料推断

- 日期：2026-09-01
- 状态：Active
- 决定：逐物料物流只把 `OrderExecutionTracking.supplyHubId` 视为订单的正式 SupplyHub。下拉首项、首个启用仓、唯一仓或唯一路线都不得自动成为业务事实；缺 Hub、Site、Route、TransportMode 时返回各自精确原因，只有 Hub 与 Site 均存在后才按稳定 ID 查路线。Style Progress 在具体 Batch 推荐或 Detail 中展示物流依据，主页面不重复整条依据卡；生产弹窗缺 Hub 时回显“未设置”。
- 原因：基础资料存在不等于订单已经选择；自动展示“宁波仓”会让用户误认为 D1935 已保存集货仓，并把前提缺失误报为路线缺失。

### D-055 Quote 搜索采用可组合的 AND 语法

- 日期：2026-09-04
- 状态：Active
- 决定：普通空格 token、`/字段 值` 结构化条件以及二者的组合均按 AND 计算；`/制作国家` 扫描 Quote 下全部 PriceVersion 的制作国家快照。
- 原因：报价人员需要在同一列表中把模糊身份信息与明确业务字段叠加筛选，不能因切换语法而丢失其他条件。

### D-056 颜色级取消是来源数量之上的追加调整

- 日期：2026-09-04
- 状态：Active
- 决定：部分取消不改写来源颜色行，以 append-only adjustment 计算有效数量；艾诺科重同步只更新来源数量，并保留全部人工取消记录。
- 原因：同步事实与人工业务决定必须分别追溯，重同步不得恢复已取消数量。

### D-057 默认加工币种只初始化新事实

- 日期：2026-09-04
- 状态：Active
- 决定：系统 `defaultProcessingCurrency` 当前默认 USD，只用于新建手工订单、新价格调整和新关账记录；既有订单价格、Quote 与 Closing 快照不重算。
- 原因：系统默认值是录入辅助，不是覆盖历史业务事实的全局口径。

### D-058 生产物料状态只消费 Style Progress Projection

- 日期：2026-09-04
- 状态：Active
- 决定：生产排单不再维护重复的手工物料日期；物料状态、异常与物流入口读取 Style Progress Projection。生产执行 UI 的承诺日期统一称为“拟定交期”。
- 原因：消除同一物料日期的双写与漂移，并让术语与当前业务语义一致。

### D-059 actualConsumption 读取 Excel 的精确数值列

- 日期：2026-09-04
- 状态：Active
- 决定：`actualConsumption` 读取表头“厂供”的实际用量数值，不再把“提供方式 = 厂供”转换为计划用量。旧错误快照仅在当前 ImportBatch Raw Snapshot 能确定对应数值时迁移，否则为 `null`。
- 原因：这是对已确认 Excel 列语义的实现纠正，不是新增的 AI 假设；供货方式与实际用量属于不同事实。

### D-060 关账采用月份总览到月份详情的工作流

- 日期：2026-09-04
- 状态：Active
- 决定：`/closing-center` 提供月份倒序、按年分组和状态筛选；`/closing-center/detail?month=YYYY-MM` 由路由月份决定归属、KPI、订单行和动作。`confirmed` 与 `locked` 保持独立，锁定后普通编辑被拒绝，高权限重开必须填写原因。
- 原因：月份状态需要先总览再进入单月工作面，同时确认与锁定承担不同控制强度，不能合并。

### D-061 厂供退出 Operational Material Control

- 日期：2026-09-05
- 状态：Active
- 决定：`提供方式=厂供` 保留 Raw Snapshot 与 Source Trace，但不进入采购跟进、未采购/待入库、齐套率、风险、物流推荐或 Expected Arrival Batch。普通 UI 只在存在厂供时显示“厂供信息”，不得把缺 PurchaseEvent 的厂供显示成未采购。
- 原因：厂供是来源信息，不是织序采购执行对象；把它纳入运营指标会制造虚假缺口。

### D-062 materialCode 降级为 Source Identity

- 日期：2026-09-05
- 状态：Active
- 决定：艾诺科 `materialCode` 只用于来源追溯，普通款式进度按 `salesContractNo` 内的 Canonical Material Group 展示真实物料。来源编码、规格和颜色继续保留在下层 Demand/Trace，不跨合同聚合。
- 原因：一个真实物料可能对应多个来源编码，Excel 行或编码不能直接充当用户物料身份。

### D-063 面料以名称、门幅、克重和唯一采购价归一

- 日期：2026-09-05
- 状态：Superseded by D-069。
- 决定：同一销售合同内，面料以标准化名称 + 门幅 + 克重 + 正常化后的唯一采购单价判定 Canonical identity。价格缺失或存在冲突时保持独立并显式标记，不取 first / last，也不计算平均采购价。
- 替代原因：当前业务明确要求同名面料在顶层合并，门幅、克重和采购价降级为组内 Variant 事实。

### D-064 辅料按标准化名称归一

- 日期：2026-09-05
- 状态：Superseded by D-069。
- 决定：同一销售合同内，辅料按标准化名称直接聚合；来源编码、规格和颜色不参与顶层身份，但必须保留在下层需求明细。
- 替代原因：D-069 以一条统一规则同时覆盖面料和辅料，并明确合同与物料类型隔离。

### D-065 Effective 是 Expected Arrival at SupplyHub

- 日期：2026-09-05
- 状态：Active
- 决定：Source 是艾诺科来源交期；Effective 正式定义为货物预计到达已持久化 SupplyHub 的日期，并由 Expected Arrival Batch 表达；Actual 只能由 InboundEvent 等实际事件产生。缺 SupplyHub 必须显示“集货仓未设置”，不得推断默认仓。
- 原因：跟进、运输推荐与预计到厂必须共享一个明确地点语义，同时保持来源、人工计划和实际事件分离。

### D-066 一个真实物料支持多批 Expected Arrival Allocation

- 日期：2026-09-05
- 状态：Active
- 决定：一个 Canonical Material 可保存多个 Expected Arrival Batch；Allocation 稳定引用 `materialDemandId`，允许一项 Demand 拆入多批和部分未安排，但全部批次累计不得超过需求数量，系统不得自动补齐。manual Batch 在重导入时保留，只有“恢复使用来源计划”才重新跟随 Source。
- 原因：真实到料经常分批且同一颜色跨批次，单日期模型无法表达执行事实。

### D-067 人工到料批次不绑定来源事件

- 日期：2026-09-05
- 状态：Active
- 决定：人工计划 Expected Arrival Batch 不强制绑定 PurchaseEvent、InboundEvent、ShipmentEvent 或 OutboundEvent，也不得按日期、数量、颜色或顺序自动猜测关联。计划与四类事件可以并排比较，但保持独立事实身份。
- 原因：缺少稳定外键时自动配对会制造无法审计的虚假关系。

### D-068 每批复用唯一物流服务并独立计算 buffer

- 日期：2026-09-05
- 状态：Active
- 决定：每个 Expected Arrival Batch 独立调用 `material-logistics-service.ts`，在可按时到厂的方式中选择最慢者；“距上线”是计划开工减预计到集货仓的自然日差，运输 buffer 是最晚到厂减预计到厂。`bufferDays > 7` 为 green，`0..7` 为 yellow，`< 0` 为 red / 晚 X 天。
- 原因：同一物料不同批次可能需要不同运输方式；距上线不是物流安全判断，不能混为一个数值或状态。

### D-069 Canonical Material 统一按合同、类型和标准化名称归一

- 日期：2026-09-08
- 状态：Active；替代 D-063 / D-064。
- 决定：Canonical identity 固定为 `salesContractNo + materialType + normalizedMaterialName`。同一合同、同一类型、同名的面料或辅料必须汇总为一个 Material Group；`materialCode`、颜色、规格、门幅、克重、采购价、供应商和采购单号只作为组内 Variant / Demand / Event 事实保留。不同合同或不同物料类型绝不交叉合并。
- 迁移：Style Progress IndexedDB v3→v4 确定性重映射旧 `canonicalMaterialKey`；保留所有 Expected Arrival Batch、Allocation、manual/source 语义和审计元数据，碰到无法证明安全归属的跨名称批次则拒绝猜测迁移。迁移幂等且不改变稳定 namespace。
- 汇总：需求、采购、入库、出运和出库只从组内 child Demand / 对应 Event 各累加一次；Group Ready 要求全部有效 child Demand 齐套。来源没有可靠单位字段时不猜测单位，也不跨虚构口径相加。
- 原因：普通工作台需要按业务人员识别的物料名称形成唯一顶层对象，同时完整保留执行层差异和来源追溯。

### D-070 艾诺科使用个人账号与 OS Credential Store

- 日期：2026-09-08
- 状态：Active
- 决定：正式关系为 `Zhixu User → 0..1 Personal Ainuoke Account`，不建立公司共享账号。Password 只存 Windows OS Secure Credential Store；Ainuoke token/session 只在 Local Bridge 内存中按 mock `User.id` 隔离。Bridge 只绑定 loopback，并使用精确 Origin allowlist、HttpOnly bridge session 与 CSRF nonce保护请求上下文。
- 限制：当前 Zhixu User 是 browser-local mock identity，前端 userId 不能视为生产可信身份；本实现只能称为本地 Windows 原型。艾诺科登录仍为 HTTP，bridge 到上游链路没有 TLS。
- 原因：保留艾诺科本人的权限和待办身份，同时阻止 credential/token 进入浏览器长期数据、业务模型、备份、日志或 Git。

### D-071 Direct API 只作为固定 Catalog 的 Source Adapter

- 日期：2026-09-08
- 状态：Active
- 决定：Direct API 只允许 `6086103`、`6086997`、`6087050`，Browser 传 catalog key 而不是 reportId。Bridge 负责 login/auth/paging/timeout/retry/sanitize/read DTO；来源快照保留 report、fetch timestamp、paging、total、source row identity、query context、schema 与 deterministic hash。
- 边界：6086103/6086997 后续进入既有 `AinuokeContractMirror` 和 matcher/service；6087050 后续进入既有 Material Normalize/Dedup/Validate/Preview/commitImport。本阶段不 commit，不提供 write endpoint，不创建第二套 Matcher、Dedup、Canonical resolver、Logistics 或 OperationLog。
- 原因：API 与 Excel 只是不同 Source Adapter；领域规则和持久化边界必须保持唯一。

### D-072 废弃旧历史排单与生产预警的未解决 Review backlog

- 日期：2026-09-09
- 状态：Active
- 决定：旧历史排单计划产生的 unresolved `schedule_match` 与旧生产预警/关账迁移产生的 unresolved `closing_match` 不再作为必须人工处理的迁移债务，允许用户通过 `/ainuoke-sync` 显式确认后精确清理。清理不是 load migration 或 validator 行为，且执行前必须完成 DEV Backup。
- 保留：`order_match`、`data_anomaly`、已经 resolved 的 `schedule_match` / `closing_match`，以及合同镜像、ImportRun、SalesOrder、排单、关账、生产基础资料和 Style Progress 全部保持不变。清理复用 `ainuoke.resolve_conflict` 与唯一 OperationLog，只记录删除数量元数据。
- 后续：真实排单与生产相关业务数据会以新的正式方式进入织序；该方式当前仍为 TBD，本决定不定义或猜测未来录入路径。
- 代码证据：`features/ainuoke-sync/service/ainuoke-historical-review-cleanup.ts` 与 `tests/ainuoke-historical-review-cleanup.test.mjs`。

### D-073 当前物料同步以 Direct API Snapshot 为准并共用唯一 Domain pipeline

- 日期：2026-09-09
- 状态：Active；Source 与 pipeline 决策保留，阶段性“只 Preview”写入边界由 D-074 接续。
- 决定：6087050 当前同步以 Ainuoke Direct API 当次返回为 authoritative Source Snapshot；历史 Excel 是导出时间点的 historical source。两者不要求 row-count、snapshot-hash、source-row-identity 或跨时间点数据 parity，不得为匹配旧 Excel 人为过滤当前 API 数据，也不得把某次 261/262 行固化为业务常量。
- 一致性边界：Excel/API 相同业务字段必须保持同一语义，并在各自 transport adapter 后进入唯一 Material Normalize / Dedup / Validate / Preview。API 字段只有在真实 metadata/rows 能证明语义时才映射，否则保持 `null`/empty。Canonical Material、厂供排除、Source/Effective/Actual、事件构建与物流规则不得在 API adapter 中复制或改变。
- 写入边界：Gate 3 只运行内存 Preview；不提供或调用 `commitImport`，不写 Style Progress Repository、ExpectedArrivalBatch、SalesOrder、Scheduling 或 Closing。真实 Material commit 必须由后续独立 Gate 再次明确授权。
- 代码证据：`features/style-progress/source/ainuoke-material-api-adapter.ts`、`features/style-progress/parser/material-normalization-pipeline.ts`、`features/style-progress/service/ainuoke-material-api-preview.ts` 与 `tests/ainuoke-material-api-preview.test.mjs`。

### D-074 6087050 只通过既有 commitImport 提交当前完整 Snapshot

- 日期：2026-09-09
- 状态：Active；2026-09-10 真实 DEV D1935 acceptance 已完成。
- 决定：6087050 API Material commit 的唯一路径为 Preview → 薄 `commitAinuokeMaterialApiPreview` orchestration → existing `styleProgressRepository.commitImport`。orchestration 只负责 `style_progress.import`、完整性/stale-preview 校验和既有语义 OperationLog，不复制 Normalize、Dedup、Validate、Canonical resolver、Event construction 或 Expected Arrival 规则。
- Identity / resync：ImportBatch identity 使用 reportId、normalized InsideOrderNo 与 canonical source row content，不使用 fetchedAt。同 Snapshot 重复提交新增为 0且不追加重复业务日志；新完整 Snapshot 按 affected contract scope 替换全部 prior-source current Demand/Event facts，而不只替换旧 API facts，历史 Excel/API Raw/ImportBatch Trace 保留。
- 业务保留：manual Effective 与人工 ExpectedArrivalBatch 不被重同步覆盖。Excel/API Demand ID 不稳定时只按确定性业务身份做唯一 remap，零或多候选 fail closed；source-following 批次刷新；Actual 只来自实际 Event；厂供保留 Raw/Trace 但退出采购、齐套、风险、物流与 Expected Arrival 运营指标。提交不修改 SalesOrder、Scheduling 或 Closing。
- 验收边界：UI 必须 Preview-first 并二次确认，提交绑定用户所见的 immutable Preview。2026-09-10 用户完成 DEV Backup 后本人确认 D1935 commit；AFTER 为 262 Source rows、255 Demands、12 Canonical（面料 2、辅料 10）与 183/153/150/150 四类 Events。旧 Excel operational facts 已退出，历史 Trace、manual Effective 和刷新持久化均通过验收。
- 代码证据：`features/style-progress/service/ainuoke-material-api-commit.ts`、`features/style-progress/repository/style-progress-repository.ts`、`features/ainuoke-sync/components/ainuoke-sync-page.tsx` 与 `tests/ainuoke-material-api-commit.test.mjs`。

### D-075 艾诺科统一同步只编排既有 Contract 与 Material 领域提交

- 日期：2026-09-10
- 状态：Active。
- 决定：API 日常入口以 `InsideOrderNo → 一次刷新 → 统一 Preview → 必要时一次确认` 聚合固定 6086103、6086997、6087050；统一层只接收受限 `insideOrderNo`，继续使用 Bridge Catalog，不接受 raw reportId、sqlCdtn 或 conditionList。
- 领域边界：读取分别复用 `buildAinuokeContractApiPreview` 与 `buildAinuokeMaterialApiPreview`；确认分别调用 `commitAinuokeContractApiPreview` 与 `commitAinuokeMaterialApiPreview`。Matcher、Order mutation、Material Normalize/Dedup/Canonical、`commitImport`、Expected Arrival 与 OperationLog 均保持既有唯一实现。
- No-change / 权限：合同与物料都无变化时不要求确认，也不产生 ImportRun、Repository write 或 OperationLog。合同写仍要求 `ainuoke.sync`，物料写仍要求 `style_progress.import`；统一 Preview 只要求 `ainuoke.view`，不新增超级权限。
- Failure safety：当前 browser-local Repository 无法提供跨领域 ACID。确认前必须完成两侧 validation、immutable Preview 与本地 baseline stale guard；提交顺序为 Contract → Material。合同成功而物料失败时明确返回 partial failure，不伪造 rollback；用户重新刷新后依靠两侧既有幂等只提交仍有变化的领域。
- 真实验收：2026-09-10 alternate/isolated Browser Profile 首次 D1935 统一 Preview 显示 contract auto-create 1 与 material changed；用户本人确认后两侧均 success，随后同一 D1935 只读刷新两侧均 no-change。该 Profile 的 `0/0/168 → 1/1/169` 不能标作 Gate 3C 原真实 DEV dataset。回到 Gate 3C 同一 Chrome Profile 后，D1935 原有 12 Canonical（2 fabric + 10 trim），SalesOrders/Mirror/ImportRuns 为 464/487/4；一次只读统一刷新显示 Contract changed、Material no-change，确认按钮出现但未点击，未执行 commit。
- 代码证据：`features/ainuoke-sync/service/ainuoke-unified-sync.ts`、`features/ainuoke-sync/components/ainuoke-sync-page.tsx` 与 `tests/ainuoke-unified-sync.test.mjs`。

### D-076 正式 SalesOrder 采用 Ainuoke clean bootstrap，Browser Order/Scheduling 测试数据不迁移

- 日期：2026-09-10
- 状态：Active；只确认长期数据边界与 bootstrap 方向，不授权 Phase 2B、真实 bootstrap 或任何删除。
- 决定：未来正式 SalesOrder 从 empty PostgreSQL 经固定 Ainuoke discovery 和 6086103/6086997/6087050 detail reads 建立新的正式 PostgreSQL identity；当前 Browser Order Center / Scheduling 是功能测试数据，不是 migration/bootstrap authority，也不要求继承其 SalesOrder ID。新正式 identity 一旦建立必须保持稳定，以承载未来 Zhixu-owned state、Quote/reorder provenance、Scheduling、Closing 与 OperationLog references。
- 保护边界：Quote Center 的 Quote/Revision/PriceVersion/provenance/附件是真实业务数据并必须保护；Style Progress/Material 不属于 Order/Scheduling retirement 范围；Closing retirement status 仍为 Needs Decision。
- Discovery scope：当前只证明 6086103 空条件列表可完整遍历 `current_account_visible`，不能声称 company-wide。完整 Snapshot 内所有 visible contracts 都参与 future clean bootstrap；`生效`、`草拟` 或其他 raw Status 不作为 inclusion/exclusion filter，仅作为 source fact 保留供显示、审计、排查和未来可能的业务规则。当前观察到 505（生效 143、草拟 362）只属于本次 Snapshot，未来以当次完整 Snapshot 为准。账号 visibility scope 仍需确认；source disappearance 不得单独触发 hard delete。
- Retirement：旧 Browser Order/Scheduling 可以在未来退役，但只能通过独立 Test Business Data Retirement Gate；必须先完整 backup、dependency audit、精确 delete/protect scope，并取得用户 explicit destructive confirmation。此决定本身不授权清理。
- 证据：`docs/features/AINUOKE_ORDER_DISCOVERY.md`、`docs/features/SALES_ORDER_PERSISTENCE.md`、`features/ainuoke-api/source/ainuoke-order-discovery-adapter.ts` 与 Discovery/Bridge tests。

- 证据：`features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts`、`features/ainuoke-sync/service/ainuoke-garment-color-size-validation.ts` 与 `docs/features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`。

## Superseded

### D-039 新订单中心使用 SalesOrder + OrderItem 多款聚合

- 日期：2026-08-27
- 状态：Superseded by D-040。
- 旧决定：SalesOrder 承载订单头，OrderItem 承载款式执行事实与 Quote 来源；一张订单允许多款，翻单保存 `sourceOrderItemId`，未来 ProductionPlan/ClosingAllocation 以 OrderItem 为 owner。
- 替代原因：最新业务规则明确一张 SalesOrder 只允许一个款式。v6 已将 OrderItem 限定为 migration-only `LegacyOrderItem`，所有新 Runtime 关系直接归属 SalesOrder。
- 历史证据：第三批 v5 模型与 `tests/order-center.test.mjs` 的旧版本；当前迁移器仍能读取该结构。

### D-034 制作国家预设形成 Revision 报价参数与费用快照

- 日期：2026-08-26
- 状态：Superseded by D-035。
- 原决定：制作国家、预设 ID、加工币种和加成率保存在 QuoteRevision，并把预设运费同步到全部 PriceVersion。
- 替代原因：同一 Revision 的并列 PriceVersion 需要独立制作国家、币种、加成率和运费，Revision 级口径会互相覆盖。

### D-S05 报价明细以 1200/700 纯 viewport 选择 Full/Compact

- 原状态：D-025 使用 `>=1200px` Full、`700–1199px` Desktop Compact，并以 Container Query 作为回退。
- 替代：D-031 让 Card 实际内容宽度决定 Wide，并只用 `700–1099px` 保护半屏完整编辑。
- 处理：保留 D-025 的 Compact `3 + 6`、`3 + 4`、`2 + 4` 分组、共享 ViewModel/row ID/回调/公式及 True Mobile 边界；替换会在缩放后桌面制造横向滚动的固定 viewport/表宽规则。

### D-S04 成本 renderer 只由 Card 容器宽度决定

- 原状态：D-024 使用 `>=1150px` 宽表、`700–1149px` 紧凑卡、`<700px` 窄卡的纯 Container Query。
- 替代：D-025 为报价明细增加 1200/700 视口边界，Container Query 降为嵌入式回退。
- 处理：保留 renderer 共享状态、焦点交接和无横向滚动约束，替换会让半屏过早进入窄布局的选择规则。

### D-S03 仅用四级 width 断点决定 Mobile

- 原状态：D-022 使用 `<768px => Mobile`，并让 Quote Center Mobile 筛选进入 Bottom Sheet。
- 替代：D-023 使用 viewport + hover/pointer 共同决定全局模式，筛选始终直接显示为 6:2:2。
- 处理：保留四级布局名称和手机轻编辑能力，但纯 width 的全局设备判断与筛选 Sheet 已废止。

### D-S01 “项目尚无 Foundation”审计结论

- 原状态：`docs/ui-audit.md` 在 2026-08-17 记录了当时缺少 Foundation 的现状。
- 替代：当前已存在 `components/foundation/` 并被 Quote Center/基础设置使用。
- 处理：保留原文作为历史审计，不再用于判断当前实现。

### D-S02 Quote Center 迁移计划作为现状依据

- 原状态：`docs/quote-ui-migration-plan.md` 描述计划中的结构和步骤。
- 替代：当前代码、测试以及 `docs/features/QUOTE_CENTER.md` 是现状依据。
- 处理：迁移计划继续作为设计背景，未实现条目不能视为当前承诺。

## Deprecated

### D-D01 `currentRevisionId` 作为当前版本指针

- 状态：只为旧存储数据兼容保留。
- 新代码：写入和读取应优先使用 `defaultRevisionId`。

### D-D02 历史浏览器存储版本

- 状态：基础设置 repository 可读取旧版本 key 并迁移，但新数据写入当前 key。
- 约束：不要以旧 key 的结构扩展新功能；保留兼容读取直到有明确数据迁移/清理决定。
