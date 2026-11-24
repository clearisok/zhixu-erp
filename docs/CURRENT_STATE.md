# Issue165：38项组合已部署Staging，等待集中验收

2026-11-24 03:02Z；main基线10b9a7d827e1c09f152ead58c21f26712d49a619。六原PR166—171最新精确提交三项CI全部成功；组合PR172/codex/ui165-staging-acceptance/a0a9c78c6cccbadf5e635dbb60169f7f87944644三项CI成功且实际部署。十项设计争议未实施，PR不合并/Issue不关闭/Production不操作。

[完整38项清单、实际入口、六SHA/CI、限制及十争议](tasks/active/ui165-final-delivery-2026-11-24.md)；[独立备份恢复PR173证据](tasks/active/ui165-staging-backup-recovery-2026-11-24.md)；[组合输入与工程验证](https://github.com/clearisok/zhixu-erp/blob/a0a9c78c6cccbadf5e635dbb60169f7f87944644/docs/tasks/active/ui165-staging-acceptance-2026-11-24.md)；[切版中摘要原件](tasks/completed/2026-11-24-before-ui165-final-runtime/CURRENT_STATE.md)。前阶段文档索引和历史证据在同目录PROJECT_INDEX.md保留。

Staging https://staging.weaveops.top，build staging-material-a0a9c78c/app image a0339f6b…；Worker d6ddbaf6…。独立备份工具代码2ce1154e8d64370f513f566f9e15235f56dc7509（三CI成功）、精确executor SHA256856c5f3c…；后续运维提交仅证据文档，与部署代码版本区分。

新source正式配对20261124T023509Z-089bb129于02:58:50Z BACKUP_VERIFIED，145表/13对象/58文件逐项完整SHA，前后快照相等/完整归档解码/清理全通过；九恢复Gate全true，Supervisor RUNNING/heartbeat_verified，唯一Worker新PG心跳03:01:43Z。旧两次失败原字节保留，原保护未直接清除。切版DB/objects及四卷/schema/权限/23保护表/3用户/635当前订单身份hash不变，无migration/init/DB恢复。

当前电脑既有staging-lan入口TLS校验正常，quote-center HTML、build-info、健康接口200，完整SHA与源站相同。服务器自身Cloudflare公网探测403仍在，不把内网200宣称全公网可达。Codex桌面浏览器报network policy错误，实站业务DOM/截图成功读取0；隔离真实Chromium八套144项及25路由验证不冒称实站逐页验收。浏览器复验/用户集中验收待进行，状态不Done。

工程：组合相同产品blob typecheck/lint/build、root1028、release182、guard38路径通过；备份Linux32/精确Git11及同PG镜像真实合成恢复通过。扩展Quote三类失败已在未改main同参数复现；不跳过/弱化/改冻结基线。全快照约507秒距600秒上限余量有限，数据增长风险保留。
