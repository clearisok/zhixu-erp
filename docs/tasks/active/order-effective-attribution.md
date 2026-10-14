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
