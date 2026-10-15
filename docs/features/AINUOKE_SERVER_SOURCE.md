2026-10-16当前工程（D141）：内部一次性协调服务复用两个合同固定worker和D139快照事务，先精确plan/全部验证再逐SO发布；部分成功/COMMIT未知分别报告，不自动重采。新22/22、相关172/172、类型/Server编译/完整源码lint、root898/898、基线94/94、精确main守卫（42能力）及干净默认Browser构建通过。没有新增HTTP、CLI、调度或目标启用；真实过滤/范围授权仍待。UI/0025不改，D140原41能力/截图按其旧日期SHA阅读。恢复[受控采集任务](../tasks/active/ainuoke-payment-controlled-collector.md)与[货款申请模块](AINUOKE_PAYMENT_REQUESTS.md)；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，源码/证据/授权变化时更新。

## 6086941隔离存储与读取（D139，工程候选）

`ainuoke_payment_source_targets`逐SO显式登记、默认disabled，要求对应既有Source profile账号与单独查询核验摘要；旧物料Source启用不会开放货款申请。不提供HTTP启用/写入/读取凭据的入口；D141仅补内部受控采集协调，实际操作CLI/调度未接。`ZHIXU_AINUOKE_PAYMENT_READ=snapshot`与session模式、合法既有Source key同时指定才组装读取器，缺省关闭；仍须数据库目标已获独立启用。

服务端内部prepare固定合同、来源链接/原owner/有效SO、归属代际、目标版本、预期发布代际和采集前时间；publish重新查数据库权限和范围，采集在prepare之前、期间归属或启用版本改变、过期/缺页/混单/两遍变化均拒绝。精确重试返回原发布；不同内容并发只允许一个胜出；快照不可改删，指针不可跳代或回退观测时间。SQL和服务双重约束，读取还从原input重建并校验投影，不能用一个貌似正确的content_hash隐藏损坏数据。

`GET /api/v1/sales-orders/:uuid/payment-requests`只接受SO UUID，不接受合同号/账号/版本查询、未登录、本地免登录或写入请求。fresh DB权限沿已批准艾诺科全员可见的`order.view/ainuoke.view/style_progress.read`，不查询或返回织序CCT/内部报价成本。金额仍是来源原始观察，币种/分配单位未取得精确新capture证据时保持unknown。财务申请不等于银行实付。

接口仅返回已观测时点的逐行事实，不声称实时；最早页起十分钟到期隐藏明细。未启用/未采集、来源身份变化与加工类不适用分别返回空状态，历史别名不会静默跳转并展示另一张SO的财务数据。没有汇总、稳定财务事件去重、自动币种、换汇或正式齐套改动。

归一预览与完整证据纳入目标、快照（当前归属与原owner）和指针，保留全部原引用，只给计数/hash；不把它们当实际付款或冻结账目。未升级演练允许三表全不存在，部分schema拒绝。旧签名证据不会重写；新引用/内容会要求新的归一证据，外部生产/财务覆盖仍不能省略。

0025仅一次性合成库演练。真实来源过滤、目标SO清单、备份/回退和迁移/写入/激活仍须各自明确授权；默认读取开关关闭、关闭目标可停止新读取/发布，已存身份和观察历史保留，不承诺旧镜像直接兼容新schema。

# 艾诺科 Server Source：正式订单与持续物料展示

## 当前恢复摘要（2026-10-15）

main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。6086941首页100/17675与49字段、D136两行含义/个/CNY确认及精确只读观察模型已本地完成，原报告/数值/未知值/重复行不改。金额币种只限定cgGoodsAmount/PayAmount/GoodsAmount，不扩张到报关/开票/预付或收款。

[两合同分页工具](../tasks/active/ainuoke-payment-contract-probe.md)为D137合成工程：已有私有S1/S2精确hash及账号指纹；固定6086941/ExpContractNo/is查询候选，每合同≤2页×100行、完整两遍；最多8报表/9HTTP、4MiB/响应、16MiB累计报表、180秒。原首页动作仍2HTTP/1report；没有注册catalog/采集调度/HTTP业务API/DB或UI接线。

