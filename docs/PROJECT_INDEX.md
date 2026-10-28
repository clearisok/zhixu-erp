# 当前任务入口

最新[50426切换与旧运行资产预检](tasks/active/server-convergence-cutover-preflight-2026-10-28.md)：31工作树/74容器/199卷/37网络及14个依赖junction，旧端口未监听不等于可删；两棵他人dirty树保护。新65139五healthy、无开发树bind，仍不是50426。准备器明确拒绝50426，后续受控preview/execute与具体切换批准分开，不能手改配置或restart绕过。[逐对象清单及原状态档案](tasks/completed/2026-10-28-runtime-cutover-preflight/receipt.json)保留观察时间/hash/失败/限制；本片只有只读盘点和文档，没有环境变更、产品测试或新CI。先读[当前状态](CURRENT_STATE.md)与[接力](AI_HANDOFF.md)。

最新[能力账本与Server owner核对](tasks/completed/2026-10-28-convergence-capability-reconciliation.md)：fresh main仍6479，PR131仍open/draft/head4584；49项仅校正历史实现已合入，六项退役写入口不恢复，关账/USD采用仍未合并。原592证据保留，新冻结document后账本593；部署、Source及人工接受维度不变。本片仅元数据/文档，相关状态与证据负控10/10，最终精确门禁日志由接力指向；不重复业务测试、Docker或失败Git上传。

最新[0052精确镜像/完整恢复/新持久空候选](tasks/completed/2026-10-28-closing-support-persistent-runtime.md)：原USTC失败保留，官方默认选项一次新构建成功；a198完整非空恢复9/9，TAP汇总误报仅离线纠正、不重跑。新https://localhost:65139 READY，111张非白名单表0、仅新技术管理员，五服务/四卷/重启及完整保护核对。旧52251/62428/50426等全部保留，未切换/部署/登录新库。精简[机器证据](tasks/completed/2026-10-28-support-persistent-runtime/receipt.json)和[原状态档案](tasks/completed/2026-10-28-support-persistence-input-state/receipt.json)区分各自日期/source；本片远端Git写入及新CI0，PR131仍待恢复交付。

当前必要CI接线见[2026-10-28证明](tasks/completed/2026-10-28-closing-ci-integration.md)：只扩展原source job的关账负控/实际浏览器覆盖，不增重复触发或关闭检查，Hosted结果仍独立。

最新[PR131交付与旧测试兼容](tasks/completed/2026-10-28-pr131-delivery-and-test-compatibility.md)：4584精确送达、唯一草稿；首次Release通过，另两项旧断言失败。本地136两份测试47/47、类型/lint/精确守卫通过；一次新checkpoint上传发生传输故障，独立核实远端仍4584。NETWORK_DEGRADED，不重推、手工重跑旧CI或把本地修复冒称远端通过；后继仅状态文档，当前HEAD从Git核对。

2026-10-28；`feat/closing-support-interfaces`。main已核实 **6479a713e2b80228f008049519ebbd50d10601a8**，PR130已按批准merge commit合并。先读[状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[业务规则](BUSINESS_RULES.md)及DECISION_LOG D169–D177；整体[Server收敛Gate0](tasks/active/server-convergence-gate0-2026-10-20.md)继续。

- [全部确认及PR130事实](tasks/completed/2026-10-28-closing-support-and-pr130-approval.md)：三处具体UI和无实际产出归属恢复已获批准，不重复询问。
- [本片最终验证与交付边界](tasks/completed/2026-10-28-closing-support-final-validation.md)、[a198完整工程证明](tasks/completed/2026-10-28-closing-support-complete-ui-engineering.md)：实际18项Chromium、811项目、182发布及定向SQL/API；源码/失败/原件hash分开，不借旧结果冒充新UI。
- [月份计划](features/SERVER_CLOSING_MONTH_PLAN.md)、[年度读取](features/SERVER_CLOSING_ANNUAL_READ.md)、[来源复核](features/SERVER_CLOSING_SOURCE_RECONCILIATION.md)、[执行方匹配/恢复](features/SERVER_CLOSING_EXECUTOR_MATCHING.md)、[USD工价采用](features/ORDER_USD_LABOR_ADOPTION.md)。feature内旧日期的“待UI”保留历史阶段，当前状态以本页及最新工程证明为准。
- [具体已批准界面](tasks/active/closing-support-interfaces-proposal-2026-10-28.md)及[原关账规则](features/SERVER_CLOSING.md)；D177与原CNY成衣/USD加工、原版本/冻结保护不变。
- [当前实机](http://closing-current.localhost:52251/closing-center?year=2027)：a198、独立合成临时库、已登录；保留旧62411/59846及全部原输入/库/卷。人工接受、持久切换、部署及真实来源激活分别记录。
- [旧PR130/Gate8核对](tasks/completed/2026-10-28-pr130-gate8-delivery-reconciliation.md)、[旧核心链工程](tasks/completed/2026-10-28-closing-chain-correctness-engineering.md)、[旧精确镜像恢复](tasks/completed/2026-10-28-closing-frozen-image-recovery-engineering.md)、[旧持久空候选](tasks/completed/2026-10-28-current-persistent-empty-target-engineering.md)继续绑定各自source，不冒作本片验收。

[0052恢复输入与原镜像失败证据](tasks/completed/2026-10-28-closing-executor-recovery-engineering.md)仍记录当时owned PG/HTTP8项通过、安全检查11pass1skip及回执4pass、完整恢复未完成；本片后续9/9及新候选只看上方新证明，不覆盖旧结果。独立上传预算工具在另一分支收口c91d904d，本工具实际用于4584交付，但工具分支未上传。raw在outputs/approved-support-flow-20261028。[原a027单次交付回执](tasks/completed/2026-10-28-closing-support-delivery-attempt.md)继续保留旧代理/30秒失败和当时PR0；最新远端/CI以PR131证明为准。[更早状态输入归档](tasks/completed/2026-10-28-support-ui-final-input-state/receipt.json)保留旧日期、hash、失败和限制。累计PR包含0045–0052，不能误称仅三个界面；不自动合并、部署或退役旧资产。
