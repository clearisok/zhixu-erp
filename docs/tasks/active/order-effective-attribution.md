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

9项定向通过：第121行内容变更（计数/前100ID不变）能让完整hash改变而旧preview hash不变；unknown FK、预算超限、未知vs明确空、单边执行根保护、财务独立复核要求、源lease变化/缺scope/重复/过期拒绝、目标identity不可改删、case版本变化拒绝及严格命令字段。无缓存类型/定向lint通过。下一阶段审批、有限目标/方案许可及事务执行/纠正；执行默认关闭，不用这个hash替代授权。上一消费者接力保留于completed。
