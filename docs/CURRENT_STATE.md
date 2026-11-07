# 当前状态：款式物料业务展示已在本机交付

2026-11-07。分支feat/material-followup-business-view；起点干净b60d09125f165f2972da52d81cbf32eb94893b10，main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新。业务/静态固定版本4bd2300ce72374289bdf299d6a828d61196d3288；后续文档HEAD分别记录。仅本机63051，无GitHub推送/CI/PR或staging动作。

直接打开[订单中心](http://127.0.0.1:63051/order-center)或[D1992](http://127.0.0.1:63051/order-center/style-progress/detail?orderId=d2e302cf-f0d5-404e-9474-e8ecf11ec81e)，匿名使用原7项只读身份，普通有效登录保留。D1992／PI2609-086：30自购、8厂供，20采购、8入库、5出运、5出库；38笔交易按源明细ID、需求、合同、数量逐项核对。来源18:19:21，run0be7e724-6e68-47f6-a131-7403b86c2f02；不是用历史6笔入库硬凑。新页面独立板块、可点击真源单、13px表格、折叠搜索及核实详情已生效。

根因已修：需求单位未知不再隐藏真实流水；6086354缺MainID按严格明细/单号/数量/采购单/工厂款号/规格/颜色核对。用户明确确认D1992这20关联采购需求和四流同单位，私密receipt经原证据机制应用；18条采购缺口可算。2条规格描述不同仍待核实；10未采购自购需求和8厂供单位仍未知，不猜单位或填0。厂供不计自购缺口。确认热读仅本机挂载，坏补充不隐藏来源，不修改源站/采集时间/快照/head。

617逐源核对及真实HTTP完成：613有物料、4完整空结果，HTTP失败0。全量HTTP在8b版本完成，249当前/368历史来源分别标注，时点范围北京时间10:22:40–18:19:51；最后4bd补同单位确认，D1992及4代表订单复验。没有把历史可读说成本轮重采。27相关用例、类型、受影响lint、固定构建通过；浏览器覆盖四流、厂供、新单、空结果、多批次、键盘搜索折叠及390/900/1280/1920。最终D1992浏览器0错误，readonly刷新来源403、0新增手工任务。最终SOURCE守卫在246e603c28da09ff102b664f163383c13d3c2f30通过，12页面/68能力/27 UI文件、0错误；此后仅当前验收回执三份文档更新，复用结果，不重复检查或CI。

D:/WeaveOps-Local实际app12248、原watchdog28348、1个Python认证owner，AUTOMATIC_RUNNING；原启动VBS指向4bd，持续同步/认证机制没改。617head当前错误0；既有15:39失败回执早于本任务，保留未删除。46保护业务表哈希与最后切换前5151完成任务保留；持久库/卷、旧tmpfs、附件和备份均保留。后续只用原启动/恢复方式，不为界面任务重采或清队列。

[任务、批准与完整验收](tasks/active/material-business-view-2026-11-07.md)。私密reconciliation.md及unit-final交付证据、同1280前后图/1920断点图位于D:/WeaveOps-Local/material-business-view-20261107，不提交真实原文。旧入口阶段归档[tasks/completed/2026-11-07-before-material-business-view](tasks/completed/2026-11-07-before-material-business-view/CURRENT_STATE.md)。
