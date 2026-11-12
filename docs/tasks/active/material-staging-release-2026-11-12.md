# 已验收物料页：PR审计与staging发布

2026-11-12用户明确接受本机8f5b5d8989c6e54ac7c336d3d6f9b14cb29df9b3，并授权检查全部open PR、合并安全完成项、PR交付与staging部署。保留所有PR/分支/原始历史，不操作生产。新的明确部署许可替代本轮之前仅本机的阶段限制；不改历史批准/截图的原时点。

起始branch feat/material-followup-dense，HEAD8f5b5d89，干净。GitHub API核实main6dc17c645215b3eb08e03624effdee2d182b3e1d，随后Git成功fetch同SHA。生产工作流deploy-production.yml仅workflow_dispatch，无push/merge部署；三项验收仅PR/手动、已有concurrency/cache，集中一次PR CI，不重跑历史CI。

## Open PR审计（全部）

初始全部open查询（含bot、limit1000分页）仅#136；没有Dependabot open PR。

|PR|标题|创建/最近更新|目标/状态|检查及处理|
|---|---|---|---|---|
|136|fix: 给予单次Git上传独立三分钟预算|2026-10-30 11:11／11:35北京|main；Draft；CONFLICTING|保留原状。其说明明确“保持草稿，不自动合并”，符合本次暂缓规则；旧三项CI成功不代表当前main通过；GitHub reviews为空，历史说明自述复审不冒称正式批准。仅Git上传工具/测试与历史文档，无业务/SQL/接口/依赖改动；与本次UI不重复。main尚无该180秒push代码，但不影响UI交付。旧基线b1和共享状态文档/清单已过时且存在冲突，不以覆盖现状方式合并。|

本次待创建唯一物料优化PR，包含8f5b5d89及所有已验收依赖。相对main：3产品UI文件、单测/集成测试、显式本机启动器及文档/基线；无迁移/业务API/源认证/调度变化。本机免登录只在原显式loopback脚本安装，staging正常createApp不安装。

## 网络恢复证据

默认Git受host-specific http.https://github.com.proxy的失效回环端口阻塞；普通direct到系统DNS地址复位。一次HTTPS dns.google当前查询返回20.169.109.160，限定进程内清除代理及curloptResolve后，Git读取1831ms成功、fetch1918ms成功，SHA与API一致，证书验证保持。没有改变共享Git/代理/TLS配置或认证方式。后续既有安全交付工具只在相同进程覆盖下使用，最多一次push，独立API核对完整SHA。

## staging起始事实及安全计划

线上app/main仍6dc17c64，project zhixu-quote-trial-staging-562fbf07，ROOT /home/jackson/weaveops-staging-preview，runtime catalog-sync-6dc17c64，gateway3003，原库/卷/对象均保留。唯一正常来源owner在宁波，本机源worker=false。

只读现状：source control enabled=true、paused_reason=catalog_changed_or_over_limit、heartbeat=2026-11-11T07:52:35.484Z；supervisor STOPPED_FAULT/worker_stopped_requires_review；620绑定订单/620物料head，5 queued、97历史failed、27053 complete。上述均为发布前已有事实，不能写成新UI导致或当前采集成功。本轮不清暂停/失败、重置队列或伪造来源时间，不额外登录源站。UI部署后继续保留该保护；后台发布/备份绑定须与新版本一致，保留任务检查点和旧owner配置，不并行启动第二采集器。

部署前按原标准流程验证配对备份、保留原镜像与配置。只发布完整合并SHA的staging产物，正常登录/RBAC，不安装本机demo。源程序未改；恢复已有故障需独立证据核对，不能用发布自动解除。最终记录备份、版本、HTTP/浏览器、暂停及未完事项，不把首页200当全部验收。

## PR145必要CI与前向测试修订

