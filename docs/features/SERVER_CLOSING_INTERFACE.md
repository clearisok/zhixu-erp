# Server关账：浏览器契约与原请求协议

2026-10-27，Gate8E1，D167。复用[Gate8B命令](SERVER_CLOSING_COMMANDS.md)、D162手工关账与既有价格快照，不另建价格、关账或日志系统。当前未接页面/真实session/provider/导航，不能称可体验。

## 协议

server/closing/contract.ts变为浏览器安全的原唯一输入校验，HttpError/UUID/Unicode检查不再牵入PG/Node；金额计算仍由Server命令/查询调用，客户端只校验投影而不计算售价、成本、税额或汇率。read-contract.ts共用原分页/过滤规则，read-service保留兼容导出。税率仍在新建期间时显式填写/确认，无默认13%、全局继承或税率更正命令。

原commands/:requestId回执附不可变commandHash。服务先重核原命令、UUID和摘要，再返回最小结果；不同actor相同UUID仍隔离。没有原command、价格或原因泄露。历史响应增加entityType/entityId，即使空页也绑定原对象；发生时时间输出ISO，不查询当前姓名来伪造历史。

features/closing-center/server/closing-client.ts及closing-projection.ts只访问同源可信Server API，no-store、1MiB、owner lease，未启用Browser fallback或自动重试。方法覆盖basis/periods/detail/history/preview/submit/receipt；未知/额外字段、坏原语、对象/版本/页范围错配、币种冒充及隐藏金额/自由文字都拒绝。售价CNY、经销工价USD、加工服务USD各自投影，不合并币种或加工产值，不把累计生产当本月关账。

preview绑定原规范意图、期间/归属版本和手工数量；receipt绑定原requestId/commandHash/状态/精确CAS结果。报价/CCT或自由价格不会进入关账命令。历史锚点和分页保持原Server能力，旧open历史仍不能冒充冻结完整快照。

## 临时原命令

zhixu.server.closing.pending.v1.<public-user-id>只在未来调用者提供的sessionStorage保存本actor/tab一条原规范ClosingCommand及schemaVersion/userId/savedAt。包含手工数量、期间税率、归属、用户原因与请求/hash，不含价格/CCT/成本/原响应、密码或token；用户自由文字按原意保留。131072字节上限、完整保存并读回、损坏/未来/非规范化原字节保留，不覆盖另一未决命令。

低层client.submit不会读写sessionStorage；本阶段没有页面controller，不冒称浏览器已落实保存→POST顺序。调用者将来必须先save/readback再POST，刷新只恢复和GET核对，明确unknown后才能手动原ID/原body重试，精确当前owner终态才ack清本键。不同actor、Quote或旧Browser域不互相清理。关闭标签页可能丢缓存；Server事实/审计/回执持久，不是跨设备队列或离线账本。

## 状态

WIP模型/client29和新owned合成PG真实HTTP6已通过，最终源码的类型/lint/构建/复审/守卫另记于[本阶段](../tasks/active/server-closing-browser-protocol-2026-10-27.md)，不借旧811/144预报。初次lint两个unused导入已修。关账[页面草图](../tasks/active/server-closing-ui-proposal-2026-10-27.md)已异步征询，尚无答复，等待不构成V2/V3批准；USD采用原UI问题保留。

原Gate8B冻结文档及本机失败记录保留。无schema迁移、现有库/账号、真实Source/激活/调度、合并、部署、旧环境切换/退役。最后核实main869ee84dd0b31de6161011e4aa560678b244a64d沿用同日既有证据，本阶段未重复fetch/API；远端Git/ref STOP根因UNRESOLVED。

V0精确登记三个协议helper，order-detail仅引用既有物理SO依据的保护范围。当前三个文件未被任何app/components页面调用；不表示新增order-detail调用链，也不表示关账页面已有基线、截图、导航或设计批准。未来真实关账UI须按具体批准补对应页面基线，不改guard迁就本阶段。
