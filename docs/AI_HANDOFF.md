# 接力：款式物料业务展示本机交付完成

2026-11-07。feat/material-followup-business-view；业务/静态运行固定4bd2300ce72374289bdf299d6a828d61196d3288，后续只有证据/交付文档提交。起点b60d09125f165f2972da52d81cbf32eb94893b10干净；main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新，无远端/CI/PR/staging。任务具体用户V2批准、D190及阶段历史见tasks/active/material-business-view-2026-11-07.md。不要把本机成果描述成staging升级。

真实root D:/WeaveOps-Local，http://127.0.0.1:63051/order-center；D1992深链/order-center/style-progress/detail?orderId=d2e302cf-f0d5-404e-9474-e8ecf11ec81e。localDemo原preview.real-orders7权限，匿名自动进入、普通有效会话不替换；readonly没有刷新来源按钮、真实POST403，无新增手工任务。最终截图及Cua交付标签是真实63051，旧57404不作验收。临时56955只GET候选服务35384和测试标签已关闭；正常app12248、原watchdog28348、Python认证owner34468（PID操作前再核实）。原VBS指向4bd，后台AUTOMATIC_RUNNING，不需Codex或浏览器保持打开。

D1992合同PI2609-086、来源6651；30自购8厂供、20采购8入库5出运5出库，38笔稳定ID→需求→合同/数量逐项通过。最后真实HTTP来源18:19:21、run0be7e724-6e68-47f6-a131-7403b86c2f02、hashbcb4238bcb1dc6c8a3cd1c86a5de387c644bfba6d415a2b4c04020b96770032f。before-source.private.json17:17:59和before-reconciliation.md保持；最终报告reconciliation.md、unit-final/reconciliation.private.json对应确认后的实际HTTP，不覆盖原证据。

修复business-facts区分各流数量/单位与需求比较；6086354缺MainID时严格多字段单位核对；自购/厂供独立、真单据抽屉、13px/32px及核实折叠，原arrival slots/对账/权限保留。用户明确只确认这20关联采购需求及四流与采购单位一致，root/material-unit-confirmations.private.json的20份私密receipt仅通过原MaterialConfirmation证据应用。18缺口可算，2衬布规格150cm与150cm YS5026有弹适用性仍未知；10未采购需求与8厂供单位未知。不要把确认推广到其他订单/厂供，不能改原时间、SQL拼指针或猜单位。无采购完整来源是无记录/未开始，不是采集失败。

server/ainuoke-source/local-unit-confirmations.ts只由显式local runtime挂载，普通Server不装；每请求热读文件后仍走原RR身份、来源账号、订单与证据校验。确认内容、人工身份、evidenceKey不输出到HTTP或前端存储；只公开单位及confirmed来源语义。证据变化自动失效，坏文件仅撤下可选单位并记录封闭诊断，原来源仍可读。未来有明确业务确认可正常更新私密receipt，不需再重启worker；不要用户自行编辑或提供秘密。

617逐源身份/数量核对0遗漏；8b真实617HTTP审计139.321秒（2并行GET）：613有物料、4完整空结果、失败0，249ready/368stale，来源北京时间10:22:40–18:19:51；最后4bd仅D1992补确认和准确核实说明，已复验D1992+4代表订单，不重复617。浏览器验收四流、厂供、PI2611-057新单（2自购1厂供无采购）、PI2507-132空单、PI2505-075多批次、搜索/折叠/键盘及390/900/1280/1920无页面溢出。原全局td9px在本页显式13px。最终浏览器0error/warn，before/after-desktop同1280、after-wide实际1920、after-purchase/factory截图均受保护，不改旧基线图。

27相关用例＝7business+13原IT+2单位文件边界+2展示语义+2SDK/发布HTTP+1私密确认数据库集成；类型/lint/固定构建过。首次fixture未标自购的断言、query缺类型字段、HTTP JSON省略undefined的核对方法失败已修，未放宽产品规则。没有重跑无关182项或付费CI。冻结feature新版本绑定4bd、D190/rules绑定629，旧证据ID/hash不改；最终SOURCE守卫须在完成提交运行并记录，不能替代真实HTTP/浏览器/用户认可。

46保护业务表哈希、617订单身份及切换前5151完成任务保留。617head当前错误0；全局历史1笔采集失败在15:39，早于本任务，不为漂亮统计删除。自动同步机制及源站只读不变。保留weaveops-local-postgres/卷、原tmpfs zhixu-pg-it-d8777f722881、对象包和配对备份；不可停删旧资产/清库/清队列。原启动恢复说明见local-ainuoke-automatic任务，恢复后台双击root/start-hidden.vbs，单实例锁保留。剩余仅真实业务事实：2规格适用性和未采购/厂供单位可后续明确；不阻止已有真实流水正常使用，不继续无界开发或新增采集。