79相关Node/114Python与类型/Server编译/源码lint通过；d669e2e1/clean的898/94与精确main门禁通过（38能力）。私有样本只离线加载，0HTTP/0DB，尚未真实执行新模式，不能宣称查询过滤或完整合同数据已核实。新真实范围须单独明确批准；先前所有读取次数已用完。

B2@68ac、read-model@fbb6002f和Quote@d9bf等原成果保留；Git未交付的新代码不声明PR/Hosted CI/部署通过。无真实账号/DB/绑定/激活/宁波18443/18444操作，四单窗口12/12结束不重启，不自动合并。

[上一摘要原文](../tasks/completed/2026-10-15-before-payment-contract-probe.md)保留日期/hash/结果/限制。GitHub为实时工程事实源；来源/代码/授权/PR/验收变化时更新当前摘要。

核实2026-10-14；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（#104–107已合并）。GitHub及目标代码为工程事实源；随来源契约、权限、命令、预算、合并、真实激活/部署或验收变化更新。旧日期/hash/结果与未合并状态原文见[归档](../tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)。

## 当前隔离演示与质量治理（2026-10-14）

全量558成功证据保留；仅补19合同47请求定向诊断。6无效颜色为局部补充问题、6单位冲突暂停对应需求汇总；不删除主订单或全局阻断。数量候选测算与实际cgnum分开，TotalNum/齐套/去重不变。新owned持久本机fixture应用已验证23订单/17报价/六角色与原P6，完整[报告](../tasks/active/evidence/ainuoke-live-demo-readiness/isolated-demo-final-report-2026-10-14.md)。这不是558单raw重放、真实Source激活或宁波部署。

## 用户决定

D105：采购、入库、物料出运、出库按正式订单持续展示后再上线宁波，不做独立库存台账。D104：登录团队同见已授权来源含采购价，织序销售价/确认工价/内部成本按D103。D106/D107：现有P6与批准的/login保持，不扩张生产/关账路由。D109：仅原地址的HTTP风险永久接受，仍是明文。真实账号/DB/绑定执行/调度激活/部署仍要明确授权；新PR不自动合并。

## 当前实现

- 正式 UUID/order_no、Source Link、Contract Mirror、6087105 Color Mirror复用；不另建订单或库存模型。首次绑定完整6086103 → 所有可见BillNo的6087105 → 再次6086103；包含所有可见生命周期，不写死历史数量或过滤Status。
- 复用Final Bootstrap Preview。颜色missing/invalid是enrichment，保留主订单且不猜颜色；未知Num不转零，非法日历日期拒绝。6086997为历史源；6087050不建订单。
- 首绑只允许空订单账本或精确同一集合/镜像/来源profile/审计reviewHash重试。preview只读；bind重取来源、目标/preview指纹、事务内重新核验权限/时效，全批创建与审计原子提交；编号可留gap。没有新migration，0001–0012不改。
- 四流采集经完整Discovery用BillNo定位当前InsideOrderNo，再固定6087050，再Discovery；Material Pipeline /只读Projection唯一。整代快照/日志/current pointer原子发布；失败保留历史并抑制当前判定，陈旧不当零。
- 调度显式启动，仅刷新已绑定订单四流。每轮重验ledger，不自动应用迁移，不自动建单/更新旧订单主信息或颜色。默认建议间隔5分钟、退避30分钟，单次完成后等待、不并发追赶；无效凭据/账号或权限变化停止。退出须容许当前600秒采集完成。
- #106 / D111：`quantityUnit <- QtyUnit`逐需求来源单位，一致非空才展示；缺失未知、冲突阻止该需求投影数量与状态判定。不从规格推单位、不跨需求求数量、不改TotalNum/cgnum/理论用量/事件去重/正式齐套。目标356两来源行仍归并一采购事件。历史Excel单位映射仍未证实。
- #107 / D112：完整Discovery差异 → 显式选择1–25个新BillNo →只读预览 →fresh重取确认 →可信权限/首绑收据/sourceprofile/互斥锁 →事务内新增正式订单与审计。来源消失/身份变化/部分重试失败关闭，旧订单不删；精确重试核对已存Contract/Color Mirror。新增订单下一轮既有capture持久化已用合成Linux/PG验证。
- GET仅查持久快照，不读凭据/访问上游/写业务表；原页面30秒及回到窗口时刷新，隔离订单/当前用户/权限，取消旧请求。故障清判定，不回退Browser。API启动不启动采集；但启动会同步权限目录，不能称纯只读检查。

