# Gate4 有效归属与纠正恢复

核实2026-10-14；最近核实main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`，NETWORK_DEGRADED，本轮未刷新远端。新分支feat/order-effective-attribution，从案件预览afb71f921b5645ed83f03d46a784d1e30f8325f2建立独立工作树，起始干净，父未合并G1–G4预览保持。当前仅工程基础阶段，未交付完整归一执行。

## 用户批准规则

D121/D124：保留原UUID、SO编号、创建来源、来源绑定与所有流水；不自动搬移/合计生产、采购、出运或关账。优先保护有执行的SO；双边执行/财务冻结需生产/财务核对；不能删另一单。归一后的新流水必须进入纠正预览，不能无条件撤销。真实案件写入、Source和部署必须具体范围另行授权。

## 本地基础实现

为本分支分配未发布迁移0018。changes保存不可改写变更、case/version/actor/request、证据hash与理由；members保存逐SO当前目标及前一change/version；heads仅当前指针，严格递增。原SO和Source绑定不改。normalize须一个有效根；correct可将完整组拆回多个有效根。SQL延迟约束验证所有参与者同事务推进，根必须自指；拒绝循环/链式别名、遗漏旧组成员、缺少案件两端、无变化、已撤回/过期案件及不同可信合同合为一有效SO。历史changes/members/heads禁止删除，旧变更不可改写。

sales_order_effective_identities视图统一读取元身份；无归属记录返回自身/version0。effective-attribution.ts提供内部解析、整组查询、带共享事务锁的写前保护和显式CAS头写入。事务归属变更使用同一个独占锁，写前检查不能与归属变更交错。内部持久化primitive不提供授权或完整证据证明，也没有公共执行API。

## 实际检查

一次性合成PG10/10通过（9子场景+fixture）：默认自身、循环/无根/错案/no-op拒绝；归一保持所有SO全行不变；别名helper写保护；历史不可改/删；旧组遗漏/伪版本拒绝；纠正拆组保留旧映射；两份不同可信合同拒绝归一；写保护与归属独占锁互斥；撤回案件阻断新变更。类型无缓存检查与定向lint通过。

首次5子场景通过、2失败及父fixture失败：通用upsert在纠正时先触发BEFORE INSERT，误走首次version检查；改用明确首次INSERT与带旧change/version条件UPDATE的primitive，不降低约束，之后10项通过。未访问真实业务数据库；本机测试只创建随机tmpfs容器，全部已清理。未执行完整项目/发布门禁，基础checkpoint不能当最终Gate/PR验收。

## 下一实施顺序与具体调用点

1. 强证据/执行命令：必须在独占归属锁及案件锁下重查完整引用/版本与外部覆盖，不使用预览阶段有限hash或客户端verified标志。默认执行入口关闭，真实目标另行授权；审批/冻结/已执行后的纠正全部需要明确证明。
2. 统一订单读取：repository.ts readModelSelect、list及detail目前仍直接按so.id读取镜像。需有效列表/历史查询、元身份/当前归属明确分离，不把两个SO数量或价格相加。
3. 新写入边界：delivery-plan-service.ts、commercial-version-service.ts、identity-service.ts及加工参考/重复结果需按业务用途接线，不让某页面改向而另一服务继续新增旧单执行。原历史/说明的补充必须独立处理，不能借改价重算冻结历史。
4. Source接线：ainuoke-source/service.ts boundOrders当前直接返回镜像绑定的旧o.id；captureSource仅content_hash判断重放；reader.ts stored仅按snapshot.sales_order_id取数据。归属变更后必须重新判定有效目标、当前归属版本及快照适配，避免同内容hash返回旧指针；旧绑定、旧快照保持。最小基础Source工具的下版本schema支持要明确，不暗中拉入新侧表。
5. 跨服务合成验证：同合同返回同有效SO、原两单/流水可查、归一后拒绝别名新执行、Source归属变化重新采集且不重放旧目标、双边/冻结/新流水纠正及并发/审计/权限/拒绝绕过矩阵。
6. 全质量/基线/能力冻结/独立PR收口。当前父预览分支和本分支均REMOTE PENDING，不推送恢复命令、不自动合并部署。

目前消费者尚未接线、执行/审批/完整引用未实现，因此不建议把基础分支合并或用于真实归一。更新时机：规则、schema编号、消费者、证据、验收或main状态变化。

## 2026-10-15 Source消费者阶段（独立本地checkpoint）

阶段起点674429d9180c60f150ebfcc6a020f9de3654ab34；继承dirty为空。本阶段只改Source/内部归属helper/未发布0018/相关测试清单/package与文档，不修改真实数据或公共归一命令。

boundOrders以原不可变合同链接定位来源身份、以有效归属视图定位当前目标SO，保留sourceOwnerOrderId与attributionChangeId。目标是已消费加工批次或两个来源绑定落同一目标时拒绝，禁止伪加工合同或来源合并。captureSource在事务内先取共享归属锁、再授权/Source profile及订单锁；外部采集前后目标发生变化则拒绝发布。0018新增可空order_scope_hash和snapshot attribution_change_id，只记录新采集，不回填旧快照。重放须内容及完整目标范围hash同时相同；没有物料行的缺合同结果也参与范围校验。

reader在RR只读事务一起读取fresh授权、目标归属和已接受快照。原历史别名不再作为当前来源入口；新有效SO尚未发布显示not_connected。归属epoch不同的旧快照显示identity_mismatch，不沿用旧目标数据。固定来源Adapter使用同一数据库generation，无网络/跨请求缓存。schema完全不存在时支持冻结prefix12工具，部分schema则503/来源错误，不能静默回退。

验证：归属基础+Source19/19（含schema10及Source9）；Source原20PASS/1Windows CLI skip、continuous43PASS/1Windows CLI skip在锁序修复前通过，锁序修复后19项包含exclusive/shared+profile NOWAIT对照；最终无缓存全类型、修改路径lint和normalization37/37通过。Source测试新增空结果范围/采集中变化/同目标新epoch/换目标/保留SO全行与旧链接/部分schema拒绝/冻结prefix12兼容。首次检查进程结果在压缩后丢失，未冒称成功，重新运行类型/lint/37项取得明确结果。本阶段不是完整Gate4、远端CI或合并验收。

下一阶段：repository列表/详情的有效与历史模式、创建查重返回有效SO、新交付计划/商业采用/生命周期写保护；审批与完整引用执行仍未实现。未发布0018继续允许本分支前向完善，已发布0017及之前SQL不修改。完整基础状态见[旧接力](../completed/2026-10-14-effective-attribution-foundation-handoff.md)和[旧状态](../completed/2026-10-14-effective-attribution-foundation-state.md)。


## 2026-10-15 订单读取与新写入消费者阶段

阶段起点ef9cae60c073dc5992a22099f16a588e5c792978，工作树干净。仅本分支Server/未发布0018/合成测试/package及文档；没有修改UI、已发布SQL、真实账号或数据。

普通列表默认只返回有效根；includeHistorical=true显示原SO及attribution身份（原UUID、有效UUID、change、version、是否历史重复）。列表count/items使用同一RR只读快照；详情一条SQL读取合同/颜色。有效根通过可信原Source owner投影当前合同事实，Source owner和创建历史分别返回；历史详情不重定向UUID、不继承有效根的计划或价格。当前type通过可信合同/加工消费判定；纠正拆组后旧认领profile仍保留，但不能凭它冒称旧根仍有可信合同。

合同号/来源身份查重返回有效SO，不修改原链接。首次绑定精确重试允许明确归一组的无链接成员存在，仍要求原全部来源scope、profile和reviewHash回执完全匹配；无关/未复核SO继续拒绝。受控新增用不可变sourceOwner校验，并把精确重试结果解析为有效SO。既有Source owner更新是来源观察，不能把它当新执行：0018前向替换follow函数，历史别名原交付计划不再跟随源日期改变；没有复制或汇总原计划。

认领/血统、新价格采用和交付计划先持共享归属事务锁，再fresh DB授权及行锁；历史重复单409。已成功价格采用的原请求重试仅返回原不可变历史回执，不创建新版本。生命周期内部命令同样锁下检查有效身份。报价/CCT仍仅候选，不向有效根搬旧价；有效根要独立明确采用。新血统检查有效引用，引用本组历史别名也不能形成自己翻自己。完整归一执行/审批仍未开放。

来源capture/binding/additions的归属锁等待统一5秒上限；Source/profile/原SO锁次序一致。单条Source observation primitive传Pool时自行事务，传事务client时保留调用方所有权。冻结prefix12和DeliveryPlan prefix9仍无归属侧表依赖，部分归属schema继续失败关闭。

验收：归属30/30；来源/消费者/交付计划联合37/37；商业29/29；加工批次35/35；持续Source43PASS/1Windows Linux CLI skip；身份15项；源码824/824、基线78/78；全PG/API261/261（修复后重跑）；无缓存全类型、全lint、server:build通过。最后仅来源锁等待配置变化另有最终30项及43+skip1来源验证，全PG的SQL/消费者逻辑未再改变。本阶段没有新的浏览器像素/UI改动验收，也不是整个G4完成或远端CI证明。

失败及处理：第一次日志目录缺失导致测试未启动，创建ignored outputs后重跑；两次错误命令build:server不存在，改用仓库server:build。首轮全PG253PASS/8FAIL（七交付子场景+fixture）源于旧合成fixture只有缓存权限、没有对应DB grants，及伪actor不再能用作末端审计失败；补齐合成角色grant并改为有效授权后注入末端审计fault，未弱化fresh权限，37项定向及完整261项重跑通过。首次新增归一后binding重试测试发现all-SO=source-scope旧假设，定向6PASS/3FAIL（两子场景+fixture，其中第二因前一失败未保存run）；修复为原scope+明确归一组验证后通过。保留本机ignored日志，不将日志/合成DB当真实工程证据。

剩余：默认关闭的公共归一执行、完整引用/版本指纹、生产/财务覆盖及审批、冻结/新流水后的纠正预览、原历史Source快照只读入口、管理员案件选单历史scope及有效历史状态UI。当前案件选单仍用默认列表，公开归一尚未实现，真实数据没有归属变化；后续须明确接includeHistorical并独立UI影响记录。加工消费当前返回原批次SO，执行服务须禁止把独立加工批次身份当合同重复合并。完整G4未完成，本分支不建议真实归一/合并使用。

上一Source阶段接力和状态分别归档source-attribution-handoff/state；不更新旧冻结能力证据或宣称已部署。REMOTE PENDING，网络规则保持，不自动push恢复、合并或部署。


## 2026-10-15 完整证据基础阶段

起点4d59604c17b19b7eaf5d251ef567bc8d0cd5172c，dirty为空。分配未发布0019 target/proof/review append-only schema，无真实迁移。target随机ID、数据库名/OID及服务器端点形成目标指纹；proof绑定case/version、目标、归属方案和完整证据。review预留独立生产/财务决定与递增sequence，不改0017案件历史。当前尚无执行/复核API。

normalization-full-evidence按固定已声明Server引用逐行读取全部行内容、关联旧CCT事实与已声明order审计引用，计算完整hash；不再只取前100ID。100000行/32MiB预算超限直接拒绝，未知FK仍阻断。没有自动发现未声明JSON/外部账本的能力，hashScope如实限定。有效完整组、可信合同、独立加工批次、执行SO优先、有效血统环、取消根及case版本均进入阻断。外部生产/财务必须由可信Server Adapter持冻结读取lease覆盖回调直到COMMIT；HTTP命令不接收verified/count/raw evidence。默认Adapter unavailable，Server无行不变成外部零。

生产/财务事实只返回数量与完整hash，不公开内部商业金额或raw payload；可信冻结来源完整scope、记录唯一性、期限、目标及前后复核均校验。历史导出但仍有活跃writer不能实现此冻结契约。尚未连接真实生产/关账Adapter，真实归一仍不允许；本地只有合成冻结来源。

9项定向通过：第121行内容变更（计数/前100ID不变）能让完整hash改变而旧preview hash不变；unknown FK、预算超限、未知vs明确空、单边执行根保护、财务独立复核要求、源lease变化/缺scope/重复/过期拒绝、目标identity不可改删、case版本变化拒绝及严格命令字段。无缓存类型通过；checkpoint097db045前的定向lint结果为1项prefer-const失败，但接力曾提前写成PASS，此错误不作为验收证据。随后将只初始化一次的raw改const，保留原提交并以前向校验结果纠正。下一阶段审批、有限目标/方案许可及事务执行/纠正；执行默认关闭，不用这个hash替代授权。上一消费者接力保留于completed。

2026-10-15 前向校验纠正：const修复后定向lint及完整证据9/9均以明确exit0通过；097db045的提前lint声明不计入通过证据。


## 2026-10-15 独立复核与受控执行服务阶段

阶段起点bea371eb64dce104bf6f75018d968676dcb37af8，工作树干净。修改仅本分支未发布0019、Server服务/API、引用锁、相关测试及文档；没有UI、已发布SQL或真实数据修改。

新增attribution-preview/reviews/execute和原请求回执接口。全部归一HTTP接口必须session，local-single-user即使有真实管理员锚点/完整许可也拒绝。默认server/index不传执行许可或外部Adapter，没有环境变量开关；默认执行503 normalization_execution_disabled。真实arm、目标、备份和覆盖核实须另行明确授权，本轮没有提供可自动启用的生产配置。

生产/财务复核使用fresh DB受信预设角色及order.view，不能从legacy role标签或缓存权限推导。复核与完整case/version/目标/方案/evidence hash绑定；immutable review按sequence保留。单边执行须保留该SO；双边执行仍必须明确方案、独立生产复核，不移动/合计；有财务冻结或completed状态另需财务复核。执行者不能代签，生产/财务不能同一账号双签。复核绑定当前用户/岗位/查看grant版本指纹，撤销后重新授权不会复活旧签名，须新复核。窗口期版本是PG tuple revision，只作短期审批失效检测，不宣称它是长期业务版本。

执行只接受Server私有配置中的单一case、目标fingerprint、proposal/evidence、recovery plan及备份/恢复演练hash引用和最多1小时有效期。备份/恢复hash是待独立核实的操作证据引用，服务不伪造验证，也不实际执行备份/恢复；合成测试只有明确标记的模拟许可。外部冻结lease在DB归属锁之前取得，保持至COMMIT；相关Case/准备/加工写入参与共享归属锁。完整现有引用行FOR SHARE防止计数不变的并发内容修改；新归属仅ledger/members/heads，不写原SO、CCT、计划或外部流水。

事务末端再验证冻结来源；audit失败整批回滚。原actor/request/payload只返回原change及成员，不能因换请求键重复归一；未知COMMIT结果可用只读回执核实再精确重试。纠正必须新完整组/新证据/新审批/新许可；归一后新增流水使旧纠正hash失效，旧映射和原业务引用保留。不是无限撤销按钮。

当前验证：完整证据+执行29/29；Case/执行session联合34/34；归属消费者30/30；Source20PASS/1Windows CLI skip；加工35/35；身份15/15（含0014–0019非破坏升级）；完整PG/API261/261；类型、全lint、Server编译及基线78/78通过。根源码824/824已取得明确exit0。没有新的UI或浏览器像素验收、真实外部Adapter、真实目标授权或远端CI。整个G4尚未收口。

失败保留：最初服务SQL字符串引号、两个未登记审计entityType的编译失败，改用现有OrderNormalizationCase并在metadata区分review/change。首轮26项24PASS/2FAIL（一个revoked role期待错误码及fixture）：权限先被order.view拒绝仍阻断；随后改为明确审批权限变化409，并增加授权版本/撤销再授负向保护，29项通过。旧Case HTTP默认execute期待404变为明确默认503，首轮35/37通过，更新闭合状态断言后session联合34项通过。升级fixture遗漏0019文件名导致身份14/15，补实际清单后15通过。没有为了通过测试减少权限或证据检查。

剩余工程：原历史Source快照入口、普通历史状态/案件历史选单、生产财务复核界面与默认禁用执行状态、完整Gate4能力证据及PR复审。真实Source/生产/财务Adapter须依具体环境、原身份映射、冻结/全覆盖与独立恢复证据核验，不能把历史导出或Server空表当冻结源。还需整个已批准计划审查准备记录采纳关联、旧类型执行hold与报价规格修订确认重置是否完整，不按局部已通过内容缩小Goal。G5页面/排序/num_dyc/6086941仍待独立交付。

受控执行操作边界与真实案件具体清单见[专用执行规格](order-normalization-controlled-execution.md)。SQL层别名写保护、全面运行态关闭策略与旧二进制/真实恢复验收不由当前服务测试代替，后续必须补齐。


## 2026-10-15 SQL防绕过阶段

起点59499461a8d83a4233fd715386f718c07d2fb6eb，工作树干净；继续原feat/order-effective-attribution，不重建或丢弃任何分支。GitHub API在本阶段只读核实main仍为064e3afaf7d08b3cb62907d4402f97d9c292f1e5；开放PR只有108，head f5bbb1e4d3d6c52c80b03947a6926380afafc8c0。只读API成功不等于Git传输恢复，NETWORK_DEGRADED规则不删除、不自动执行恢复push。

新增未发布0020_order_attribution_write_guards.sql。普通DML直接写SO生命周期、交付计划集合/明细、认领血统侧表、商业采用版本/头、旧CCT关联、加工批次消费或新来源绑定时，必须是当前有效SO。更新同时检查旧/新owner，不能通过改归属搬历史行。现有不可变约束继续保留。参考准备记录仍可引用历史SO，不把参考关系当新执行。Source原owner的镜像/颜色观察继续允许，不让旧别名计划跟着刷新。

共享归属锁之外新增单行write epoch，归属heads变化在同事务内推进。普通写入锁住该行；READ COMMITTED在等待后检查当前归属，过期REPEATABLE READ在epoch行更新后40001退出，不能只读旧view放行。当前API已有锁序保护；旧代码直接DML可能产生锁冲突或死锁，由PG回滚，不能因此承诺旧镜像功能兼容。保护范围是已声明Server表的普通DML，不是对数据库owner禁用触发器、DDL、任意外部写入的安全隔离。

Source runs/material snapshots不可UPDATE/DELETE。新run必须含order_scope_hash，新snapshot必须当前root、精确attribution epoch及可信合同；旧null历史不回填。latest指针改变时拒绝旧无scope或过期generation，原指针不变的错误/注册元数据无需发布锁。原指针已过期时由读取层继续返回identity_mismatch，不自动假称当前。

后补来源绑定/镜像也在commit校验有效合同唯一及加工单独立性，避免只在归属heads修改时验证而漏掉第二入口。加工身份侧表或消费记录不能进入共享归一组，也不能通过后补来源变成合同单。所有检查在新源码/一次性PG验证，没有真实迁移、归一、Source发布、账号或部署。

合成回归新增15项（含父测试），覆盖原始行逐项保留、旧null证据、SQL各入口、Source内容不可变、错误/缺省epoch、错误合同、过期最新指针、并发等待、RR过期、后补第二合同、加工身份独立及历史参考。旧Source损坏回归改为两层验证：普通SQL篡改拒绝，driver返回字节被合成破坏仍独立哈希失败；没有关掉数据库保护来伪造验收。

已核实结果：归属45/45，执行29/29，Source20PASS/1Windows Linux CLI skip，身份15/15，加工35/35，根源码824/824，基线78/78；类型、完整lint、Server编译通过。最终完整PG/API261/261已取得明确exit0（最终SQL版本）；完整结果日志位于Git忽略outputs/gate4-sql-guard-*-final.log。

本阶段失败记录保留：首次联合43项41PASS/2FAIL，注册profile的BEFORE INSERT触发器过早等待归属锁，收窄为实际非null latest指针发布后43项通过。增加后补绑定样本时15项13PASS/2FAIL，样本先被既有DeliveryPlan集合主键拦截；改用无集合根验证预期身份约束后45项通过。首次完整PG中缺失owner被误报23514而旧回归期待23503，已将不存在订单单独归为外键23503并加入负向断言，最终回归重跑。未降低任何归属/权限保护。

下一步仍包括运行态关闭新创建/采用命令、回退兼容验收、历史Source只读/历史选单/独立复核界面及完整Gate4收口；准备记录采纳、待分类执行hold和Quote修订确认重置仍需对照批准计划查漏。G5不被删除或提前宣称完成。真实Adapter、具体案件授权、备份恢复与真实数据库仍未提供/未操作。


本阶段工程checkpoint8606cb7ba0bfbb832d16ebb50ba62a2989b028eb后，首次精确源码门禁FAIL EVIDENCE_WORKTREE_DRIFT decisions-order-normalization-g4：新增D125改变了决策文件，需要提交后的前向文档证据。按RELEASE_BASELINE_GUARD保留旧ID/blob/hash，新增decisions-order-attribution-g4指向8606cb7b的完整决策版本及supersedes链，不改任何截图、旧验收hash或能力状态。修复后重新验证源码门禁与基线回归。

前向文档绑定后源码门禁明确PASS，基线回归78/78明确exit0；未改旧能力状态、截图或权限范围。工程源码checkpoint8606cb7ba0bfbb832d16ebb50ba62a2989b028eb，证据绑定独立收口。整个G4和远端交付仍未完成。


## 2026-10-15 新命令暂停与兼容回退阶段

起点6f181d3bc5af0271c1a0949b2be0ef3a1713bbd6，原分支工作树干净。当前GitHub API核实main仍064e3afaf7d08b3cb62907d4402f97d9c292f1e5；未push/新PR、merge或部署，NETWORK_DEGRADED规则不删。

分配未发布0021，全局DB控制行/不可变模式事件，普通新SO/商业版本与头/归属ledger与头/旧订单CCT写触发器持FOR SHARE至COMMIT，暂停等待已开始事务。严格模式/version/reason，事件由真实控制UPDATE生成，不接收伪造actor；审计失败连mode/version一起回滚。没有HTTP控制mutator或可自动执行真实暂停的脚本。

当前Server进程ZHIXU_ORDER_COMMAND_MODE可更严格，不能重开DB冻结。高级新命令HTTP预检+SQL事务兜底，明确503；旧精确内部回执及readonly GET保留。Source首次绑定/新增需建SO时原子拒绝，已有Source刷新/原绑定retry保留；加工意向继续准备，消费被暂停时无孤立SO。原权限、单号、价格、未知数量、汇率、UI和真实环境没有变化。

实际从精确main导出临时源码并编译/运行原Server migration verifier/index，拒绝不认识的0014之后schema、退出1，逐表数据/账号/权限不变，未listen/bootstrap。没有新建Git worktree或移动旧分支。当前兼容前向bundle readonly verify与frozen查询通过，未重建原Docker镜像或认证旧Browser/legacy。历史Git SQL LF与Windows CRLF独立处理，避免把换行checksum假称schema不兼容。具体控制范围、限制及未来真实操作清单见ORDER_COMMAND_CONTROL.md。

初次暂停13项10PASS/3FAIL（decimal 120实际是string，候选ID实际在batch.id，含父测试），类型检测也拦截staleActor多余属性/failed union与NODE_ENV widening。按现有DTO修正fixture后13项通过；增加旧Server、Quote CCT及不可伪造/审计回滚后18/18。子进程环境第二次widening失败加显式ProcessEnv类型后最终完整类型通过。没有降低接口或DB保护。

当前18暂停/回退、30执行、45归属、35加工、43Source接纳+skip1、261完整PG/API、完整类型/lint及Server编译均已明确exit0。最终源码824/824及基线78/78已明确exit0。所有测试是一次性合成PG或受控临时目录，无真实source读取、账号/业务DB更新或部署。

剩余为历史Source查询/历史选单与独立复核界面，完整Gate4收口及全计划查漏/G5。真实目标暂停、恢复enabled、备份恢复、归一执行及流量切换仍需独立具体授权；该实现不扩大既有来源范围/窗口，不让报价先于合同创建合同类SO。

工程checkpoint24a983418f346c2651e34385ddf7a948af01e012保留。冻结18项控制/回退与分维度限制，新独立order-command-control能力只描述本地暂停而非整个Gate4。D126决策以前向supersedes链绑定，旧ID/hash/截图/状态均保留；最终门禁另行核实。

前向D126/第20项限定能力绑定后源码门禁PASS，基线回归78/78明确exit0。2026-10-15只读git-delivery-diagnose：default/http1.1/openssl_http1.1读取均exit0，main64一致；configurationChanged=false、pushSubmitted=false。原网络根因仍未查明，读取成功不是push可靠性证明。Gate1分支/HEAD def98f275c2ef61712008891ab1c60d308981bb7、clean及main祖先再次核实；已向用户请求一次恢复交付例外，未得到答复前不执行恢复push。后续本地阶段可独立继续。


## 2026-10-15 历史Source上下文与原目标只读阶段

起点b497578752472decffba0b44f6404b4f5cf41f6a，工作树干净；所有当前增量为本阶段所有。继续原分支，不重建/重置/删除历史工作树。GitHub只读API再次核实main64不变、开放仅108。普通沙箱请求被网络访问权限拒绝，经授权只读通道核实成功；这不是push通道恢复证明，恢复push仍等待此前一次例外授权。

0022、新capture scope/link/order version、当前reader校验和独立history API已实现。新run记录完整目标，旧NULL不回填；相同旧payload升级后发布一次可信context再重放。原source binding/mirror的DELETE/身份改写保护补齐。历史read按原捕获目标，当前归属仅导航；数量/事件保留，不合计旧单或声称当年/当前齐套。

17项定向、45项归属、15身份、20Source+1skip、43持续+1skip已明确通过。无缓存类型/定向lint、根824/824、完整lint及Server编译通过；完整PG最终结果另在冻结证据收口。数据库均为一次性合成PG，未读取任何真实凭据或艾诺科、未真实账号/DB/来源配置/部署。

失败实录：首轮历史16项13PASS/3FAIL因合成采购单价只改未采购首行，与实际DTO事件不符；修正所有来源行并增加旧payload升级验证后17/17。首轮归属45项43PASS/2FAIL把新增NULL列误判成改旧数据，改为逐项比较原有事实并在历史专用测试显式核对NULL后通过；随后比较SQL的TS引号错误导致30PASS/1文件解析失败，修正引号后45/45。没有放宽Source/单位/身份/权限保护。

历史浏览器入口、历史状态/案件选单、生产财务复核/默认关闭执行及完整G4仍待独立阶段；全计划准备采纳/类型hold/规格修订与G5不被缩小或声称完成。


最终完整PG261/261明确exit0。为证明不返回raw私密内容，合成来源行加入unmappedPrivateAnnotation哨兵后重跑历史17/17，未读取真实数据。基线先因D127当前决策blob漂移阻断；源码/冻结证据checkpoint后前向绑定并重跑，不篡改旧证据或图片。


源码/冻结报告checkpoint6bc7f2f51d9b5104d4680b5a175e0e68d9fa7e1e后，前向D127证据及独立第21项限定能力绑定；精确main64源码门禁PASS（10pages/21caps/13继承UI paths）、基线78/78明确exit0。没有覆盖旧决策/截图/hash，也没有新UI或人验。下一阶段从本阶段收口的clean HEAD记录新baseline，继续历史UI。
