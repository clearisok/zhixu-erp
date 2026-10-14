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
