# Server关账：浏览器契约与原请求协议

2026-10-27，Gate8E1/D167协议与Gate8E2/D168操作编排。复用[Gate8B命令](SERVER_CLOSING_COMMANDS.md)、D162手工关账与既有价格快照，不另建价格、关账或日志系统。当前未接页面/真实session/provider/导航，不能称可体验。

## 协议

server/closing/contract.ts变为浏览器安全的原唯一输入校验，HttpError/UUID/Unicode检查不再牵入PG/Node；金额计算仍由Server命令/查询调用，客户端只校验投影而不计算售价、成本、税额或汇率。read-contract.ts共用原分页/过滤规则，read-service保留兼容导出。税率仍在新建期间时显式填写/确认，无默认13%、全局继承或税率更正命令。

原commands/:requestId回执附不可变commandHash。服务先重核原命令、UUID和摘要，再返回最小结果；不同actor相同UUID仍隔离。没有原command、价格或原因泄露。历史响应增加entityType/entityId，即使空页也绑定原对象；发生时时间输出ISO，不查询当前姓名来伪造历史。

features/closing-center/server/closing-client.ts及closing-projection.ts只访问同源可信Server API，no-store、1MiB、owner lease，未启用Browser fallback或自动重试。方法覆盖basis/periods/detail/history/preview/submit/receipt；未知/额外字段、坏原语、对象/版本/页范围错配、币种冒充及隐藏金额/自由文字都拒绝。售价CNY、经销工价USD、加工服务USD各自投影，不合并币种或加工产值，不把累计生产当本月关账。

preview绑定原规范意图、期间/归属版本和手工数量；receipt绑定原requestId/commandHash/状态/精确CAS结果。报价/CCT或自由价格不会进入关账命令。历史锚点和分页保持原Server能力，旧open历史仍不能冒充冻结完整快照。

## 临时原命令

zhixu.server.closing.pending.v1.<public-user-id>只在未来调用者提供的sessionStorage保存本actor/tab一条原规范ClosingCommand及schemaVersion/userId/savedAt。包含手工数量、期间税率、归属、用户原因与请求/hash，不含价格/CCT/成本/原响应、密码或token；用户自由文字按原意保留。131072字节上限、完整保存并读回、损坏/未来/非规范化原字节保留，不覆盖另一未决命令。

低层client.submit不会读写sessionStorage；D168通过无界面controller串联save/readback→POST→GET原回执→精确终态ack。尚未接真实页面，不能冒称实际浏览器已落实。刷新只恢复不自动请求；明确unknown且原字节精确存在，才可由用户显式原ID/原body重试。不同actor、期间或旧Browser域不互相清理。关闭标签页可能丢缓存；Server事实/审计/回执持久，不是跨设备队列或离线账本。

## 原命令编排

closing-controller.ts复用原九类命令、client/pending/parseClosingPreview/Receipt，不改Server业务。月份列表上下文只预览创建期间，详情上下文只预览本期间命令；当前actor另一期间的未决原请求可只读核对，不能新建命令绕过。编辑/确认/锁定/重开复用原closingActionPermission，手工归属的新渠道检查原金额权限；旧渠道及全期间并集仍由Server原子鉴权，前端不冒充授权权威。读权限撤回隐藏状态；只有写权限撤回仍可核对原回执。金额可见性变化立即撤掉旧价格预览，并阻止使用旧预览提交。

每次真实会话/权限/期间代际须新owner对象，包括A→B→A；离开时dispose。串行操作、timeout/AbortSignal及晚响应lease保护原字节；onChange/onApplied/onUnauthorized前后复核owner，回调不能丢弃命令。提交一次后只GET核对，不因POST回应或HTTP异常直接清缓存。存储失败、损坏/未来原件、竞争slot或ack失败均阻断新写入。snapshot为分离副本，用户输入和渲染回调不能修改正在核对的原命令。navigationBlocked只作为待接线信号，不是已经安装离开提醒。

## 状态

精确S1 48a41fb6957c7353415e690863af48ec704c9a2e上82项受影响、811项目、lint及前后端构建通过，类型三处失败原件保留。S2 45a5b087b4b3ed19ae448188257146a516d75bf4仅改一处类型收窄及集成测试，38项（15契约＋15客户端＋8真实HTTP含父项）、类型/lint/Vite浏览器编译通过；未重复811/构建，不将两轮相加。两项独立复审P2已闭合，0剩余P1/P2。详见[冻结工程证明](../tasks/completed/2026-10-27-server-closing-interface-engineering.md)与[本阶段](../tasks/active/server-closing-browser-protocol-2026-10-27.md)。本阶段未重跑144发布负控，最终精确守卫另记，实际交付前仍需当前候选的必要完整检查。

关账[页面草图](../tasks/active/server-closing-ui-proposal-2026-10-27.md)已异步征询，尚无答复，等待不构成V2/V3批准；USD采用原UI问题保留。当前basis读取兼容最多1000当前颜色和1000历史残留行的联合诊断；稳定颜色歧义行只可只读阻断，不可变成可关账依据。1MiB及服务端原规则不放宽。

Gate8E1最终7d6ce0e5ca5011fa693dcaea9e0b93c2642ce5f3精确守卫PASS、clean，527证据/68能力。Gate8E2当前WIP19单元＋8真实HTTP（含父项）及lint通过；固定源码后的质量检查、复审和新守卫见[当前编排阶段](../tasks/active/server-closing-controller-2026-10-27.md)，不将WIP当最终结果或重复挪用811/144。

原Gate8B冻结文档及本机失败记录保留。无schema迁移、现有库/账号、真实Source/激活/调度、合并、部署、旧环境切换/退役。最后核实main869ee84dd0b31de6161011e4aa560678b244a64d沿用同日既有证据，本阶段未重复fetch/API；远端Git/ref STOP根因UNRESOLVED。

V0精确登记三个协议helper，order-detail仅引用既有物理SO依据的保护范围。当前三个文件未被任何app/components页面调用；不表示新增order-detail调用链，也不表示关账页面已有基线、截图、导航或设计批准。未来真实关账UI须按具体批准补对应页面基线，不改guard迁就本阶段。

D168新增controller亦单独V0登记同一保护范围；仍无app/components引用，不扩大为已批准页面或真实运行状态。
