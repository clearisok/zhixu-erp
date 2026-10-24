# Server 生产排单计划

2026-10-24，D147/G6B当前工程候选。直接关系为SalesOrder→Assignment，不恢复ProductionPlan层。
实际阶段及源码见[当前任务](../tasks/active/server-production-planning-current-2026-10-24.md)。
本文描述当前代码职责，不代表已合并、部署、真实目标升级或人工业务验收。
Browser历史仍见[原排单功能](PRODUCTION_SCHEDULING.md)，旧账本、Seed及公式兼容保持。

## 业务与数据所有权

- 新计划须归当前有效、未完成/取消的可信艾诺科合同SO或已消费加工批次SO；不要求认领、负责人
  或报价商业采用。历史重复可解释原计划，不搬移或汇总到另一SO；没有伪艾诺科加工来源。
- 计划数量为精确非负小数字符串，允许零；来源需求、DeliveryPlan、未来实际完成及关账量独立。
  超排保留真实值并警告，不修改客户需求、不硬套颜色配额、不把未知需求当零。
- 内部生产组与外发厂互斥。新建/换执行方采用启用资源链的完整事实；普通编辑保留旧采用的
  日历/名称，主资料改名/停用不回算历史。明确队列重排才采用最新资源；固定日期不自动移动。
- 所有日期明确输入，没有“今天”业务默认。工期按原ceil规则，精确BigInt运算；工作日/日产量
  二选一作为权威输入。交接日等于前款结束日，但不计完整生产工作日；外发仅固定日期。
- 技术边界明确失败而非截断：每订单/组最多500计划、36600工作日及整次36600扫描日、完整
  响应1MiB。固定日期不冒充已算日历，firstProductionDate/nonWorkingDayCount可为空。
- 6B仅planned/cancelled计划。实际开工/完成、物料物流、出货及关账由后续Gate实现；队首称
  “计划队列”，不表示正在生产。纯计算内核有执行保护字段，不能据此声称当前HTTP已有执行事实。

## SQL、身份与不可变历史

0035前向新增7表、历史约束及来源父行冻结；不回填、搬移旧数据或授权角色，不改0034。
单条计划、SO计划集合、生产组队列分别CAS；每次变化都追加准确版本，SQL不允许漏中间版本、
补造旧版本、改身份或删除历史。取消保留计划、资源事实、审计及原请求。

资源快照按完整规范化事实SHA256去重，含组/地点/日历全部例外，或外发厂；不能只存master ID/
version或用当前名称解释历史。快照首次记录时间与计划采用时间不同；采用证据在计划版本和审计。
完整资源包装在原SAVEPOINT中按PG真实jsonb::text字节检查，超1MiB形成持久422拒绝，资源主档
仍有效；不扩大上限、截断例外或拒绝原合法字符。

颜色沿用0028的SO+规范化颜色名稳定身份；数量、交期或整行来源hash变化不重建ID。非金额helper
也供商业读取使用。当前来源持有单可不同于执行SO，但稳定颜色仍归执行SO；歧义新颜色阻断，
已有历史颜色保留并提示核对，不猜改名或取重复名第一行。

归一只读引用盘点纳入计划、版本、成功命令桥接和完整快照。原拒绝回执只在actor/request范围，
没有成功订单桥接，不冒称全量操作清单；外部生产/财务覆盖仍unavailable，不恢复归一公开写入口。

## 并发与命令

写锁次序：有效归属fence→fresh用户/稳定角色/授权→actor/request→单个排单事务写锁→资源共享
scope→所有受影响有效组的物理SO按UUID冻结→来源及采用事实。资源CRUD在同scope取独占锁。
来源writer及SQL触发器先锁物理SO父，防止删/插颜色、合同、交期在预览复核后竞争。
批量议价预览在逐单前整批冻结物理成员，避免与跨单重排相反锁序；不改变金额公式或CCT。