2de3cd1250404e408d3213d37d299be97a35b432一次正常Git上传并经API独立精确核对，创建唯一PR145。team-access与baseline通过；source的数据库/认证/来源/数量及候选构建通过，旧continuous-ui测试失败：它仍要求自购和厂供同时渲染，并在默认“物料/需求”详情等待采购单价，导致后续自动读回断言连带失败。按用户已验收六视图修订真实点击路径，分别核实4自购组/1厂供组及全部7种角色的采购详情、自动代际读回和失败保留。没有改产品代码、数量、权限或降低断言。Windows本地全部14子项业务断言通过后，浏览器旧强杀清理产生文件锁；复用已有stopOwnedChromium与根级Browser.close、关闭失败仍清理fixture，保留活跃profile，不按进程名杀浏览器。物料显示专项10项通过。最终完整CI结果后续追加，不把Windows未退出0的命令标为通过。

部署前正式配对备份20261112T070832Z-6f815f2d于15:21:11北京完成BACKUP_VERIFIED，database.dump 2316043758字节，数据库与附件清单逐文件哈希通过，原服务恢复；保护23人工表/3用户/620订单。旧故障及5 queued/97历史failed/27053complete检查点保留。真实正常登录HTTP基线5合同通过，匿名401，本机demo未启用。没有源站登录或报表请求。

最终本地continuous-ui复验15/15、退出0（106391ms），包含14业务子项及父级清理；另material-display-ui 10/10退出0。其余未受影响的Linux全量检查交由必要CI，不反复运行Windows已证实的旧fixture清理失败。仅追加此测试兼容提交，产品blob与用户验收保持一致。

## 自动复审P2：状态筛选与现有状态显示不一致

GitHub正式自动复审2568e931给出P2（comment4547683847）：6087051投影刻意令readiness status=null，而新筛选仍按旧readiness选项比较，非all会空表。已核实projection.ts原第238行与filterProgressRows原第292行。修复仅将本页筛选复用表格已经显示的rowState（待采购、已有采购、已有入库、仅有需求、关联待核实、规格待核实），不推断齐套、不改源投影/数量或权限。搜索/类型仍复用原过滤器。保留厂供独立视图。新增6状态、未知readiness、组合搜索/类型、原数据不变单测，以及真实浏览器逐状态精确需求ID断言。局部9项单测通过；当前source CI尚未结束，因新修复必需已取消过时source，已通过的team-access/baseline不重复手工重跑。集中上传最终修订后保留必要新HEAD检查。

## 合并、运行及真实验收（16:51北京）

PR145已实际MERGED，合并提交c5133e9e9e7065dc4fe7672c0c88c75688e0c51f，双父6dc17c645215b3eb08e03624effdee2d182b3e1d/c1d2538fa4c3f3a4d9b9c4a494201d158308a734，tree7b5cb8f46a7d01bc8da5a2ab4a75aacc3ecceabe与已检head相同，8f5b5d89在祖先中。最终三项CI全部成功：source43179738319、team-access43179738090、baseline43179738189。P2状态筛选按原显示业务事实修复，局部9单测/11浏览器、类型/lint/build及精确guard通过。未批量重跑历史CI，过时source已取消。

最终main本机fetch遇传输超时，独立宁波标准Git以HTTP/1.1+protocol.version=1取得原始M；验证双父/tree后原始Git bundle反传并正常fetch到本机origin/main，未用文件API伪造commit。用户/全局Git/TLS/代理配置未改。

精确M在隔离新TASK原生Git source构建，原依赖锁一致、network=none，operator f3a64ea54f0d9b03ab2f4c1262469d65146bef7d4dd1317224b00ac47e4df050、app720b7d0d2669a5b3af1745573be76322505bf13aa6c73f9a7f7120eddfca0cfd。16:37已升级并更新正常监督/备份绑定，不启用源worker。数据库migration applied=[]，139表；原23人工表/3账号权限/620订单保全，620绑定及620读取head哈希全等，0缺快照；5正常身份真实HTTP前后rows全等、匿名401、DEMO=false。source5queued/97历史failed/27053complete及11/11心跳/目录暂停均未变。

