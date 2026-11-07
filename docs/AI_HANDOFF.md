# 接力：物料业务展示数据阶段已验证，界面实施待完成

2026-11-07。feat/material-followup-business-view，起点干净b60d09125f165f2972da52d81cbf32eb94893b10；main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新。本任务不远端交付、不CI、不staging。用户具体列清单及布局即V2批准，见tasks/active/material-business-view-2026-11-07.md及D190。旧入口状态已归档tasks/completed/2026-11-07-before-material-business-view。

真实运行D:/WeaveOps-Local，http://127.0.0.1:63051，静态/运行bf81f8ea4b7adcdf26e3319dbca37206c992e6d3。私密配置绝不可整份输出。localDemo已启用preview.real-orders原7权限；正常preview.material-sync浏览器会话保留。原watchdog28348、app34284（操作前再核实）；持久weaveops-local-postgres及卷不可重置。旧tmpfs zhixu-pg-it-d8777f722881不可停/删。同步持续运行，页面GET不触发源站。

D1992 UUID d2e302cf-f0d5-404e-9474-e8ecf11ec81e，合同PI2609-086、来源6651。17:33 RR冻结head3e6e4327-8cdb-4a21-a74f-370f9fc18375、hash65ced3365a16e58fdab21e9b17c07fadcdf5c27c73d54cccf2da517cc61478f9、来源17:17:59：38需求=30自购+8厂供，20采购/8入库/5出运/5出库。逐笔报告D:/WeaveOps-Local/material-business-view-20261107/reconciliation.md；原始before-source.private.json不可覆盖或提交。outputs/material-business-view-20261107/reconcile.mjs可复算；audit.ts已执行冻结一次，不能重跑覆盖。

数据核心：business-facts.ts提供各节点独立单位/数量/稳定ID与采购差额；projection新增relation/business/unverifiedEvents，旧汇总含义不变。6086354无MainID时仅严格多字段交叉身份匹配单位；不能推断9000000000偏移。确认receipt证据新增独立采购单位绑定，防单位变化后误用。6新测试+13原IT测试已过；类型首轮只ignored审计helper字段类型失败，已修，最终需重跑。17:48临时候选真实只读HTTP200，不启动worker，0新增来源请求，不冒称63051已升级。

下一步实施新UI，仅material-control-tower-read-only.tsx、style-progress-server-page.tsx与scoped style-progress.css；保留arrival slots、原对账、RBAC、readonly与折叠搜索。顶部6计数/时间，自购14列、厂供8列分别可折叠，点击数值对应真源单，异常进抽屉，不满页技术词。单位未知仍显示已取得单笔数量；混合单位、共享未分配不得汇总或填0。单位问题未答复不阻塞其余工作；如确认仅用现有MaterialConfirmation私密receipt机制，不全局猜单位。

完成本机只读617快照回归、代表场景、数据库/API与浏览器/响应式，固定构建一次、归档release并通过restart.request.json优雅切换一次，保留service.private全部既有字段/localDemo/调度。不要多次重启导致新登录。CUA demoOutput标签D1992已拍1280x720 before-desktop.jpg；同尺寸拍after并最终嵌入两张真实图。不要操作刷新来源或改只读权限。固定commit与运行版本分别记录。