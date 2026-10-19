# Gate2订单商业版本：本地工程证据

日期2026-10-14；main最近核实064e3afaf7d08b3cb62907d4402f97d9c292f1e5；branch feat/order-commercial-versions。业务源码检查点9ab31cf6bbf3b2ea75daf3f167a8ace19ab4f64d，基础修复1a78c47f119a132a9040d1a8d4f0eb4be871c0b5。此文件本身先提交后绑定完整SHA，不自引用未来提交。

## 已确认

0015在一次性tmpfs PG建立不可变订单商业版本及head；精确来源候选、显式预览/采用、CAS/请求幂等/实时授权/审计原子提交。订单和来源身份不变；同报价多单不共用动态现价；旧Order写接口关闭，报价CCT仍可确认。删除报价/PV后已采用快照保留，软删除报价不能新采用。零与未知分别处理，加工售价不适用，币种沿用旧约束，无新汇率。

读写API使用可信session，售价/工价分开投影；认领、有效生命周期、业务类型及来源版本检查。合成七角色验证；无真实账号变更。历史cutover-preview限1–100个精确UUID、只读事务，显式观察时间和originalOrderPrice=not-proven；没有真实扫描/回填。

界面复用Foundation卡片及Modal，精确报价/Revision/PV选择、预览差异、原因和采用；不确定响应保留原请求重试。源码未重设计其他页面。最新显式Server构建后Chromium4/4通过：真实合成session、一次采用、刷新保留、报价变更不覆盖、390px布局、物控不见金额/采用入口。此前1440/390截图仅合成、在ignored outputs/order-commercial-ui检查，无用户人工验收声明。

## 验证

- 完整test:postgres第二轮261/261 PASS，outputs/gate2-postgres-tests-rerun.log；初轮236/248。失败涉及旧共享Order测试、迁移名单/权限数和旧工具认领表依赖，已修，不跳过原权限/审计/锁/回滚检查。
- test:order-commercial29/29（领域/HTTP/七角色/软删除）；商业主回归19/19；身份/升级15/15；交付计划17/17。
- npm test817/817（业务代码阶段）；后续门禁工具增加7项连续证据版本回归，test:release-baseline78/78 PASS，定向8/8含原单版本检查。
- 类型检查、增量eslint、server:build、显式Server候选构建PASS；完整lint此前UI阶段通过，最终增量无lint错误。
- 精确main基线在新增前向证据链后PASS（working-tree检查）；最终提交须再次验证。

门禁补充：旧校验仅支持基线上的一跳修订，新实现要求多跳链追溯真实PR基线，所有中间blob仍核hash；悬空、循环、分叉、路径/类型变化、篡改及无锚链拒绝。旧记录/PNG未覆盖。第一次补证前positive测试因D122证据漂移失败，添加冻结前向证据后全绿；未通过回退日志消除错误。

## 状态边界

Implemented=yes（Gate2范围），isolatedTest=passed-historical；merged=false；humanAcceptance=not-run；sourceActivation=not-applicable；18443/18444=not-deployed。历史环境image/sourceSHA沿用旧记录，未重新探测。远端交付/CI均未核实，不能称PR完成。CI已增加商业、浏览器及全PG命令。

Gate1旧HEAD交付回执pushes=0；兼容补修现为def98f275c2ef61712008891ab1c60d308981bb7。两分支需保留各自增量后整合，禁止把Gate2全部混进Gate1。未自动merge、部署或真实DB迁移。

Server完整生产冻结/关账尚未实现；本Gate只阻断completed/cancelled采用，不冒称已接完整冻结流水。历史共享价不能冒称原始下单价。加工正式批次/双入口Gate3、历史归一Gate4、页面/新来源Gate5未完成。Goal保持active。真实升级/归一/采用另行授权。

更新时机：修复、测试、基线、远端或发布状态变化时新增证据版本；旧日期/hash/限制保留。
