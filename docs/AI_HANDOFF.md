# 接力：Gate4新合同未采物料空态修复候选

2026-10-30；分支fix/bound-order-material-empty-state，开始944e72bd，main562fbf07已通过GitHub API再次核实且0开放PR。见[范围/测试](tasks/completed/2026-10-30-bound-order-material-empty-state.md)。只有reader和selected-binding集成测试的产品增量：启用可信绑定且尚未首采或完整Discovery仍含合同、无本run物料时200/not_connected；现有材料/归属/权限/TTL不改，无生产/真实Source写入。红测两场景复现404，最终7/7；相关79通过/1Windows既有Linux子检查跳过、类型/变更文件lint/Server编译通过。首次基线运行因文档后续更新被明确取消，不算通过；feature文档须在源码checkpoint后追加manifest supersedes，再最终基线验证，不覆盖旧record。最终独立静态复审无P1/P2。后续仅集中一次安全交付/唯一草稿PR/必要CI，不自动合并或部署；宁波运行版本仍562。

# 已完成接力：宁波三合同固定初始化完成，待人工体验

2026-10-30北京时间；产品main562fbf07、app d0685f、operator100e92，https://staging.weaveops.top。先读[最新实证](tasks/completed/2026-10-30-ningbo-fixed-source-initialization.md)和[部署/恢复](tasks/completed/2026-10-30-ningbo-isolated-staging-deployment.md)。

- 用户批准的固定初始化已全部执行，不能重复询问或再采：前两单各3轮物料、6086941各一份；第三单PI2606-008只采6086979。约10分32秒，0重试。run容器zhixu-ningbo-source-7247e4beea-run exit0，无活跃采集进程/持续调度。新额度需具体授权。
- SO-1 PI2608-257 UUID8ae5851b-ed07-4f6c-acbf-d18fbcb4daad，13500/1色、9物料/18货款；SO-2 PI2609-039 UUID3bde5f34-17c0-45c5-916e-0cd738f8455e，6000/1色、31物料/15货款；SO-3 PI2606-008 UUIDa79f7730-a27b-4d49-9904-e18f62d83e6b，9250/6色、16成衣行全部颜色匹配。当前SO均保留原Source身份，8色尺码证据可读。第三单物料API404/历史0是未采范围，不能误称订单不存在或物料零数量。
- 有效宁波配置 **/home/jackson/weaveops-staging-preview/runtime/trial.source.conf**；只比原trial.conf增加两个reader标志，原件保留。不要再用原config start撤销reader。private报告卷zhixu-ningbo-source-7247e4beea-reports保留，原证明时点不变；现所有prepare/run/backup动作已完成，不重跑。公共回执outputs/ningbo-approved-deployment/source-window，manifest固定runner68b8cec.../approval04ddc5...。
- 公网正式HTTPS/API三单/交期/生产/月分配及来源当前/历史读回通过，quote_*及附件保持；121表保护核对通过、旧5容器/3卷/6网络原样。没有新生产/商业/财务命令；新备份hash3993468f.../947996字节，私密source-initialization-backup-tools/backups下，未重新恢复该dump。原空系统独立恢复事实保持，不冒称新真实Source恢复通过。
- 本次无产品/SQL修改、无CI/push/合并，文档按本地独立checkpoint保存。新包装语法、实际固定窗口、公网读回、保护核对、新备份及精确main源码守卫通过（12页/68能力/0UI变化）；未重跑旧全套。时效10分钟不延长；过期用已有历史，不登录/重读。没有登录后全页面人工接受，完整Goal Gate0–8/R未完成。登录私密文件D:/zhixu-server-convergence/ningbo-target-562fbf07-f3f9f290/staging-login.txt可给用户文件链接，不输出密码。

# 历史接力：宁波公网已验收，三合同固定初始化已获批但尚未开始

2026-10-30北京时间。产品main562fbf07、app d0685f；https://staging.weaveops.top 已按明确批准切到新项目127.0.0.1:3003。先读[部署/恢复/公网原件摘要](tasks/completed/2026-10-30-ningbo-isolated-staging-deployment.md)。下方为本机阶段历史接力，保留日期和范围。