公网Chrome真实页面5订单×6视图及12尺寸/密度组合通过；颜色首列13字段、名称检索/收展、业务状态筛选、列设置、密度刷新、右侧固定操作、采购/收发明细、到料窗口、来源栏位置及退出后正常登录保护通过。实际采购单位明细38261/38262=千克，115421/115423=个。D1992为30/8/20/13/9/9（自购/厂供/采购/入库/出运/出库）；PI2610-181为15/3/4/2/2/2，与部署前真实数据一致，未套用本机旧10项。PI2605-077的7客供单独保留，不计入15自购。

公网harness先后发现DOM未就绪、漏算客供独立区、到料独立请求未完成、把/cdn-cgi/rum统计POST误当业务写的断言问题；原失败日志保留，纠正等待及分类后复用core checkpoint，tail完整退出0，browser-result记录最终全场景通过。只有Cloudflare统计POST，无业务API写、无ERP来源刷新。不是把原非0命令描述为通过。

发布前备份20261112T070832Z-6f815f2d，51文件2326134575字节离机哈希全等（manifest SHA256 c0eae17ff0004e19d37758aa36ffa11c8d94caa359a3464bd7ec5cabc00f4254）。发布后新配对备份20261112T085113Z-54a2de65自16:51:13开始，仍运行，尚未声称完成；接力详AI_HANDOFF。实际620数据及原库/对象/卷/旧镜像/原分支保留，不部署生产。

## 最终收口（2026-11-12，北京时间）

上节备份运行中是16:51时点，现已完成：20261112T085113Z-54a2de65于17:04:28.174533完成BACKUP_VERIFIED，source精确c5133e9e9e7065dc4fe7672c0c88c75688e0c51f，originalServicesResumed=true，database.dump2316043900字节/SHA256 fdb04dfc5088e1835149f6b2e7807a6983171554589fe7d556971f98bcb07421。备份仍在宁波，已复制小回执，不冒称该新备份也已离机或重新异机恢复。发布前完整备份已离机验证。rollout preserve-pause成功；最终只读运行核对cron与已安装文件一致、build=M、620绑定/620head/0缺快照、27053complete/97历史failed/5queued及原心跳/暂停全等，0source worker运行。

备份恢复服务后，正常staging身份通过公网真实浏览器完成订单中心按PI2610-181搜索、实际staging UUID的正式详情、既有“查看物料跟进”入口和颜色首列13列表格。退出本次QA会话后，直接访问D1992转正常登录，returnTo保持原深链接，匿名API401；未启本机demo。无业务API写、无来源登录/报表。final-public-smoke-result记录PASS；其初始listSummary在加载过渡期抓到0/0不作订单总数证据，合同搜索及页面跳转等待真实结果后通过，620订单范围来自独立SQL/身份保全。最终截图staging-order-center-to-material.png已目视检查。

最终GitHub复核：main仍M，145 MERGED，三项CI均SUCCESS；全部open仍仅136 Draft/CONFLICTING，未改动/关闭/删除它。实际本轮合并1项、暂缓1项，无bot open PR。accepted8f已纳入，未交付产品增量0；本地chore/material-staging-delivery-record-20261112只新增事后交接文档，未另推纯文档触发CI。三产品UI文件、相应测试/启动说明依赖已全部进入M，既有后端/认证/调度依赖在M2中沿祖先保留。

直达地址（正常staging登录）：

- [订单中心](https://staging.weaveops.top/order-center)
- [6230-938／PI2610-181](https://staging.weaveops.top/order-center/style-progress/detail?orderId=c0677379-a45c-44bf-ae57-9cd0569de370)
- [D1992／PI2609-086](https://staging.weaveops.top/order-center/style-progress/detail?orderId=25285166-1585-449f-a8fd-81cbd7c98084)

回滚：旧M2镜像、runtime/trial.conf、原配对备份/附件/数据库卷均保留，正常trial流程可切回旧app；本次migration applied=[]，不需要盲目恢复旧库。先停止新owner并核对真实运行绑定，不并启旧新采集器。来源恢复仍须核实catalog_changed_or_over_limit差异，不能因为UI部署结束清保护。本轮页面上线与历史数据可用已完成，自动来源更新仍暂停，不能承诺30分钟可见。