实际代码：`server/ainuoke-source/{collector,contract,binding,additions,service,reader,scheduler,cli}.ts`，正式订单mapper、Material Pipeline/Projection；测试`server/integration/ainuoke-*`。日期读取保留YYYY-MM-DD，不修改DB日期。

## 凭据与明确操作

持久操作CLI是Linux owner-only普通私密文件0600/0400，拒绝symlink、宽权限、非法UTF8/未知字段。必填sourceKey/baseUrl/username/password/operatorUsername，已批准HTTP额外transportPolicy=user-approved-http-d109。账号目标指纹涵盖实际DB名/用户/address/port、DSN、来源账号/操作人/SourceKey；密码轮换不改来源身份。操作人须已激活织序用户及既有view/sync/import/bind权限，不自动创建真实用户或授予权限。

用户名/密码经匿名stdin进短命Python worker，不进argv/env/DB/Git/日志；token只在内存。固定报表/精确query，不接受任意报表或SQL；禁重定向/ambient proxy、不关TLS。上游登录query含凭据，不得配置记录敏感query的代理。

以下只是已实现命令，不代表执行授权（`<key>`/指纹须由实际check/preview取得）：

```text
npm run source:ainuoke -- --check --config=/private/source.json
npm run source:ainuoke -- --preview-bind=<key> --expected-target=<fingerprint> --config=/private/source.json
npm run source:ainuoke -- --bind=<key> --expected-target=<fingerprint> --expected-preview=<reviewHash> --config=/private/source.json
npm run source:ainuoke -- --execute=<key> --expected-target=<fingerprint> --config=/private/source.json
npm run source:ainuoke -- --schedule=<key> --expected-target=<fingerprint> --config=/private/source.json
```

受控新增CLI的参数/指纹与停止条件以[工程任务](../tasks/active/ainuoke-controlled-new-contracts.md)及`cli.ts`为准。镜像入口`node dist/server/server/ainuoke-source/cli.js`。

## 无数据库全量预检（当前工程候选）

[本轮准备](../tasks/active/ainuoke-live-demo-readiness.md)增加`live-preflight.ts`，复用完整binding collector和material collector，分别使用生产600秒/100000行/32MiB及10分钟freshness；完整读取颜色与物料，不重复80抽样。两阶段完整Discovery及跨阶段raw content必须一致，不截断、不缩小首次绑定范围。缺颜色继续按enrichment报告，缺单位/未知数量/冲突继续如实呈现。

输出脱敏耗时/返回页数/行数/字节/单位及未知需求项；真实报告只入owner-only且Git忽略的本机目录。返回页数不是实际HTTP尝试计数。私密PowerShell默认隐藏输入，或指定受限CredentialFile免输入；用户后续已授权Codex调用同范围只读脚本，凭据只由进程读取，不进入模型上下文。此预检不接DB、不授权业务操作人、不绑定、不激活Source、不声明demoReady。纯`demo-plan.ts`只输出隔离资源计划，不能代替未来启动器的实际阻断检查。原三次失败及operatorAuthorization状态误拦截/错误分类修复保留在[修复证据](../tasks/active/evidence/ainuoke-live-demo-readiness/operator-wrapper-repair-2026-10-13.md)。