- 新目标 /home/jackson/weaveops-staging-preview、project zhixu-quote-trial-staging-562fbf07、DB fingerprint88b5ba705e1fbbb6a1b07755754249c4a37577473214c9a5b2874e61b5eac1ae；staging.admin publicId2f43e2c4-4fc5-4224-8214-ccfec22584d7。源码3331 blobs干净，51迁移/121表，PG16.15精确721873镜像；1合成Quote4eac86cd...及1附件，没有SO/profile。旧5容器/3卷/6网络及3000/3002保留。
- 原Backup/Restore guard在新目标备份、独立新库实际恢复；121表/序列摘要9ebc5c...完全一致，报价及附件、原新管理员密码读回通过。恢复project后缀-recovery全部停止、卷保留；主体验服务就绪。不要重跑prepare/init/restore或重复CI。当前无活跃部署/恢复子进程。
- Cloudflare仅改这一个hostname到https://localhost:3003，localhost SNI、私密cert.pem CA、Host staging.weaveops.top；TLS验证开启，旧路由保存在outputs/ningbo-approved-deployment/original-cloudflare-route.json。未读/轮换Token或改Access。外部公网API main/登录/报价/附件/Origin/注销通过；宁波主机出站公网回读仍失败，不再重复该通道。
- **新的固定Source范围已有人类明确批准，不重复询问**：前两合同PI2608-257/PI2609-039首绑/颜色尺码、三轮物料且至少5分钟间隔、6086941一次双遍；然后添加PI2606-008，仅6086979两遍首页。≤7登录/410报表/417HTTP/45分钟，0重试，失败停止，无持续调度/C1物料财务/生产商业关账造数。新库保留精确合成Quote/附件，旧筛选证明只私密核验原时点。当前还在准备，Source0。
- 具体新范围outputs/ningbo-approved-deployment/source-initialization-review.json；所有当前部署回执同目录。窗口必须等待同main100e92 operator离线传入及身份/原证明/新包装离线验收完成后才开始。selected-source-once一次只能2合同，captureSource处理全部已绑定SO，所以物料三轮务必在加入C1前完成。旧本机helper硬编码local.admin/旧UUID/5c8，不得直接运行；首次空库包装还会误拒已有合成Quote，须精确保护后适配，不清空数据。
- 新私密输入和配对备份只在D:/zhixu-server-convergence/ningbo-target-562fbf07-f3f9f290；staging-login.txt是给用户的新体验登录信息，不把密码/DSN/原报表写入Git或聊天。正式main镜像不含本地文档checkpoint；完整Goal仍未完成。

2026-10-29；产品main **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**，本机app d0685f/tool100e92，https://localhost:54315。当前本地文档分支codex/main-562-real-garment-acceptance不改变该产品SHA。先读[本片](tasks/completed/2026-10-29-main562-real-garment-acceptance.md)。

- 完整Goal Gate0–8/R不缩减。#134与新一次C1采集均已有人类明确批准并完成，不能重复询问或重复执行。实际请求69488dec-ddc9-4d45-96f6-08d8f6c66272、发布acb344b3-120b-4e5d-a923-ab70db72305d、generation1、16行/6色，1登录2报表3HTTP。原失败d6d2...保留，固定额度已用完，任何新Source需具体范围。
- 不重跑 outputs 中 prepare/run/merge/build/backup helpers；所有当前会话已完成。源码/工件/回执保留，node_modules是既有依赖链接。7bf3不恢复/覆盖，当前有效工作树staging-controlled-runtime。凭据仅私密进程消费。
- 当前有效配置以outputs/pr134-main-local-read-experience.json为准，追加本机只读garment snapshot；不是原final-main-local-experience或pr134初次镜像更新配置。C1过期后用历史，不能续TTL或把合同数量当出货。旧两单Source历史不等于持续运行，C1没有物料/货款采集。
- 新恢复Node原结果7pass/2cancelled（600s父级），不能称9/9；outputs/pr134-main-retained-recovery.json补齐原现场恢复，不重seed/重复restore。实际121表/序列/两冻结保护/附件/17接口通过。原合成资源已停止保留，真实体验三单未被该演练触碰。
- 宁波目前只有只读预检，无写入；旧3000/3002和staging7cd保留。新project/path/3003/空库方案、TLS输入和同版离线包已准备。需明确部署/路由切换批准；切换保持源站证书验证，不能关闭TLS或读取旧Tunnel凭据。若管理入口不可用保护旧路由，不能假报公网就绪。新宁波Source范围另批，本机许可不跨目标。
- 不因本片文档变化重跑旧CI或上传。产品head35e三项PR CI已通过并合并；后续仅按实际新变化必要验证。真实商业/生产/关账及人工体验不被合成证据替代。
