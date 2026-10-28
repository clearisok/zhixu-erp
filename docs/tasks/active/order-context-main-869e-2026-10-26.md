# G5可信订单创建报价：已批准导航main上的前向整合

实际main 869ee84dd0b31de6161011e4aa560678b244a64d由用户批准的PR129 merge产生，双父和tree已核实；API再次核验时间2026-10-26T00:29:09.520Z。branch codex/order-context-main-869e从该完整对象干净建立，普通合流P0 9f9f87b06a89c2e929c1eab7cb9f4a8f1de6b6b7，保留原G5、4A/4B及导航历史，不squash/rebase。G5原冻结非docs源码仍为 68a38b6bfb0785cc6019381f095660b38cf8fbf7，不能把新文档提交称新构建。

## 证据P2修复

预审发现原262证据虽保留两侧对象，但DECISION_LOG有两叶，旧D149又不包含新main；直接改baseline会错误。当前真实L0 0d7194a6112dd2c956885f674ce0b76befc8a3f7的两父分别贡献独立决策叶，C记录以mergeOf闭合，绑定在P0。此阶段真实W=(新main,P0)再冻结同一路径，随后F supersedes C；W直接包含实际base，新main与P0原本互不为祖先，F可沿C为旧D149提供前向见证。不改guard、旧ID/hash/日期或批准业务，全部旧262+C保留，F后预计264/48。原P2、中间无守卫PASS状态与失败辅助工具记录不删。

## 实现和已验收范围

合同首次维护来源可进入既有new页，只读核对稳定有效SO和保存合同，再明确创建经销草稿；0033仅不可变创建参考，复用原Quote/编号、actor/request、事务审计及receipt。普通默认创建保持，加工、已采用、完成/取消和历史alias不能换绑，不自动写SO/CCT/商业采用/物料/排单。未知结果只核对原GET，旧session/layout回复先核owner。当前只Git合流，不应用SQL，不新增业务决定。

全部非docs须逐blob等于原68a，原archive SHA256 48eff4868a2f0051578665b65fb8932fb0976f99ab9408f7e6dda90295577722和日志已实际复核；按精确源码复用原68 API/引用、811根、before2/after9/107浏览器、typecheck23501ms、lint37797ms、Node9609ms/import1496ms、Browser/Server双构建及产物。before渲染6ef、后台/after68a，原134属于61e5643，不冒称当前新945或新134。七PNG/两JSON、Browser唯一users modulepreload提示及前序失败边界原样保留，见[原冻结证明](../completed/2026-10-24-order-context-quote-engineering.md)。

三个[UI原记录](../completed/2026-10-26-order-context-main-869e-input-state/README.md)逐字归档，当前仅更新实际base和阶段证据；V0/V1及已批准路径/范围不变。当前capability保留其历史分维度证据，不用本地整合抬高部署或用户接受。

最终独立复审、实际双父、旧对象/叶/源码等价及精确main守卫由outputs/order-context-staging-20261025的forward-stage-checks/forward-review/forward-final回执按同HEAD确认；缺失不算PASS。未来真实PR仍保留当前base的134及三必要CI。本轮不重复原成功测试、构建或Hosted CI。

## 保护与完整Goal

PR129已按用户明确批准合并，原分支保留；未授权或执行其他PR合并。原Git exit1原因仍UNRESOLVED，STOP保持，不push/ref/新PR/Hosted CI，不更换认证、代理或TLS配置。官方签名对象只做精确本地缓存，不等于Git网络恢复；GitHub验签valid与本地对象hash核对分开，本地GPG验签未运行。

9907/74c/fbfecb/db683/b611/7da和全部旧工作树、结果、卷与备份保持；当前不包含fbfecb独立harness修复，不跑旧harness。未修改3001、50426、62426或其他旧入口，未操作真实账号/业务库、读取凭据/旧私密报告或采集/绑定/激活/调度Source。

完整G1–G8/R仍active；此候选不等于新目标运行、真实来源闭环、4C、生产、出货或关账完成。target启用、来源额度、关账三问、coverage V2、入口接受/切换及旧资产退役仍独立待决；不重复询问已完成的PR129合并。旧9d65阶段[记录](order-context-main-9d65-2026-10-25.md)保存原开始日期、未完成P2与继续说明。
