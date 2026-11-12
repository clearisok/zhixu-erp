# 最终交付复审P2修订

PR145已就绪，head2568e931的team-access/baseline通过；source仍在运行时，GitHub自动审查发现本页状态筛选沿用readiness导致空表P2，已取消过时source以节省CI。只修筛选为表格已显示的真实业务状态，不改投影/业务数量/权限。9单测通过，待候选构建、11项显示浏览器复验及最终必要CI后合并。详见发布记录。staging仍M2=6dc17c645215b3eb08e03624effdee2d182b3e1d，620订单/来源暂停/5queued保留。配对备份51文件2326134575字节离机哈希全等。

# PR145必要CI修订与staging恢复点

2026-11-12 PR145 head2de3cd12已精确送达；team-access/baseline成功，source在旧continuous-ui交互断言失败，正在只修测试兼容，产品保持用户验收版本。来源业务/认证/数量和候选构建已通过。详见 [发布记录](tasks/active/material-staging-release-2026-11-12.md)。不得合并红CI或部署未通过版本。原open136仍draft明确不merge且冲突，保留。

部署前备份BACKUP_VERIFIED 20261112T070832Z-6f815f2d（15:21:11北京），旧M2服务已恢复。新release /home/jackson/weaveops-staging-preview/releases/material-dense-release-20261112，helpers已准备；尚未新部署。before HTTP与23人工表/620原订单基线保留；source pause catalog_changed_or_over_limit及5 queued完整保留，不清故障、不额外登录。旧supervisor已安全DISABLED便于正式配对备份，SQL暂停仍在；新部署后按新SHA更新备份绑定并保留暂停，不activate源worker。

# 当前接力：物料页staging交付进行中

2026-11-12用户已人工接受8f5b5d8989c6e54ac7c336d3d6f9b14cb29df9b3，明确授权全部open PR审计、安全合并、staging部署；不生产。当前feat/material-followup-dense，相对main6dc17c645215b3eb08e03624effdee2d182b3e1d，已fetch核对同SHA。open仅#136，draft说明明确不merge、当前冲突，保留不动；新物料PR未创建。完整task docs/tasks/active/material-staging-release-2026-11-12.md。

Git默认失效host-specific回环proxy；普通direct复位。HTTPS dns.google查询20.169.109.160后，仅进程GIT_CONFIG_COUNT=3覆盖http.https://github.com.proxy空/http.proxy空/http.curloptResolve github.com:443:20.169.109.160并清除proxy env，Gitread1831ms/fetch1918ms成功。保持TLS验证/原认证。沿原git-delivery工具只上传一次并独立API核验，不改全局配置、不使用文件API伪造提交。

线上ROOT /home/jackson/weaveops-staging-preview，project zhixu-quote-trial-staging-562fbf07、gateway3003、M2=6dc17c64 app+runtime catalog-sync-6dc17c64。已有发布helper在releases/directory-recovery-release-20261111。生产GitHub工作流仅手动；不要dispatch它。部署需用新独立release目录和精确合并SHA镜像，原库/卷/对象/备份/身份保留，本机demo不安装线上。

重要：发布前已有来源故障，控制paused_reason=catalog_changed_or_over_limit、heartbeat 11/11 15:52:35北京，supervisor STOPPED_FAULT worker_stopped_requires_review；620订单/head，5queued、97历史failed、27053complete。不得为新UI清暂停/重置队列/额外登录或伪造自动同步成功。标准备份supervisor会校验receipt.source==cfg.sourceSha，不能只换app而忘记备份绑定。原owner已停，发布时保留故障检查点，源恢复另需证据；当前明确告知用户。

本机63054 hiddenPID42352、产品5bef8388、617副本仍只读，原63051及原库不动，本机sourceworker=false。已通过本机8显示tests、24几何和真实6视图，上一阶段15业务/10UI通过；新交付全lint/npmtest和test:release-baseline正在运行，日志outputs/material-dense-local/delivery-*.log。没有CI/PR/合并/新部署完成；继续至合并、受保护备份/发布和真实staging验收，实际结果逐项记录。
