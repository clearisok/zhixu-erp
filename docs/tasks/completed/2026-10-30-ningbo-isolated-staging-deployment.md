# 宁波独立 staging 部署与公网验收

2026-10-30（北京时间）；产品源 main **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**，本地文档父提交7c40b89。用户明确批准新独立目录/数据库/存储/管理员、127.0.0.1:3003及仅 staging.weaveops.top 路由切换。没有新产品代码、SQL、依赖安装、PR合并或CI运行。

## 实际部署

- SSH既有weaveops别名及严格主机校验；写入前再次确认新目录、项目、卷/网络不存在，3003空闲。新目录 `/home/jackson/weaveops-staging-preview`，project `zhixu-quote-trial-staging-562fbf07`，独立四卷。新配置/私密文件owner-only，旧账号和数据库未复制。
- 3331个Git跟踪文件离线还原，精确main、干净源码；应用镜像 **sha256:d0685f84853c73f89ba9843bff40bfdab148c30dcfcfddd19a79425d9b6226cb** 从离线包导入。既有宁波PG **16.15 / sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea** 未替换或改标签；新库实际server_version_num=160015、51份迁移、121表。
- 固定MinIO镜像6dabb4离线包第一次未保留名称/摘要关联，原检查拒绝，未初始化DB。改用同一本机精确镜像的原标签导出，重新导入后原固定摘要可解析；没有换镜像、降级TLS或放宽原发布检查。旧包/失败回执保留。
- 操作包装脚本有一次Python缩进错误，编译前未执行命令；增加本地AST检查并核实项目服务为空后继续。早期路径诊断中的占位false不是真实文件存在性证据；原件保留，后继使用existsSync逐项确认全部存在。产品文件未修改。

## 新目标验收

新管理员staging.admin，publicId **2f43e2c4-4fc5-4224-8214-ccfec22584d7**。通过正式API创建唯一合成报价 **4eac86cd-bb2f-476b-b8e7-b915e16084fb**，业务款号STAGING-ACCEPTANCE-562，名称明确标注合成。附件 **8c298a8a-1aea-4723-af0f-aef9b291ee57**，字节SHA256 **bf3136761ef7d071d9505b8f774dc887ebce09be35b44fd8f18f08b401af7174**。未创建SO、Source profile、实际生产或关账。

登录、未登录401、错误Origin/请求标记403、保存/附件上传与下载、Secure/HttpOnly/SameSite=Strict、注销后原会话401均通过。私网模拟公网Host时首轮因未显式使用localhost SNI发生HTTPS失败；按批准的originServerName修正验证客户端，保留CA及主机名校验，失败前无业务创建。重启后报价快照SHA **b70f2bfbd2518bc05d3e0d9938969d36586e46283f962f88077fc0df1a6d6bf3** 和附件字节不变。

维护停写后记录121表及序列，冻结摘要 **9ebc5c304d09c3c51efab4ee22a64bd1f927139234a4d26b39ab3ee5a9a3ae98**。复用原Backup/Restore和exact-target guard，仅通过进程级Docker-over-SSH操作此新库，未改共享Docker/Git配置。数据库dump **690632字节 / 7907ec039e8f11f40ef74488afe4b2a09b77d499a83c3d45c0b6839d5a489d33**；对象导出1条，完整性通过。

独立恢复project `zhixu-quote-trial-staging-562fbf07-recovery`，新空库/独立卷，fingerprint **1e739cb09f88c669605581a31d600bb154a329c45da0ee47519a2af541244ace**。原guard验证EMPTY_NO_CLIENTS后实际恢复，启动前121表及序列逐项精确相等；对象使用只读备份挂载恢复，通过同一HTTPS报价、附件、密码及会话读回。恢复副本五服务全部停止、卷和目录保留；原新体验目标重新就绪。本片没有重跑本机182发布测试或旧9项恢复套件，不以本片结果改写之前7通过/2取消。

## 公网切换与保护

用户自行登录Cloudflare管理账户后，读取并保留唯一旧路由：隧道zhixu-staging/711f0eef-da0f-44d4-a1ea-3fd03daedf3a、staging.weaveops.top、http://localhost:3002、原HTTP/TLS/Connection/Access均默认。只修改service为 **https://localhost:3003**、originServerName=localhost、caPool=`/home/jackson/weaveops-staging-preview/runtime/tls/cert.pem`、httpHostHeader=staging.weaveops.top，**noTLSVerify=false**。管理页显示Route updated successfully及新服务；未读取/轮换隧道Token，未重启cloudflared或改其他路由/Access策略。

宁波主机出站公网回读先发生HTTPS失败，IPv4/DNS诊断又超时，保留为未解决的该主机出站限制，不能称该视角通过。Windows外部正式API客户端使用direct/default、保留证书校验，先核实公网build-info精确562再读取新管理员密码完成登录：报价及附件hash一致、错误Origin403、匿名401、注销后401全部通过，回执 **2026-10-29T16:01:11.765Z**。没有改系统代理、认证或TLS。实际外部浏览器登录页正常，无安全警告绕过；未冒称登录后全部页面或用户人工业务验收完成。

最终只读核对原5容器ID/镜像/状态/启动时间不变、原3卷/6网络保留，3000/3002仍监听，cloudflared active。没有旧数据库查询或清理。新库此时1用户/1合成报价/0 SO/0 Source profile。登录信息仅在新本机私密目录staging-login.txt，不入Git/日志或本文件。

## 接续范围

安全回执在ignored `outputs/ningbo-approved-deployment/`，包括human-approval、文件传输hash、初始化、合成/API/重启、备份/恢复、原/新Cloudflare路由、外部公网接受和旧资产保护。私密备份/输入在 `D:/zhixu-server-convergence/ningbo-target-562fbf07-f3f9f290`；宁波新私密目录及恢复副本保留。上述是空系统/合成数据部署验收，不是艾诺科真实闭环完成。

用户随后另行明确批准这套新库的固定初始化：原两合同PI2608-257/PI2609-039的颜色尺码、三轮物料（至少五分钟间隔）、6086941一次双遍；之后接纳PI2606-008，只采6086979两遍完整首页。总上限7登录/410报表/417HTTP/45分钟，失败停止、不重试/持续调度，不采C1物料或财务，不填造生产/商业/关账。下一阶段先准备同main操作者、新库/账号指纹、合成报价保护和原证明时点；**本部署阶段Source请求仍为0，窗口尚未开始**。完整Goal Gate0–8/R及人工业务接受仍未完成。
