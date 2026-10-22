# 恢复点：实施已批准的交付计划维护UI

2026-10-22；feat/server-delivery-plan-maintenance-ui，从main996dfedc12da3527343cd3ff2aa5eea35497e10e建立后仅FF到干净377a3c9eb40a852851c1d4e05296a4d30f4ce9e9。先读[当前任务](tasks/active/server-delivery-plan-maintenance-ui-2026-10-22.md)和[明确批准](tasks/completed/2026-10-22-delivery-plan-maintenance-ui-approval.md)。输入三摘要在completed/2026-10-22-delivery-plan-ui-inputs/377a3c9e/。root唯一writer、既有server_convergence_review只读，不新agent；reviewer正在检查实际接线边界。

用户call_d4696fa532a64295ba294304d8404abf已答“按草图实施（推荐）”。原prototype为线程visualizations/delivery-plan-review.html，hash9ce8a0c744039874e514423a5b5fbada6d58f2d9af555b85f065806d682b64c1，不再问此批准。若需改可视化先完整读visualize skill；实现复用Foundation与原页面，不引入全局主题/路由。批准冻结89993412de4cc3f8f3ef19488d20bac67f85c3d9，精确V2记录与manifest追加完成。纯client/pending/draft已实现，26/26（478.3262ms）/类型/完整lint通过；未接Modal、detail或旧披露，不冒称产品/浏览器完成。客户端P2结果漏核对已补：修改/作废ID、精确日期数量、独立非默认新增行；默认编辑标记保留。16MiB空白JSON只证明传输容量。下一步页面hook/Modal/双guard/刷新，详任务及实际代码。

实际GET/PATCH及POST receipt在server/app.ts:513/527；D154后台144三CI完成。GET/PATCH返回{deliveryPlanSet}，receipt返回{receipt}。写/核对需order.view+order.edit及Origin/X-Zhixu-Request:1；requestId显式UUID、expectedVersion、upserts{id:null|UUID,deliveryDate,正decimal-string≤64字符}、voidIds，共1..100变更。系统默认行允许0/null，未改不能upsert；历史作废保留，允许显式作废全部。不要复制Browser浮点/remark或新建后端writer。实际backend不因商业采用、负责人或完成状态增加前置，UI不要夹带新领域限制。

新客户端须白名单、有界完整响应、current lease及原请求精确回执；不能回退Browser或取第一行/平均值。会话/权限/SO/ABA变化前移除旧数据，迟到401不invalidate新会话。pending为actor/tab单槽sessionStorage，只存未决Server命令、跨SO不可覆盖；发送前写入并核对成功，unknown只查receipt，匹配applied/rejected后才清；恢复/刷新不自动PATCH。接detail时sourceGuard与deliveryGuard分开再OR，不能相互清掉。旧SavedDeliveryPlans如已展开，保存后也需受owner控制重读。

前置377已精确远端/精确guard PASS。一次Execute STOP（exact远端）与零push DryRun DELIVERED_VERIFIED保留，无第二push；原raw stderr缺失不猜原因。2026-10-22T00:48:51.505Z只读核实其Source39699348958、Team39699352582、Release39699355389均attempt1/success。outputs/garment-filter-screening/ci-dispatch.json已消费，不重跑dispatch或真实工具。结果已追加新任务，不把旧成功冒充本UI HEAD。

工具源码a98e的17Node/169Python/types/lint/build/116release（186116.334ms）及独立静态review已通过；377只多metadata。原授权固定工具在F=31cad6三CI通过后一次调用即candidate失败，0 HTTP/0报表/未读凭据。旧wx attempt和receipt不得删除或重跑；离线原包装/raw hash、唯一合同及16id核对通过，修复只是编码配置深度误拒，真实过滤仍未验证。没有新Source额度，当前UI批准不能扩大它。

manifest仅追加批准至269/57，原268证据/旧冻结报告/105失败/c0d持久镜像/144回执保持。后续UI需真实隔离built Chromium/原P6回归，类型lint构建release及精确main守卫/独立review，重要Gate checkpoint并安全交付一次，不创建重复累计PR、merge/close/部署。保护3001、所有旧端口/卷/账号/Browser/工作树，仅新自有合成fixture。Num/outdate不重问，原关账问题不默认，完整Goal active。
