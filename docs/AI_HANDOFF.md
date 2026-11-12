# 当前接力：物料页staging交付进行中

2026-11-12用户已人工接受8f5b5d8989c6e54ac7c336d3d6f9b14cb29df9b3，明确授权全部open PR审计、安全合并、staging部署；不生产。当前feat/material-followup-dense，相对main6dc17c645215b3eb08e03624effdee2d182b3e1d，已fetch核对同SHA。open仅#136，draft说明明确不merge、当前冲突，保留不动；新物料PR未创建。完整task docs/tasks/active/material-staging-release-2026-11-12.md。

Git默认失效host-specific回环proxy；普通direct复位。HTTPS dns.google查询20.169.109.160后，仅进程GIT_CONFIG_COUNT=3覆盖http.https://github.com.proxy空/http.proxy空/http.curloptResolve github.com:443:20.169.109.160并清除proxy env，Gitread1831ms/fetch1918ms成功。保持TLS验证/原认证。沿原git-delivery工具只上传一次并独立API核验，不改全局配置、不使用文件API伪造提交。

线上ROOT /home/jackson/weaveops-staging-preview，project zhixu-quote-trial-staging-562fbf07、gateway3003、M2=6dc17c64 app+runtime catalog-sync-6dc17c64。已有发布helper在releases/directory-recovery-release-20261111。生产GitHub工作流仅手动；不要dispatch它。部署需用新独立release目录和精确合并SHA镜像，原库/卷/对象/备份/身份保留，本机demo不安装线上。

重要：发布前已有来源故障，控制paused_reason=catalog_changed_or_over_limit、heartbeat 11/11 15:52:35北京，supervisor STOPPED_FAULT worker_stopped_requires_review；620订单/head，5queued、97历史failed、27053complete。不得为新UI清暂停/重置队列/额外登录或伪造自动同步成功。标准备份supervisor会校验receipt.source==cfg.sourceSha，不能只换app而忘记备份绑定。原owner已停，发布时保留故障检查点，源恢复另需证据；当前明确告知用户。

本机63054 hiddenPID42352、产品5bef8388、617副本仍只读，原63051及原库不动，本机sourceworker=false。已通过本机8显示tests、24几何和真实6视图，上一阶段15业务/10UI通过；新交付全lint/npmtest和test:release-baseline正在运行，日志outputs/material-dense-local/delivery-*.log。没有CI/PR/合并/新部署完成；继续至合并、受保护备份/发布和真实staging验收，实际结果逐项记录。
