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

## 第二代码Gate：真实来源过期展示

12dd49c3a09950907df9c9101236703a32457a69已一次push并精确核实DELIVERED_VERIFIED。该源码Server前端Build通过；独立Linux root1032/1032、4套浏览器43/43及9路径发布守卫通过，release独立测试结果待完成。实际6233六宽浏览器通过，但来源于21:53超过有效时限，摘要只显示待核对，不能冒充数字验收。

据真实stale响应进一步保留上次完整来源的需求/记录项数，主卡明确“上次来源·当前待核对”；不将旧完成或缺口作为当前判断。上次来源待入库明细单独标历史。非保留快照的不可用/不完整/关联异常仍全部待核对，未改变同步机制或触发刷新。新增7/7纯项统计验证，覆盖跨单位、采购/入库独立、未知、空分母、厂供排除和历史失效保护；新源码构建/浏览器仍须复核。

真实1ba49657构建已显示16/15/12、未知比例及历史10项缺口，截图核对发现手机滚动物料锚点需避开双行顶栏；仅增加移动端scroll-margin-top，不改其他模块。追加可见标题几何断言，最终构建待此微调checkpoint后重验。12dd完整release182/182通过。

## 证据Gate起点与完成结果

起点c856f35f1caa073c829976c829513f6e941d44df，工作树clean；该源码一次push并精确核实DELIVERED_VERIFIED。Server前端最终Build通过。1ba四套浏览器44/44通过（工作台12、来源9、交期14、紧凑9，含父计数），清理通过；c856仅后续手机锚点CSS及脚本断言，实际6233最终51/51通过（2026-11-27T14:04:00.653Z），来源stale，16/15/12和历史10项均与现有API核对。选定7张新图及新工程/运行指南前向提交，旧冻结证据保留。

最终全量检查将在新证据冻结清单候选上执行，不能将12dd的1032/182冒称最终版本结果。未触发采集，未部署或写真实数据；本机Demo已仅重启本任务入口，/__demo和build-info均为c856。

## 最终冻结清单Gate

证据checkpoint d3f1b1a24303cb44215ec7defab050bc0e9eb068已一次push精确核实；只新增本轮7PNG、工程和新运行指南，不覆盖旧证据。708条清单候选SHA256=f4a9b6c6ffd9f4d220bc12eab6955d1d4bacdc86f1452f2e9a9670b1b99b2285，10条新证据分别绑定已存在12dd批准/d3f1图文checkpoint，截图渲染SHA独立记录。原698条及能力状态保持。

最终完整Typecheck和Lint均exit0、零警告。Windows源码守卫尝试无结果后主动停止，不记录PASS；按前轮已验证方式在任务专用隔离Linux、实际Git对象副本/匹配autocrlf、原Node24依赖上运行最终两条发布检查和根测试。共享Git配置及对象只读，不改宿主环境。最终结果待运行后追加。

## 最终工程PASS与评审回填

完整冻结清单提交9af74ab9aaa0bd34e8441fcea02933f37cb69ae4已一次push并精确核实DELIVERED_VERIFIED，main交付前只读复核仍10b9a7d827e1c09f152ead58c21f26712d49a619。最终实际源码/证据版本（708条、候选SHA256如上）在隔离Linux Node24/实际Git对象副本中：npm test **1033/1033**；npm run test:release-baseline **182/182**；npm run check:release-baseline -- --base-sha 10b9a7d827e1c09f152ead58c21f26712d49a619 **PASS，9路径**。三项均exit0，无失败/跳过。日志保留outputs/order-workbench/refinement-final-root.log、refinement-final-release.log。

最终c856构建四套UI **44/44**、无失败/跳过，owned Chromium/HTTP/PG清理通过，日志refinement-final-ui.log；真实6233 **51/51**，截图和历史数字与GET核对，手机物料标题避开顶栏。最终完整Typecheck与Lint均exit0，Lint零警告；Server前端最终c856 Build通过。此后只回写文档/结果，不改代码、UI、清单或冻结证据；最终HEAD再跑源码守卫，完整已通过检查不无理由重跑。

原PR178已通过GitHub连接器更新中文描述、统计口径、真实本地Demo、P1–P4前后7图、测试及未解决的来源限制。9af远端baseline成功，source/team-access运行中；不能冒称CI全部通过。Project实际复读后只把Issue177 Status从In Progress回Review；Issue仍开放，其他字段/视图/自动化保持。最终结果文档提交/精确远端SHA和CI状态在原PR及交付回复核实。

待用户实际体验及评审；不合并、不部署、不改服务器配置/数据库/真实业务数据，不启用自动合并。源数据完成状态、来源时效和原出货503限制仍保留，不为满足数字展示扩大业务范围。
