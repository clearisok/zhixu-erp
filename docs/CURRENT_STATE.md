# 当前状态：本机只读演示自动进入已启用

2026-11-07 17:21，北京时间。分支feat/local-demo-auto-session；固定运行/静态版本bf81f8ea4b7adcdf26e3319dbca37206c992e6d3，从干净afffff25841cb47cc67c2b9368f3d3c1e42b59c7继续。main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新；无推送、CI或staging动作。后续文档提交不冒充另一个已运行业务版本。

真实环境http://127.0.0.1:63051。直接提供/order-center及/order-center/style-progress/detail?orderId=d2e302cf-f0d5-404e-9474-e8ecf11ec81e；不再提供登录页作为演示前置。私密localDemo显式固定preview.real-orders的public ID及7项既有只读权限，匿名通过原v1/HttpOnly/SameSite=Strict会话进入，目标地址保持，正常有效会话不替换。普通服务未安装此入口；回环Host/连接且无转发头/跨Origin才启用，账号失效或增权失败关闭。

17:11真实空Cookie HTTP：订单中心617、详情/刷新/重开均200；D1992物料200，来源16:47:29，30自购＋8厂供；写入与sync-order均403，无新增任务。关闭模式旧自动cookie和匿名均401，再启用200，不重启worker。HTTP窗口来源登录/报表/采集计数差值0。46保护业务表哈希及617订单/head/可读快照保留。

浏览器已核实bf81f8ea的D1992页面及原preview.material-sync正常身份保留；工具不支持新无痕上下文，用户自行无痕验证订单中心、D1992、刷新/关闭重开，明确回复“全部正常，无需登录”。17:21记录人工验收，入口目标已完成；不将用户确认冒称自动浏览器测试。

边界单测1、新数据库HTTP8子场景及父测试9、旧browser-session、类型/受影响lint/固定构建、PowerShell解析和实际Enable开关通过；源码守卫在b4f4547ce8d7d257c771c7403d1cf0fea7422bc6通过，后续仅三说明文件记录用户确认，逐差异核对并复用结果。新用例fixture缺来源时503、Node fetch未按预期送出Host的失败均记录，修正验证方法而未放宽产品规则。不重复无关全量测试/付费CI。

原同步配置、617订单和持久库不变。app34284、原watchdog28348；后台AUTOMATIC_RUNNING，start-hidden.vbs指向新release，电脑用户登录且Docker就绪后恢复。开关脚本set-local-demo.ps1 -RuntimeRoot D:/WeaveOps-Local -Enable/-Disable即时生效，无需重启采集。原tmpfs、持久卷、附件和配对备份全部保留。

[演示约定、启动及实际证据](tasks/active/local-ainuoke-automatic-2026-11-07.md)；[前阶段完整状态](tasks/completed/2026-11-07-before-local-demo-entry/CURRENT_STATE.md)。
