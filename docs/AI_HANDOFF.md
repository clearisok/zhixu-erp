# 接力：staging实际交付验收

先读CURRENT_STATE及tasks/active/material-staging-delivery-2026-11-07.md。PR140已合并main390569c4cfa56cd56261674c3f2110bd306d3ff7，三必要CI全绿；staging真实运行该main，617正式历史来源发布及617 HTTP通过、D1992逐笔对账通过。工作树feat/material-followup-business-view、代码HEAD f2b7e8cda69845f9701b5a036cec6381df7e7d79；后续文档提交与部署source分开。生产未动，不再重复CI/合并。

实际root /home/jackson/weaveops-staging-preview、SSH weaveops、project zhixu-quote-trial-staging-562fbf07、gateway3003。任务TASK=root/releases/material-delivery-20261107，SOURCE=TASK/source HEAD390，runtime=root/runtime/catalog-sync-390569c4。app sha256:6a7445737a00968037f72cc1e7d244b8309509e144fd1b4d2f8abd51dde940cd；operator sha256:941e9cbbaa60e02c6fa0865f7630989f6aadaac9ab370aa9f18bc6df70d743e7。trial.conf/collector/env/private单位文件保密，禁止打印配置或提取Cookie。

D1992 staging UUID25285166-1585-449f-a8fd-81cbd7c98084，不用本机d2e...。30自购8厂供20采购8入库5出运5出库，20私密单位事实原时间按合同重绑、18缺口可算；2规格及未采购/厂供单位保持未知。617 HTTP614 stale/3原错误source_failed都可读、4完整空；不能冒称新采成功617。原23业务表/2账号权限/3订单身份已保护核对。

本机D:/WeaveOps-Local于17:30:52.671Z正式handoff暂停：service.syncEnabled=false、DBpaused_reason=staging_handoff，6queued原样保留，0认证owner，web/watchdog继续。旧宁波collector PAUSED。新staging supervisor DISABLED，cfg enabledtrue；cron已安装自然每分钟tick，03:30配对备份及03:12–03:50安静窗口。只有再次确认本机0owner、旧PAUSED及备份条件后显式activate；让自然cron启动，不手动tick冒充定时。不得两端同时开采。

当前首份新137表配对备份进行中。首轮20261107T175754Z-97f0a69a数据库dump有但附件工具缺挂载导致失败，原站已恢复；已验证实际文件缺失并补回object-bundle.mjs及/bundle运维挂载，更新固定备份policy（旧policy保留），正在重新配对。不得将失败备份当可恢复完整包。旧成功121表备份20261107T170409Z-1e9ca919及40文件离机核对保留，旧独立恢复已过。新工具row-sha256-multiset-v2保留137表+序列精确校验，不采样，旧工具/旧包不改。新restore-final.py支持bundle变量映射；最终备份成功后离机+独立新目标恢复，旧网络/卷不删。

公网Jackson已登录且列表617；动态详情模块有Cloudflare520（projection-DboBqIpA.js），正常资源源站200。CUA Tab1/browser2，session不退出；一次reload曾恢复上一模块，未禁用CF/TLS。新详情最终浏览器及真实刷新尚待。宁波脚本公网403单列为CF访问限制，gateway通过不能冒充公网。查看TASK/http-audit.private.json、D1992-reconciliation.private.json、readonly-result.json（403且新QA已归档）、protected-business-result.json。核实readonly deniedRequestId在sync_requests无记录。

剩余：备份成功/离机/独立恢复；公网D及需求无采购/空结果/多批场景、详情抽屉和实际手动点击；自然cron→源站→正式发布→HTTP/页面、实际登录/报表/跨单跨周期复用及≥30分钟队列观测。相关忽略运维工具在outputs/material-staging-delivery-20261107及TASK：host-deploy.py status/configure、http-acceptance.py、observe-sync.py、restore-final.py、preserve-business.py、install-staging-cron.py。不重复import617、不重复类型/lint/182基线或付费CI。真实source失败按原停机规则保留证据，不盲重登。最新任务/数量/运行状态同步CURRENT_STATE及私密delivery-current.json。

[前一版完整接力归档](tasks/completed/2026-11-08-before-staging-actual/AI_HANDOFF.md)保留原时点限制及测试。最终交付必须区分已合并、真实staging数据、实际自动源请求和公网验收，未完成不得报PASS。
