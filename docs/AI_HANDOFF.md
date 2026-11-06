# 页面切换优化接力

2026-11-05；fix/staging-navigation-latency；输入main cb5cc29baa49ed7115fdb6c9506b6a80356936ea，交付前GitHub API再次核实未变。原艾诺科工作树和PR140不混入。

四片独立功能提交49e832b4、de70d3a4、ace78021、8abca4db：会话隔离120秒基础资料缓存；保护通过后的RSC/列表并发；有限缩略图重试及重新鉴权的ETag；HTTPS环境元数据与staging noindex。02432150保存测量/测试和30秒悬挂读取上界；b58b3da4前向绑定新决定，旧冻结证据原样保留。

本地验证：lint、类型、Server编译、生产构建通过；21项客户端/图片、11项新逻辑、8项一次性PG缩略图检查通过。全仓首次977项中957通过、20项发布基线文档不一致；对齐后仅重跑受影响的发布套件，182/182通过。精确守卫基线cb5；最终文档提交后再核对head。第一次构建参数错误和原测试失败日志均保留，未降低规则。

测量：同构GET-only合成fixture每API/RSC增加300ms；订单654→324ms、辅料656→315ms、报价列表643→315ms，响应到达非绘制时间，非公网SLA。测试标签/进程已关闭，无业务数据写入。旧合成附件503底层原因仍未知；当前控制台未复现历史错误。

远端送达与CI以outputs/navigation-latency交付回执和唯一PR为准；本地验收不冒充远端成功。仅一次集中上传，不自动合并/部署，不改服务器、Docker、隧道或Cloudflare配置。部署时用户需提供NEXT_PUBLIC_SITE_URL与NEXT_PUBLIC_SITE_ENV；本轮未修改这些部署值。

[详细报告](tasks/active/staging-navigation-latency-2026-11-05.md)；[旧接力逐字归档](tasks/completed/2026-11-05-before-navigation-latency/AI_HANDOFF.md)。

2026-11-06 用户明确授权恢复上传并部署staging。旧Git有效代理17989无监听，进程级精确URL直连只读核验通过，cadc4443已精确送达并创建唯一草稿PR141（创建EOF后查询证实已存在，未重复创建）。main仍cb5。部署准备发现Dockerfile未声明新增公开metadata构建变量；仅补builder的ARG/ENV，不改daemon/Compose/网络。staging只读确认f21c96c1、五服务healthy、备份BACKUP_VERIFIED、同步PAUSED；升级必须保留暂停。新镜像与配对恢复验收待完成，不合并main。

2026-11-06 交付续记：033dcfd4已精确送达PR141；两项CI通过，来源CI两次均在garment-shipments手机触控用例等待历史记录超时。本机从同一候选镜像提取静态资源，14项出货及32项后续交期/付款/关账检查通过；未据此宣称Linux CI通过。触控测试新增两帧稳定几何和elementFromPoint命中检查，仍只发送一次真实触控，业务断言及16秒上限不变；本机14/14通过，Linux复验待交付。

宁波033镜像完整传输/加载，121表4附件配对备份、独立新库恢复和候选启动/HTTPS元数据/noindex/未登录401检查通过。尚未切换，仍运行f21c96c1；同步原PAUSED不变。操作证据在outputs/navigation-latency/deployment-20261106，最新备份20261106T011957Z-e623fa1b；Git上传异常退出但远端精确一致，未重复推送033。最终上线须以必要CI通过为前提，不合并main、不新增真实艾诺科读取。