2026-10-13工具HEAD `4b4a09eac5ada875a452a743715f65e3e69719a1`的全量真实只读预检成功：558当前账号可见合同，颜色552可用/6无效；14,411需求单位12,655已知/1,750缺失/6冲突。全部物料阶段414,954ms、25,397,547序列化字节，在现有预算内；不等于持续运行保证。采购/入库/出运/出库未知需求分别1,756/2,400/3,099/2,507，unknown不改零。受保护报告hash已核对，[完整统计和限制](../tasks/active/evidence/ainuoke-live-demo-readiness/real-full-preflight-2026-10-13.md)。

## 页面与发布开关

默认`NEXT_PUBLIC_ZHIXU_ORDER_READ=disabled`。显式snapshot候选仅原/order-center列表、/order-center/server-detail?id=UUID、/order-center/style-progress/detail?orderId=UUID；原P6 executionOnly/Control Tower/四流采购价。缺orderId不fallback Browser。导航/样式/断点保持，款式总览/风险预警与生产/关账/旧新增编辑/import不开放。

同时Quote=server、masters=server、writer=writable、identity=session；build/runtime一致且reader=snapshot，另需SourceKey及1000–86400000ms MaxAge（建议30分钟）。Dockerfile默认disabled不改；构建不是部署，allowlist只是候选上界。

## 证据、验收与限制

- 历史真实login/三首页可读，558可见合同两遍一致、80物料抽样四流有代表；62合同未知未完整归因。目标三需求/四来源行QtyUnit及身份人工确认，不能升级为全量质量或全公司权限证明。[只读结果](../tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)、[单位确认](../tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-confirmed-2026-10-13.md)。
- 合成`test:ainuoke-continuous` /Source/六角色P6响应式/刷新故障恢复及LinuxCLI已验证；#107精确head三CI成功。现有`demo:ainuoke-continuous`两小时清理tmpfs合成账本，只用于一次性测试，不用于保留真实演示验收数据。
- 真实Source尚未激活；完整颜色/物料单次耗时和容量已由预检核实，真实持久化/连续刷新仍待测量。最大1000订单、每报表200页/50行、每worker100000行/32MiB/600秒。超过需另设计代际发布/限速，不提高限制或抽样假PASS。scheduler先完成capture再等间隔，默认300秒不是每5分钟保证发布；页面轮询不是来源刷新。
- 上游没有跨报告事务快照；Discovery一致不证明所有物料同一时刻。历史snapshot无自动清理，持续运行前测算磁盘增长；没有systemd/restart/外部告警或凭据轮换服务。
- 旧订单主信息/颜色自动刷新、完整分码UI仍未接；生产/关账Server/库存台账不追加为首轮前置。
- AI建议：新隔离本机账本明确授权后，完整首绑/首次持久化/2–3次刷新及3–5代表订单对照即可首轮真实演示；24小时/故障重启/受控新增/六角色与备份恢复用于宁波晋升Gate。真实账号和数据库执行须分开授权。
- 回退只停止采集/关闭reader/orderRead并保留绑定与来源历史；不删ledger/订单/快照，不自动down migration。恢复只能到独立明确授权目标。[宁波方案](../ops/ningbo-rollout-plan.md)。

