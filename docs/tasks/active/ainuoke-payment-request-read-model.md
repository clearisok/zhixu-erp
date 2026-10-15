# 6086941 货款申请只读观察模型

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub为实时工程事实源，本文随字段规则、源码、权限、来源或验收变化更新。

## 本Phase基线

沿用现有erp-followup-governance工作树，不新建工作树。原feat/ainuoke-payment-request-probe保持33ccad55454568acbba9909109d23cf20bd7139b/clean；新feat/ainuoke-payment-request-read-model从该精确依赖提交开始。它包含尚未远端的G5/诊断依赖，不能冒称是独立于这些依赖的main增量，最终PR须先处理依赖，不直接合并累计G1–G5。原B2、Quote及所有旧分支和私有报告保留。

## 用户已确认（D-136）

两个私有样本S1/S2的OutStoreNum为本次申请关联的实际物料出运分配数量，单位个；两张采购合同为人民币/CNY，申请采购金额、应付金额、本次申请金额沿用对应采购合同币种。真实单号、品名和逐行数量仅在原受保护报告及私有确认记录中；公开只引用原报告hash和别名。

采购数量Num与本申请出运分配数量不同是合法事实；不重复求和Num恢复采购总数。不把本批两个CNY/个样本推广至其他物料、合同、币种或同名字段。D-135的固定读取、未知值、安全及正式接线前置保持有效。

## 已实施工程范围

- Python在内存中检查既有私有捕获的原文hash、固定6086941首页/范围，使用标准JSON解析器将数字转为精确原始文本。拒绝重复JSON键、NaN、嵌套/布尔业务值及秘密字段。无文件/凭据/网络/数据库访问、无新CLI。
- Node纯Projection接收这一精确字符串页；字段、数量和金额各自保留。missing/null/blank/0/负数/非法数值分别表示，不浮点计算、不合计、不推断银行付款。
- 行观察身份由reportId、来源账号指纹、采集时刻、页、raw hash及行序号组成；另有完整行内容hash。id只作来源候选，不当稳定业务事件、不去重或归并付款。
- 人工确认是可信集成层输入，绑定精确观察身份、行hash、采购合同及独立证据hash；不是HTTP请求可自报授权。不同来源/时刻/行/内容/采购合同均不能沿用。矛盾确认显示conflict，保留原数量金额；RMB/人民币只规范为CNY标签，不换汇。
- 每行QtyUnit/bgQtyUnit原值独立；本轮只有获确认行可获得本次出运分配单位及币种。未确认行保持unknown，不复制其他行的确认。
- 该模型仅表示固定首页观察；即使读完这个查询的全部记录，也不宣称某SO对账完整。没有公开API、Source catalog注册、快照写入、当前订单关联或UI解锁。

源码：server/ainuoke-source/payment-request-observations.ts、payment-request-fields.ts、tools/ainuoke-bridge/ainuoke_bridge/payment_request_observations.py；回归：同名Node/Python测试；Source CI增补纯观察测试。沿用Source模块文档，不另起财务业务模型。

## 当前验收与剩余Gate

13项Node（含真实Python→Node离线进程、对象/JSON字符串dataList及大数/Unicode）、96项Python（原87＋新增9）、47项诊断回归已通过；类型/Server编译及定向lint通过。最终代码/文档hash及发布门禁另行冻结，不预填通过。

后续正式接线仍需要：
1. IT确认稳定明细键的跨页/跨时间/作废修正语义；本页100个id唯一不够。现在不生成会计分录身份。
2. 证明固定销售合同精确过滤及全部分页；首页元数据尚未实证可用的ExpContractNo精确查询绑定，不猜query field/table。需新明确范围授权后再做最小真实技术验证，不重复合同Discovery。
3. 对应采购合同币种的可信来源关联；只有本地S1/S2确认可用，其他98行没有据此获得币种。工厂款号/物料名/金额相等不作为关联身份。
4. 后续持久快照、当前有效SO解析、fresh权限投影和侧栏独立交付。未完整时不以首页或空白制造“无对账记录/已付款”。

所有真实读取次数已用完；本Phase只离线复用既有报告，无新HTTP、账号/业务DB/绑定/激活/部署，四单窗口不重启，不自动合并。Git NETWORK_DEGRADED，遵守AGENTS不自动恢复规则，PR/Hosted CI尚无本Phase结果。

金额币种边界复核：仅cgGoodsAmount/PayAmount/GoodsAmount采用本轮确认的采购合同币种，其余金额币种保持unknown；不提供通用行currency。详见本Phaseobservations-amount-currency-2026-10-15冻结证据。

## 2026-10-15 最终本地验收与复审

最终被测干净提交：afd0f9bef4494afa1661a3d738c0d597513152e4；源码补丁ba3e058307c7e500ac86efc54121e17290291249。13/13观察Node、47/47诊断Node、96/96 Python、898/898项目、94/94基线均通过；typecheck/Server build/源码lint通过。精确main064e3afaf7d08b3cb62907d4402f97d9c292f1e5守卫PASS，11页/37能力/53继承UI路径；本Phase没有新增UI变化。原888/898的未绑定决策失败和旧94结果保留各自证据，不改写。

本地复审已修复通用行币种可能误用于其他金额的遗漏，新增负向测试。当前工程可作为独立、默认不激活的只读观察基础交付；正式合同对账/API/UI尚未完成，不建议把包含G1–G5未合并依赖的累计代码直接合入main。原B2与Quote工作树/refs保持原HEAD且clean，公开新增内容对原100行8类业务标识扫描0命中。无新真实请求、凭据读取、DB、绑定/激活、合并或部署。

最短后续路径：先证明固定销售合同精确过滤和完整分页，用整代快照替换只读展示；当前捕获/行/合同身份必须可追溯，跨时间稳定业务键留作增量去重/事件归并/财务计算的独立Gate，不要求全表逐条人工验收。其他币种优先可信采购合同关联，未知明确显示、不合计。当前首页不视为任何SO完整账本；需要新真实查询时先提出具体固定范围，现有次数不得复用。

Git NETWORK_DEGRADED，未自动恢复，新branch未获精确远端核实，无本Phase PR/Hosted CI；GitHub是实时工程事实源。后续仅当前摘要更新，不修改已冻结报告与hash。更新时机仍为源码/字段规则/来源/授权/PR/验收变化。
