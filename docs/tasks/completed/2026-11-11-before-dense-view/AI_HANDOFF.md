# PR144 staging交付完成；后台独立运行

2026-11-11 14:26北京。用户已批准合并和staging部署，实际已完成。PR https://github.com/clearisok/zhixu-erp/pull/144，main/实际staging=6dc17c645215b3eb08e03624effdee2d182b3e1d；双父dbc61af9/2ce369dd、tree bffff5de34343787beed0ba5a1ccb15b768fa56f与批准head相同。三项必要CI exact2ce首次全绿，无新CI/生产发布。发布工作树ainuoke-directory-release/zhixu-ainuoke-api branch chore/staging-pr144-release在M2干净；本树fix/ainuoke-directory-recovery-sort仅保存后续交接，未push触发重复CI。

宁波SSH weaveops；ROOT=/home/jackson/weaveops-staging-preview；TASK=ROOT/releases/directory-recovery-release-20261111；SOURCE=TASK/source；runtime=ROOT/runtime/catalog-sync-6dc17c64；project zhixu-quote-trial-staging-562fbf07，HTTPS gateway localhost3003，公网staging.weaveops.top。app sha256:23943a047ebb233f3d0764143f7dc5bd276884f1e3e7fdbfe1b4aa37c95a9794；operator sha256:dbd9b9ef4ad8c2614501f8fc374253279e6e6b14e4a30acb65822283fbd8869e；buildId staging-material-6dc17c64。构建networknone，正常session/RBAC/snapshot，不开local-demo。build-info environment=production仅优化构建模式，不是部署生产。

rollout.py prepare/stop-old/backup-old/upgrade/install/backup-new/activate全部成功。14:05:27 activate，14:06:01正常分钟cron启动唯一owner weaveops-catalog-sync-6dc17c64，Node1/Python session1。目录14:06:07正常全620，下一14:36:07。维护到期257张14:22:20全部完成并切正式head，最末只读14:26:43队列/unknown/重复/head错误均0，控enabled/pausednull/心跳正常，旧owner cfg.enabled=false，本机及旧3合同源PAUSED。所有会话/采集/复制长终端均结束，只有正常后台服务持续运行。

后台本轮58captures（目录1，成功细项56，失败capture1），1login/2994reports/0authrenewal/0内部网络retry；257root最终complete，publicationRunId逐单等于head。6086408第2页14:17一次45052ms无HTTP返回，影响5张，source_unavailable；原队列1分钟有限退避、第2次均完成，未停全源或手动重采，原失败回执不删除。normal-worker-final-observation.private.json及natural-scheduler-acceptance.private.json包含各单/metrics。独立部署前目录核验另1login26reports，不能混作后台本轮；固定额度已耗尽不再重复核验。

真实HTTP：620跨7页合同日期DESC（null last/同日稳定/无重复遗漏）、620物料可读、匿名401、Logo及buildinfo200。初审619stale和1 source_failed（PI2607-205）原误列失败回执保留，补充历史读回证明旧成功继续可用。此单正常任务237d8f41...发布run f3f4b748...，来源14:07:48.431，14:09:05 HTTP ready/11自购，head错误清除；原history及newrecovered文件分开。D1992 stageUUID25285166-1585-449f-a8fd-81cbd7c98084，14:21:07 HTTP读取来源14:16:51.502790、30自购8厂供、20采购13入库9出库9出运、run8d9bbc76-9a7f-44a7-988c-e1469c3e21ff，匿名401。该来源时点与升级前7/7不同，不写死旧数；D1992-post-automatic-*文件保留实际响应。全量HTTP未因257新发布而重复跑，正式head逐单一致及代表HTTP覆盖新路径。

备份：PRE20261111T053121Z-03efea1a，13:43:13通过，旧M source，139表9对象、dump2234832246、50清单文件，manifest6f0faec4d6c8f27d45137cb650ced419b81032adbe607a6711bf71b2ee313bf4。POST20261111T055257Z-5033df3e，14:05:00通过，M2 source，139表9对象、dump2234832422、49文件，manifest921eba6cc140d2f6b69cea7569a9e00632c42d8c0651b53b6118c34e07d5aa3d。两包均完整scp至D:/WeaveOps-Local/directory-recovery-staging-20261111（private ACL），逐文件size/SHA通过，pre/post-offhost-verification.json。服务器原包在/home/jackson/weaveops-trial-backups/bundles。新包未独立restore，不能冒称；M相同139表/9对象此前恢复通过、M2无schema变化。

首包20261111T051853Z-e9fdfaf1因pg_dump180秒失败、原服务恢复；DB4.26GB，失败包和旧helper保留。仅新runtime私密paired-backup.py按实测dump600秒（整体1800/原snapshot对象指纹恢复/无内部重试不变），SHA2a4d0f89fcfcd08d75986906d887eeac4ead2c103afb79558e053c6bd13d0803，旧SHA c421eb59...原样保留。backup policy已绑定M2新容器/配置/helper，正常每日03:30北京配对备份。23人工表、3用户及角色、620原订单身份保护after完全相等。

回退仅在实际异常：停唯一新owner、保存任务位置，旧SOURCE=ROOT/releases/order-discovery-20261109/source，旧RUNTIME=ROOT/runtime/catalog-sync-dbc61af9、旧M镜像/卷/私密配置保留。沿原trial.mjs受控切旧app配置，再核对policy当前容器和备份绑定后恢复唯一旧owner；无schema变化，不恢复旧库覆盖新增业务。勿同时启动本机或旧3合同采集；勿手动SQL改head/暂停或重置队列。TASK内原故障/恢复preview/hash/运行/备份回执保持私密，不提交raw、凭据、备份。

浏览器限制仍明确：Chrome3/currentStagingBrowser用户staging993649984、源ERP页不动；新pr144AcceptanceTab993650001.goto即时工具内部timeoutMs错误，无DOM/截图。已问用户正常浏览器默认合同日期/降序及详情对照，未答复；不能用CI Chromium或HTTP冒称本次人工浏览器PASS。无需因此重复登录、改鉴权或重新部署。链接：/order-center；D1992 /order-center/style-progress/detail?orderId=25285166-1585-449f-a8fd-81cbd7c98084；最新PI2611-091 orderId=03d73e50-9c44-4805-9ae2-9bc8c620310d。

源码/远端/部署阶段完成，后续只在用户新问题或后台实际故障时检查，不空转重复测试/CI/登录。完整历史在任务及tasks/completed/2026-11-11-before-pr144-final-acceptance，原日期/失败/限制保留。
