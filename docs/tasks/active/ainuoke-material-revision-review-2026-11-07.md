# D1992需求口径与认证离线复核

基线09c6e30abbc9f23c30b570b4deb6cef6b7c73abf，fix/ainuoke-order-material-closure，开始工作树干净。本轮不新增艾诺科登录或报表请求，不修改采集队列、账号、原始来源或staging。

## 已查证认证语义

- 最后成功：capture attempt 27fd654e-4c24-48df-8223-52da910ba105，北京23:20:33.871开始，23:20:39.517结束；login HTTP200/337ms/data_object/accepted/serverCode absent。
- 首次失败：6374a08e-69c6-49f1-a83f-aa422b24c6ed，23:20:40.986开始，23:20:41.669结束；HTTP200/314ms/data_object/rejected/serverCode unrecognized/serverHint unclassified。
- login_evidence.py将严格布尔data.isOk=false分类rejected；缺字段或非布尔为malformed。ainuoke_client.py:132-142对同字段判定，false映射兼容invalid_credential，成功还要求非空jwtToken和sessionId。本次有源站明确拒绝证据，没有“成功响应被误判”的证据，也没有具体拒绝原因的证据。
- text1存在但不是-2；安全回执没有保留原值、任意提示原文或完整登录响应。无法补造业务错误码和提示。unclassified不证明响应没有提示，只证明不匹配已知封闭集合。
- 实际collectWithPython每次spawn新Python；selected_source_once每次创建SDK并登录一次，本轮batchSize=1，确实每张合同重登录。JWT仅在该进程内存中复用于报表，Authorization、Token和kaijin_my_token由同一JWT构造；sessionId仅验证并加入秘密过滤，不用于后续请求。ProtectedTransport没有CookieJar，不保存Set-Cookie；没有logout调用，进程结束不证明源站会话退出。禁止重定向，isCoverLogin=false，network_retries=0；有限采集器禁止第二次续期登录。
- 145次真实登录：22:40十分钟桶1、22:50桶7、23:00桶65、23:10桶67、23:20桶5；本轮持久capture时间区间重叠0。不能据此排除其他机器进程，也不能推断频率限制是根因。

## 需求复核

- 原38个独立需求ID完整保存，旧projection.ts厂供continue跳过8条，旧依据D061/BUSINESS_RULES；30是排除厂供后的来源行数，不是已证明的当前有效需求。
- 用户补充厂供可能承载修订；又明确D1992四条主面料“不代替，也需要展示”。四组候选分别为黑580对523+42、绿973对844+30+70、爱心740对666+54、圆点797对686+58；不应用替代或相加。
- 涤纶线厂供11/14/18/15，对照同规格同成衣颜色自购102/130/170/140，采购107/146/190/145；计划68996与73738不同，没有用途/替代/生效版本字段，待业务确认。
- 完整逐行核对表在本机保护目录D:/WeaveOps-Previews/real-orders-20261106/d1992-demand-review-20261107.md：8组对照及38条原始需求清单、计划ID、数量和流水依据。不把真实原始数据提交Git。
- 代码沿用字段和布局显示全部来源需求与供料标签；来源值不冒充已确认有效需求，未确认缺口保持未知。既有交易不重绑、不重复创建或累计。

## 入口及队列

- ServerContractRefresh POST /api/v1/ainuoke/catalog/sync-order → 持久任务 → runSyncTick → 发布后回执 → 页面onComplete读回。实际只读预览包装器禁止业务POST，账号未提权。
- 既有Chromium隔离回归验证授权角色点击后产生任务、worker采集器调用数+1、发布并读回；使用合成采集注入。真实采集服务已执行成功，但“真实账号在页面点击→真实上游采集”本轮尚未验收，不用合成回归替代。
- 本轮READ ONLY事务复核：472queued逐单对应469pending+3history_pending，另1failed源6919。控制器disabled、paused_reason=invalid_credential，0running。检查证据offline-review-20261107.private.json；未重置。
- 144为本轮采集发布成功数，不表示全部订单需求修订口径已经核实。完整目标仍未完成。

## 本机验收

- 22b0fa57代码已在原63051环境运行；初次构建未带Server能力参数，浏览器显示正式页面未开放，已以原server/session/snapshot参数重新构建纠正，不修改数据。运行PID12856。
- 实际auth/me及material-progress均HTTP200，UUID/合同匹配，38条来源需求、8厂供、6组，factoryExcluded=0。独立采购20、入库6、出运5、出库5，与原流水一致；原始时间2026-11-06T14:47:46.956257Z，status=stale，未重新采集。
- 浏览器已见38条来源需求、厂供740/797/580/973及涤纶线11/14/18/15，原自购及追加保留。38是当前完整来源记录数，不是有效需求版本数；未知缺口仍未知。
- 新IT回归12/12、相关投影/adapter63/63、登录分类离线11/11通过；类型、受影响lint、前后端构建通过。未新增源站请求、未重跑CI、未部署staging。

- 最终运行代码eac795808e55e6df3303040fb078a62802783ce0，PID3756；保留原63051地址、数据库和只读账号。厂供搜索已实际返回8行；截图保存在保护目录d1992-factory-trace-20261107.png。
- 源码/证据门禁以继承基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea检查eac79580通过；未验证新的远端main，不宣称PR CI通过。该次未重跑未受影响全仓或182项发布工具自身测试。
- 当前仍缺涤纶线修订/用途确认与网页登录对照。没有新登录、没有恢复采集、没有修改472排队及1失败；原144采集发布成功保持，业务修订口径验收不以该数字替代。
