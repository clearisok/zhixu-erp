# 已验收物料版本的 staging 交付

2026-11-07。用户已验收本机业务和UI，明确授权相关分支推送、PR检查与合并、staging配置/兼容迁移/真实数据接入及后台服务切换；不涉及生产或页面重新设计。

## 起点与边界

- 干净分支 feat/material-followup-business-view，HEAD bcf87c617b3fc056d0663e255cfc13ba5f1f2c23；本机实际业务版本4bd2300ce72374289bdf299d6a828d61196d3288。
- GitHub API和独立Git读取核实main cb5cc29baa49ed7115fdb6c9506b6a80356936ea；是本分支祖先。PR140为已存在的目录/同步依赖交付入口，当前head b33888e4215ae70edebdf6ae079d86eb20d93b0c也是本分支祖先。其旧CI成功不代表新候选已经通过。
- deploy-production仅workflow_dispatch；其余必要CI仅PR/手动触发，无push或main合并自动生产部署。不会触发该生产工作流。
- staging实际2026-11-07T12:19Z读回5af85cd69d997ec190646732debbedd971fa89d7，正常session/server/snapshot。独立根/home/jackson/weaveops-staging-preview，项目zhixu-quote-trial-staging-562fbf07，网关3003。旧3000/3002、数据库、附件和全部旧资产保留。
- Git默认传输命中了专门的http.https://github.com.proxy旧设置；仅进程级清空该键后ls-remote与API精确一致。不修改共享Git/代理/TLS配置，不改变认证。

## 交付顺序与保护

补齐已验收能力在正式运行入口的兼容连接，复用原实现及精确证据；执行必要本地门禁，集中推送一次并安全更新现有PR140，检查三项必要CI及复审，通过后merge commit。随后按新main构建固定产物。

staging数据变更前先配对备份并在独立目标核验恢复。按合同匹配staging自身订单身份，通过正式服务接纳/关联/发布本机保存的完整真实来源，保留来源原时间及人工字段；不能整库替换或SQL补head。D1992单位确认只迁移已有20份明确事实，重新绑定staging订单与来源并校验证据。

切换前保存本机任务状态并禁用其对应采集，保留63051网页及数据；确认认证owner退出后才启用staging单实例后台。staging不挂载本机免登录入口，正常session/RBAC、深链登录返回继续有效。备份窗口与后台互斥、故障暂停及回退保持。

## 验收与恢复点

进行中：尚未推送/更新PR/合并，未修改staging数据或版本。20:27部署前配对备份20261107T122651Z-69f4d4ce已BACKUP_VERIFIED：121表、9对象、0业务写入/源请求，原服务恢复。备份异机复制和独立恢复待完成。

新增兼容：普通Server显式挂载私密单位证据；正式sync-run复用runAutomaticSync及来源变化校验；local runtime显式syncEnabled=false可保持网页但不在重启后重启采集。档案接纳调用既有正式领域服务，不重写时间/单位/身份或复制指针；历史处理不完成既有刷新任务。

4项配置/单owner跨单测试、历史发布2项和档案事务接纳1项通过；档案首轮因尝试queued→complete触发原约束而拒绝并全事务回滚，修正为同事务发布时不另建缺失发布任务，既有刷新任务保持。原默认建单仍排队，未放宽DB状态约束。类型第一次因审计action枚举失败，复用原action并以历史元数据区分后复验。全仓lint通过；npm test首轮受本次尚未冻结的新feature文档导致EVIDENCE_WORKTREE_DRIFT，不能记为通过，待冻结后完成正式发布回归。已通过且不受影响的本机27用例、617HTTP/逐源和浏览器结果保留，不无理由重采617。新候选、备份、发布、数据映射及手动/自然调度验收分开记录。
