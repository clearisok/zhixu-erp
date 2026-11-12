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
