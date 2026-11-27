# 订单工作台 P1–P4 局部优化 / PR178

本阶段起点：feat/order-workbench / 0787ae72815384a19779b5e4ae90e7d24db4fc8e；dirty为空。重新 fetch origin/main=10b9a7d827e1c09f152ead58c21f26712d49a619，PR178远端起点一致。

[用户明确批准v2](order-workbench-refinement-approval-2026-11-27.md)，[Issue177转录](https://github.com/clearisok/zhixu-erp/issues/177#issuecomment-7219913065)。只沿原PR实施，Project实际读取后仅Review→In Progress，无其他字段变化。

## 实际范围与口径

- P1 横向紧凑关注区；多异常保留，手机换行；原滚动物料及颜色操作保持。来源ready但完成状态未知时也显示业务待核对，不混同同步失败。
- P2 删除指定常驻辅助说明，来源只读通过字段tooltip保留，未新增输入/覆盖来源。
- P3 删除计划归属/合同重复对照折叠区；正常一致提示删除，真实差异/未知提示、原精确计划数量/空日期/作废历史、重新读取及顶部维护继续保留。API及持久化/来源所有权未变。
- P4 仅在工作台原物料卡（有history入口）展示新摘要，共享旧调用保留原展示。来源ready且需求项数与原summary一致才显示数字；Server严格按原明确自购范围，厂供/其他供料留在详情；不跨单位合计。
- “有采购/入库记录”只表示来源存在记录，不能当完成。采购完成复用已可判定状态和原purchaseShortfall=0；入库完成复用原ready状态。分母是自购需求项，任一对应状态未知则整体比例待核对，空分母不适用。不会按pending_inbound+ready推定采购完成（入库可能独立多于采购）。
- 待入库（已采购）复用business.pendingInbound的known正缺口，逐项展示原数量与单位；不等同需求入库齐套。单据关联/单位未知时标明已确认项与待核对项；不将缺数据当0。
- 本轮真实GET：6233-937，16项自购（面3/辅13），15项有采购记录，12项有入库记录，10项已有采购未入库缺口；16项完成状态未知，两个齐套率不能可靠展示。不是接口未接通，也不扩大范围修复单位/单据规则。

## 工程恢复点

原0787的Hosted team-access因compact driver仍选择旧.oc-overview-heading失败，已改为等待实际工作台identity；不改业务/页面权限。原source workflow取消、baseline成功，不能把旧CI写成全绿。

首次类型检查发现supplyMethod可为null，已保留未知并修复可空读取；通过结果待本轮实际复核。必要单元/浏览器、完整Lint/Typecheck/Build、根测试及发布检查执行后追加，不借用上一轮PASS。

本地真实Demo仍为127.0.0.1:5177；原只读SSH桥会话断开后仅重启本任务本地入口，未部署/重启远端服务。浏览器业务写入仍403，不触发采集，真实凭据不输出/落盘。旧截图与冻结证据不覆盖，新证据前向提交。

首个代码Gate：13/13针对性单元/切线检查、npm run typecheck、完整npm run lint零警告通过；git diff --check通过。其余构建和浏览器/完整检查仍待本阶段源码checkpoint后执行。
