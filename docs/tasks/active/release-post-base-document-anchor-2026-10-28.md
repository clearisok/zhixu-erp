# 发布守卫：未合并新文档的前向修订

2026-10-28；branch `feat/order-closing-month-plan`，clean输入f57945e229414a955723f33ede0749049669e141；沿用核实main869ee84dd0b31de6161011e4aa560678b244a64d，无fetch/远端写。前一片提案、合成草图及552证据已checkpoint，守卫失败不是业务/API失败，也未被跳过。具体配套UI答复仍等待；本工具修复不实施UI。

## 已复现问题

main没有BUSINESS_RULES证据根，该根先在本分支4bc68c6冻结；当前b7282f94修订保留原记录、blob/hash和继承关系，仍触发revision/anchor/leaf/drift四错误。使用既有owned临时Git fixture建立真实base、两个分支及首次文档根，再显式提交freeze→修改→前向记录；红测试准确复现同样四错误，12404ms。原552失败和红测试日志分别保留于outputs/closing-support-ui-proposal-20261028与outputs/release-post-base-anchor-20261028。

## 最小修复

仅对真实PR base尚无同路径document证据的线性修订，允许从新修订source的唯一直接Git父提交读取清单，证明前一代及其完整无环同路径链已经提交。父清单所有记录必须在当前清单完整原样保留；每个链source在父提交祖先中，新修订不能已存在父清单，source必须位于实际base→checkedHead路径。仍逐一核对原blob/hash，最多256链节点、共用64MiB父清单预算和缓存。

不新增清单字段、不改比较base、不覆盖旧ID、不给已有main路径制造替代根、不将普通提交当merge；原merge贡献、父历史、PNG、人工批准、UI影响与能力状态保护保持。[守卫契约](../../features/RELEASE_BASELINE_GUARD.md)已前向说明此边界。

## 验证与下一步

首轮红测试1失败已保留；修复后首轮定向12/12（45958ms）通过，包含两代真实线性正控与10个缺失/篡改/伪造锚点负控。随后增加原blob缺失/篡改两个负控；最终完整发布套件及同main精确守卫尚待执行，不预报PASS，也不把旧134或原型9组挪用。

本片只改发布工具/对应测试/契约/接力；无产品DOM、SQL/schema、安装、账号、业务数据库、真实Source或调度。新Git fixture限owned临时目录并按既有绝对路径校验清理；61104及旧环境/Browser/卷/备份保持。Git/ref STOP与独立复审额度问题独立保留，Hosted0、远端写0，无merge、部署、切换或资产退役。完整Goal继续，不因本修复完成而收窄。

## 第一版复审与补强

source65bf13e0＋553输入完整发布套件158/158（449969ms）通过，但独立只读复审确认两项P2：后代可借前代有效锚点绕过自身见证；前代source缺actual-base下界。新建真实Git两代未冻结场景与真实pre-base blob负控，修前均错误PASS（测试2/2失败，27964ms），原日志review-red.log保留。1951b8c7只先冻结553原契约及真实复审状态，不伪造最后验收。

补强限定每代普通修订自身的直接父见证，并为整条source链添加base下界；真实merge仍走原父分支贡献/历史并集验证，未改为线性例外。新增父清单缺失/损坏/遗漏前代/改其他记录/伪merge的后代负控，另加真实post-base双分支merge正控。修后验证待执行，本源码checkpoint不预报PASS，不把source65结果冒称修后结果。
