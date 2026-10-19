# 2026-10-15 两合同分页工具前状态快照

起点fbb6002f6b8fc0257bca72c3bd4e4ae07488f0a7；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。以下保留当时原文/日期/hash/结果/限制，不代表最新状态。

## docs/CURRENT_STATE.md

LF SHA256：e3a73007e0d621e609c4fe502212cafdd574d3354b81e621502534173f14b5a8

```markdown
# 当前状态

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub为实时工程事实源；随代码、PR、授权、来源或验收变化更新。

- 订单身份PR109及依赖Draft110/111/112均未合并，#108独立；刚核实#109精确1fcc440f三项CI成功、可合并，未获本轮合并授权。
- G5排序/团队设置、页头、明细展开、事件侧栏与独立num_dyc保持B2@68ac1fc9/clean；原提交、私有证据、已结束的四单窗口12/12保留，不重启或改现有演示。
- 6086941实读仍为ead8e371的首页100/17675行、2HTTP/1报表、49列。D136已记录两个精确样本的本次出运分配口径、单位个和CNY；申请金额沿对应采购合同币种。其他行未因此获得单位/币种确认。
- feat/ainuoke-payment-request-read-model沿现有工作树从33ccad55/clean起；原诊断分支保留。离线提取及只读观察保留精确文本、重复/未知/负值、逐行证据；不合计或推断稳定财务分录/银行实付。
- 已有100行离线验证通过：仅2行有确认CNY/出运单位，另外98行币种未知。0HTTP/0DB/未激活，原报告未改，新确认/观察文件ACL保护且Git忽略。[工程任务](tasks/active/ainuoke-payment-request-read-model.md)、[用户确认](tasks/active/evidence/ainuoke-payment-request-probe/row-context-confirmation-2026-10-15.md)。
- 13观察Node、47诊断Node、96Python、898项目、94基线，以及类型/Server编译/源码lint通过；最终测试与精确main守卫在afd0f9be/clean通过（11页/37能力/53继承UI路径）。只有后续摘要变化，不冒称Hosted CI/产品人工验收。
- 正式对账未接入：先核实合同精确过滤/完整分页、当前来源身份与采购币种，做完整快照/有效SO/fresh权限和原侧栏；跨时间分录键单独限制后续增量/去重/计算。缺预付款未知，首页不是某单完整账本。
- 独立Quote退出修复fix/quote-logout-save-retry@d9bf53b47f2f587d6c0db4954b0b8a55fe431638保持干净；13浏览器/112前端/94基线及质量通过，不混入财务分支。
- Git仍NETWORK_DEGRADED，此前实际pushes0，本轮未重复恢复；新代码未远端/无新PR或Hosted CI。用户重新提供的AGENTS恢复规则适用，不伪造原commit交付。
- 所有真实读取次数已用完；无新凭据读取、真实账号/业务DB/绑定/激活/部署，不触碰宁波18443/18444，不自动合并。

[确认前摘要原文](tasks/completed/2026-10-15-before-payment-row-context.md)保留日期/hash/结果/限制；旧工程验收仍以各自冻结SHA为准。Goal未完成。

金额币种边界复核：仅cgGoodsAmount/PayAmount/GoodsAmount采用本轮确认的采购合同币种，其余金额币种保持unknown；不提供通用行currency。详见本Phaseobservations-amount-currency-2026-10-15冻结证据。

```

## docs/AI_HANDOFF.md

LF SHA256：cb9694e0a549536c2badf7324e2777b0b73b6e90af459ff334e6aeb2919d8940

```markdown
# 当前恢复点：6086941逐行确认和离线观察模型

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。当前feat/ainuoke-payment-request-read-model从原诊断33ccad55454568acbba9909109d23cf20bd7139b/clean开始，沿erp-followup-governance工作树。B2@68ac、诊断33cc、Quote小修d9bf及原refs/私有报告保留，不新建工作树/重复PR。

D136已记录最新用户确认：两个精确样本OutStoreNum是本次申请物料出运分配、单位个，采购CNY且申请金额沿对应采购合同币种。其他98行不能默认CNY。原私有报告d500982d3b6ba1b2cf408db4e626e4097d93c3570852398e3b911be98cbb80ae不变。

Python纯离线extractor和Node纯Projection保留精确数值文本、missing/null/blank/0/负值、各数量金额；id未核实为稳定分录，不去重或求和。人工确认绑定来源指纹/时刻/raw hash/页/行/完整行hash/采购合同；变化或矛盾不沿用。没有API、DB、Source catalog注册或UI解锁；确认只由可信集成层提供，不接受客户端自报。

100行离线通过，0HTTP/0DB。原受保护目录中的新私有确认SHA212481539bf342aef5899658199bf20d95e76331a3c3d32983a1a0e768c60e02，当前逐金额观察SHA0393cce74403f943f291a46f8beae6f6862a57d5d15edb418d25ac2c815beee1；旧观察SHA db33b5a9fa782cbd6117e6d2b706632fa7a76f5aa7479286bb386b5298bc6518保留。公开仅别名/统计/hash，不把真实单号/品名/数量金额入Git。

最终源码ba3e058307c7e500ac86efc54121e17290291249；绑定提交afd0f9bef4494afa1661a3d738c0d597513152e4/clean的898/898项目、94/94基线、精确main守卫PASS；13观察Node/47诊断Node/96Python、类型/Server编译/源码lint通过。随后只更新摘要，最终完整HEAD看git log，交付前核对clean/精确门禁。

下一工程：固定合同过滤/完整分页、当前来源身份/采购币种→整代持久快照/当前有效SO/fresh权限→原事件侧栏。跨时间稳定键/作废修正单独守卫未来增量/去重/财务计算，不要求全表逐条人工验收。首页不是某单完整对账；申请字段不等于银行已付，不新增付款公式。

所有真实读取次数用完；最新回答只确认含义，不扩大读取/写入范围。不要再请求6086941/Discovery/材料、读取凭据、重启四单窗口、改真实DB/账号、部署或自动合并。新真实验证先备好固定范围再确认。

Git NETWORK_DEGRADED，最新AGENTS恢复规则适用，不自动恢复/换认证。main未变；PR109精确1fcc三项CI成功/可合并，110–112及108独立，未获新合并授权。新branch未远端、无新PR/Hosted CI；恢复命令必须用最终完整SHA，只给一条。

金额币种边界复核：仅cgGoodsAmount/PayAmount/GoodsAmount采用本轮确认的采购合同币种，其余金额币种保持unknown；不提供通用行currency。详见本Phaseobservations-amount-currency-2026-10-15冻结证据。

```