预览用一致性只读事务；提交重算完整指纹，包含actor、意图、订单/颜色/交付需求、队列/版本、
全部前后变更及完整资源事实。同一actor/request只产生一个不可变结果；换内容拒绝。
404/409/明确预算422在SAVEPOINT回滚本次计划、历史、集合头和审计后保存小型rejected回执。
SQL/审计/连接未知异常整体回滚，不伪装已知拒绝或自动POST重试。

## 非金额查询与API

唯一 `/api/v1/production-scheduling`，仅可信session。读取同时要求order.view、schedule.view；
create另需schedule.create，update/cancel/replan需schedule.edit；回执重验对应权限。
数据库授权为准，写事务锁住fresh身份/角色/授权至提交，没有新增grant或隐式管理员。
POST仍经同源/CSRF及正文上限。DTO不含售价、工价、裸外发价、币种、实际完成或物流推算。

| 接口 | 职责 |
| --- | --- |
| POST /preview | 精确create/update/cancel/replan意图→变更、警告、版本、previewHash；不写库 |
| POST /commands | 原requestId/intent/previewHash→同事务变更、版本、审计、回执 |
| GET /commands/:requestId | 当前actor的known/pending/unknown，不因unknown自动重发 |
| GET /orders | 有效可信订单先聚合已排量/筛选，再分页；精确已排、剩余、超排 |
| GET /groups | 自然排序和完整候选预算，含停用但有计划组及批量队首订单摘要 |
| GET /orders/:id | 原SO/稳定颜色/交付需求、全部计划、资源摘要及当前可操作性 |
| GET /groups/:id | 有界完整队列、队列版本及同事务ordersById |
| GET /assignments/:id | 当前计划、完整采用资源及按版本锚点分页历史 |

订单allocation为all/remaining/unassigned/partial/allocated/overassigned/unknown；默认remaining
只列已知正剩余。需求零且已排零为allocated；未知不冒充未排零值。仅按物理SO汇总未取消计划，
不加历史别名执行量。按ID及队列仍可读冻结/历史原事实，eligible=false。
搜索仅业务身份/客户/品牌/参考字段，空格AND，%/_按文字；不搜价格、CCT或确认JSON。
count/page同一REPEATABLE READ快照；每页1–100、offset≤100000，下一页超窗明确422。
组完整候选≤5000，不截断后伪报总数。历史每页50，首读asOfVersion后续沿用；追加版本不挤动
原页，各页资源按不可变hash校验/批量解释，不拿当前master名称补造历史。

## 既有页面与原请求恢复

/production-scheduling通过authority wrapper选择唯一owner。Server须orderRead=snapshot和上述
权限，不挂Browser排单/订单/资料/款式进度repository。菜单、MasterDetail、队列/订单池、表单及
Foundation弹窗/抽屉沿用原布局；空库无默认组、地点、日历或订单。
数量/日产量保持字符串，工作日/日期明确输入；零剩余不提供误触的一键零修改。取消/重排先预览，
等待期间禁用字段，保存后重新GET当前列表，不把发生时回执当最新事实。移动搜索与视图按钮分行。

独立sessionStorage键 `zhixu.server.production-plan.pending.v1.<public-user-id>` 每actor/tab最多
一条原命令；完整写入并读回后才POST。缓存无密码/token/价格或Browser业务快照。
缺失/损坏/未来schema不回退内存或Browser、不静默删除；登录A→B→A的旧响应不能消费新缓存。
恢复先GET核对原请求；同会话、同字节且明确unknown后，用户才能重试原ID原内容。
known applied/rejected且身份/hash匹配才移除缓存；pending、裸错误、错hash、撤权保留。
具体查看订单、返回、退出和历史按钮遵守同一未保存/忙碌/未知导航保护。

## 验收和不扩大的授权

工作态快照容量用例已真实先红后绿，详见当前任务；冻结源码的完整API/升级、浏览器、构建和发布
结果按实际SHA另记，不借原919结果或#125CI。旧测试/失败/PNG仍保留，新证明单独冻结。
不升级3001/50426/59069/62426或既有库/卷，不访问真实凭据/艾诺科、不绑定/激活/调度、不自动
合并、部署或退役。完整生产闭环及用户体验仍依赖后续Gate和独立运行验收。
