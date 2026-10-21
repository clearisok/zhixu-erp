# Server当前登记事实的交期覆盖

2026-10-22；`feat/server-delivery-coverage`，干净输入
`144f2a269affb41207566557f09ed06e8decf49a`，本阶段再次独立核实main仍为
`996dfedc12da3527343cd3ff2aa5eea35497e10e`。root唯一writer，既有reviewer只读。
原PR120–127及工作树保留；不新建重复累计业务PR、不合并或关闭。

## 允许范围

依据BUSINESS_RULES的累计多交期需求、D043直接订单归属和D151实际产出保护，
仅扩展现有生产订单详情GET的非金额只读投影。不新增表、写接口、权限、Source请求、
Browser fallback或UI。现有只读REPEATABLE READ事务内读取一次执行事实。

- 有效DeliveryPlan按日期分组，保留全部行ID，逐日期累计需求。
- 当前已登记实际产出全部保留，含已取消原排单；不按实际完成日期重建日流水。
- 预计供给只计未取消、未结束任务的正剩余量，按原计划结束日期进入截点供给。
- 缺口=max(累计需求−当前登记产出−截点前预计剩余,0)。同一供给不重复累计。
- 无日期需求单独未评估；没有有效交期不能称无风险。不回退Source日期。
- 原物理SO归属、小数精度、500排单/1000交期/1MiB响应上限保持；超界明确失败。

名称限定为“当前登记事实的交期覆盖”，不是历史准时率、当日产量、库存、成衣出货、
产值或关账，不减去6086979观察。Num/outdate已确认，不重新询问。

## 验收与交付

计划验证同日换序、多日累计、取消产出、结束余量、零更正/超产、小数/大数、空/作废
交期、Source日期不回退、历史alias隔离、内外发/停用资源、实际RR并发快照、fresh撤权、
无金额和容量失败。测试只用本阶段自建一次性合成库，不动既有端口、卷或业务库。

开始时上一阶段144已精确远端核实：原push STOP回执保留，原工具后续只读Dry Run
pushes=0为DELIVERED_VERIFIED。权限CI39685221309与发布CI39685225162已成功，来源
CI39685216005仍执行中；不重发原提交或重复dispatch。后续记录最终状态，不提前PASS。

## 当前实际验证

纯投影与既有GET接线已实现，D155及执行feature前向补充精确语义；没有改UI或schema。
当前定向15/15（8375.1411ms）、原执行/排单/升级及契约76/76（53630.6943ms）、
typecheck、全lint已通过。定向包括真实RR交错提交、内外发/停用资料、取消产出/零更正、
有效root与历史alias分离、原HTTP/no-store/fresh撤权/归档和完整容量422；读取不写审计或回执。

首轮定向11/15通过、4失败（含父套件）：测试误用旧表名、错误码及容量样本不足，均改为
实际资源命令/permission_denied与真实超量样本；没有修改产品规则迎合断言。typecheck首次
发现当前TS target不支持BigInt literal，改用既有BigInt构造写法后通过，未改工程target。
完整项目、构建、发布基线、独立源码/证据review、精确交付及新CI仍待，不提前PASS。

完整Goal仍active；不部署、切换旧入口、真实采集、账号/业务数据操作或环境退役。
关账与真实读取待决项继续原问题，不默认。

原客户端对新增后台字段的真实HTTP兼容已补验，最终源定向15/15（8389.6034ms），
最终typecheck/变更TS lint、Node及前端build通过。working独立review无P1/P2；reviewer
读取日志但未自行执行测试。下一步冻结本源，再绑定D155和执行feature新版本后运行
全项目/发布回归与精确守卫；当前不提前称这些最终检查或新CI完成。

源码冻结为`ff8b8d68bf25e61ea757caee90ad5a7e998d6037`，无新应用改动。
随后全项目927/927（262124.4801ms）、独立发布116/116（260394.2574ms）通过；
这些回归不替代实际main守卫。首轮守卫确实FAIL：新feature revision接在main尚无的
独立文档root上，触发REVISION/ANCHOR/LEAF/WORKTREE_DRIFT四项；日志保留。
独立review发现同一元数据P2，应用代码无P1/P2。

处理为恢复原SERVER_PRODUCTION_EXECUTION.md冻结字节；新实质契约独立放在
[SERVER_DELIVERY_COVERAGE](../../features/SERVER_DELIVERY_COVERAGE.md)，不改守卫或旧证据。
只撤去尚未提交、被拒绝的feature记录；原263条、56能力及D155实际ff8绑定保留。
待新契约冻结后作为新root绑定，再核精确守卫；应用源码和已执行测试不因此冒称改变。
上一阶段144三CI此时均attempt1 success，最终结果已追加原任务，不改冻结工程报告。

修正后的实际main守卫PASS（main996/head0e54，11pages/56能力/80继承UI路径，errors[]）。
独立证据复审确认P2闭合、原263/56与其他字段逐对象不变；ff8至0e54无应用/SQL/测试变化。
实际验收及失败限定整理为[冻结工程报告](../completed/2026-10-22-current-delivery-coverage-engineering.md)。
下一步只冻结并绑定报告/独立能力，最终metadata精确守卫/远端及新CI仍独立待完成。