## docs/PROJECT_INDEX.md (prefix)

LF SHA256：2c8b3a9b0a0c3b77e5bcf89a4de27595f2992ee70a32bb464b66d4aa7d872eb0

```markdown
# 项目知识索引

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub为实时事实源；随代码/PR/授权/来源/验收更新。

- 当前恢复：[状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[批准计划](tasks/active/order-identity-program.md)；身份PR109–112与独立108未合并。
- G5 B2排序/设置/侧栏及num_dyc：68ac原提交保留，[冻结结果](tasks/active/evidence/material-source-integration/material-display-results-2026-10-15.md)。Quote独立小修d9bf保留13浏览器/112前端/94基线证据，不混入财务分支。
- 6086941：[首次成功100/17675](tasks/active/evidence/ainuoke-payment-request-probe/real-first-page-2026-10-15.md)、[49字段](tasks/active/evidence/ainuoke-payment-request-probe/real-first-page-schema-2026-10-15.json)、[两行确认](tasks/active/evidence/ainuoke-payment-request-probe/row-context-confirmation-2026-10-15.md)、[只读观察模型](tasks/active/ainuoke-payment-request-read-model.md)、[Source模块](features/AINUOKE_SERVER_SOURCE.md)。不是完整合同对账或Source/UI激活。
- [确认前摘要原文](tasks/completed/2026-10-15-before-payment-row-context.md)保留原日期/hash/结果/限制；读取次数用完、四单窗口12/12结束，不新增DB/绑定/部署，不自动合并，Git恢复遵守AGENTS。


```

## docs/features/AINUOKE_SERVER_SOURCE.md (prefix)

LF SHA256：c77d077cc01cc6248f08a4863a81bddb47db23f8f7a6f9f3181943c408846d9b

```markdown
# 艾诺科 Server Source：正式订单与持续物料展示

## 当前恢复摘要（2026-10-15）

main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。6086941首页实读100/17675、49列及原始hash已核实；[首次成功报告](../tasks/active/evidence/ainuoke-payment-request-probe/real-first-page-2026-10-15.md)保留当时事实。[后续用户确认D136](../tasks/active/evidence/ainuoke-payment-request-probe/row-context-confirmation-2026-10-15.md)：OutStoreNum为本次申请关联的实际物料出运分配数量；两个样本单位个/CNY，申请金额沿对应采购合同币种，不推广全表。

[离线观察模型](../tasks/active/ainuoke-payment-request-read-model.md)保留精确decimal文本、缺键/null/blank/0/负值和独立数量/金额；来源id未证实稳定，不去重或求和；确认限定精确来源捕获及行，变化后重验。已有100行离线0HTTP/0DB通过，2行确认CNY/出运单位，其他98行币种未知。

没有正式财务Source/快照/API/UI接线。仍需固定合同过滤/完整分页、稳定明细键和采购币种来源；缺预付款/审批/实付证据保持未知，不认定银行已付。6086941与6087050同名字段分开，不新增汇率、单位换算或齐套改动。

13观察Node、47诊断Node、96Python、898项目/94基线及类型/Server编译/源码lint通过；afd0f9be/clean的精确main守卫PASS。B2@68ac、独立Quote小修d9bf保留；新代码未远端/部署。真实次数用完，四单窗口12/12已结束；不改真实账号/DB/绑定/激活/宁波18443/18444，不自动合并。最新AGENTS恢复规则适用。

[确认前摘要](../tasks/completed/2026-10-15-before-payment-row-context.md)保留原文与hash；随来源/代码/授权/验收变化更新，GitHub为实时工程事实源。


```
