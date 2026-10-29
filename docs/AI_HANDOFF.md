# 接力：宁波公网已验收，三合同固定初始化已获批但尚未开始

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