2026-10-13 后续受保护报告显示目标四条来源行的 QtyUnit 候选均为“个”，三物料身份/采购归并与旧报告相同；业务语义尚未由 IT/用户确认，正式 Adapter/Projection 单位仍未映射。[脱敏证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。不得据此改变 TotalNum、cgnum 或齐套计算。


### 本地Gate4有效归属适配（2026-10-15，未远端交付）

0018候选schema和service/reader已接有效归属。原合同Source链接及原快照保留；新采集按当前有效SO保存，并绑定归属change及完整目标范围hash。内容相同不再足以重放；采集期间归属变化阻断整个发布。读取只接受当前归属generation，未发布的新目标显示未连接，旧epoch显示身份不匹配。共享归属锁在Source profile行锁前取得，避免与归一事务锁序相反。冻结prefix12无新侧表仍可工作，部分schema失败关闭。本地合成19项/已有来源与持续回归范围见order-effective-attribution任务；没有实际归一、Source真实范围或调度授权扩大。


2026-10-15 后续消费者已补Source接纳/重试：可信原sourceOwner校验与有效SO返回分开，不能用当前根ID替代不可变绑定校验。首次绑定只接受原scope+回执完全相同，以及已有明确归属组内的额外成员；无关SO仍阻断。受控新增与capture使用相同归属锁次序，5秒等待上限；旧owner来源镜像观察保留，历史别名交付计划不再追随来源日期。联合37项及持续43+skip1已合成验证；没有真实接纳或调度扩大。


### 2026-10-15 历史来源查询的后续本地事实

0022及独立material-history只读API记录新采集scope/link/order version，并按原捕获SO保存/查询历史；当前root不会吸收或合计旧SO快照。旧NULL保持未知，采集时Discovery决定历史款号/InsideOrderNo。历史数据不作当前或当年齐套判断，权限/fixed profile/哈希/分页/字节校验保持；当前reader也校验新上下文。绑定/mirror已知合同身份不可DELETE/改写，非身份观察和颜色切片仍可刷新。没有真实迁移、来源读取、绑定、激活或部署；浏览器历史UI及整个G4待后续。详细API/限制/证据见[历史来源模块](ORDER_SOURCE_HISTORY.md)。
2026-10-14: [异常原因与隔离演示接入路径](../tasks/active/source-anomaly-followup-2026-10-14.md)新增只读行级证据分析；不改变单位、正式齐套或真实首绑授权。

2026-10-14 / D-118：新增默认不配置的可信需求级人工确认只读端口，单位补充与原值分开、工厂责任只影响国贸跟进；身份/单位/采购范围改变失效，两次采购不去重、单位等价不证明生产可用性。未真实装载、绑定或激活。[工程与下一隔离演示Gate](../tasks/active/material-confirmations-2026-10-14.md)。


## D119：显式小范围首次绑定（本机候选）

使用既有Linux私密config和可信operator，在已核实的空隔离账本上执行：

```text
npm run source:ainuoke -- --check --config=<private-file>
npm run source:ainuoke -- --preview-bind-selected=<source-key> --contracts=<BillNo,...> --expected-target=<check-fingerprint> --config=<private-file>
npm run source:ainuoke -- --bind-selected=<source-key> --contracts=<same-BillNo,...> --expected-target=<check-fingerprint> --expected-preview=<review-hash> --config=<private-file>
```

预览只读、写入独立确认；完整Discovery与所选颜色来自既有固定worker，最多25单。原全量bind仍要求全量颜色。所选首绑hash不与新增合同/全量预览互通。重试逐字段核对已存镜像，不能借重试新增订单或修复被改动的账本。execute只刷新已绑定物料；schedule不随绑定自动运行。真实执行尚未授权/运行。[本轮证据、目标与回退](../tasks/active/ainuoke-selected-first-binding-2026-10-14.md)。

2026-10-14用户明确批准后，四单已在全新本机隔离目标首绑并执行2轮真实采集；现有页面读取真实快照，长期scheduler未开，原环境未变。工程/运行/人工验收分别记录，详见[实机证据](../tasks/active/ainuoke-isolated-live-results-2026-10-14.md)。

2026-10-14用户授权既有隔离四单10分钟/2小时的有限刷新；独立window入口最多12次、固定结束时间、失败停止，不更改正式默认scheduler。运行状态见[窗口证据](../tasks/active/ainuoke-bounded-window-2026-10-14.md)。
2026-10-14 PR108诊断入口必须提供`-PreflightFile`，真实核验原文件与请求身份后才允许收集。原报告不因历史hash有效而变为新鲜；不重复全量读取。[修复证据](../tasks/active/quality-preflight-lineage-fix-2026-10-14.md)。

金额币种边界复核：仅cgGoodsAmount/PayAmount/GoodsAmount采用本轮确认的采购合同币种，其余金额币种保持unknown；不提供通用行currency。详见../tasks/active/evidence/ainuoke-payment-request-probe/observations-amount-currency-2026-10-15.md。
