# 接力：staging交付完成，后台日常运行

2026-11-08；本轮交付目标已完成，正常后台继续，不另起开发或重采全量。先读CURRENT_STATE和tasks/active/material-staging-delivery-2026-11-07.md最新完成节。PR140实际merge main390569c4cfa56cd56261674c3f2110bd306d3ff7；最终PRhead f2b7e8cda69845f9701b5a036cec6381df7e7d79三CI全绿。Windows分支feat/material-followup-business-view的后续提交仅交接文档，不是另一个部署代码版本。

实际staging：SSH weaveops，root /home/jackson/weaveops-staging-preview；project zhixu-quote-trial-staging-562fbf07，loopback gateway3003。TASK=root/releases/material-delivery-20261107；SOURCE=TASK/source HEAD390；runtime=root/runtime/catalog-sync-390569c4。app sha256:6a7445737a00968037f72cc1e7d244b8309509e144fd1b4d2f8abd51dde940cd，operator sha256:941e9cbbaa60e02c6fa0865f7630989f6aadaac9ab370aa9f18bc6df70d743e7，数据库137表。只读配置及凭据文件在受保护runtime，禁止打印配置、密码、Cookie、JWT。

617正式接纳/发布和真实HTTP全部通过、4完整空。原23业务表/2账号权限/3订单身份保留。D1992实际stage UUID25285166-1585-449f-a8fd-81cbd7c98084（不可用本机d2e...）；30自购8厂供20采购8入库5出运5出库，20单位事实/18已知采购差额，2规格和未采购/厂供单位仍真实待核实。最新自动来源02:39:59/run b712ef72-6bce-477a-bae3-5ed012325d77，源快照、head、真实公网HTTP及已开页面自动读回一致。正常Jackson身份真实手动POST202→0新源登录/32报表→发布→页面也已通过；只读403、0任务，匿名401/no demo/noindex保持。

当前采集仅在宁波容器weaveops-catalog-sync-390569c4。18:07:01.612638Z自然每分钟cron启动，一node一Python认证owner、root只读/1CPU/1GiB/私密配置只读，精确固定镜像/来源/目标指纹和原内部+egress网络。源站只读、不强制覆盖登录。R分档257高频30分/120每日02:00/196周一03:00/44月初04:00，目录30分，动态重新评估。首批377在23分32.891秒完成，1登录4737报表；240未到期不重采。02:53:33两轮高频257池全部完成，分别14分28.868秒/14分56.462秒（首轮D1992自动入队后手动优先）；加120每日共634成功任务，覆盖377个不同订单。仍1登录/7688报表，queued/running/失败/unknown/重复均0；第二轮排队中位27.965秒/最大73.883秒。不能把634任务当634个订单，也不把读时stale当失败。

本机D:/WeaveOps-Local web63051/原watchdog/数据库及617来源保留；17:30:52.671Z正式staging_handoff暂停，service.syncEnabled=false、原6queued保留，后续再核实owner0/web200。禁止为看本机页面开启第二采集器。旧宁波3合同status仍PAUSED、cron已退役且保留原回执。页面每30秒只读取织序已发布快照；聚焦也会读取，开页面不请求艾诺科。

新配对备份20261107T180148Z-82d84c57在/home/jackson/weaveops-trial-backups/bundles，137表/9对象，49文件73,512,634字节离机全等（D:/WeaveOps-Local/staging-delivery-20261107/post-upgrade-backup）；manifest SHA6be9573916bfaefe34ad734c1ac2ce898b07413699a68ef67a9fa1539e2525d4。独立recovery-final-390569c4/project zhixu-quote-trial-recovery-390569c4cf（43004）恢复表+序列全等/9对象/登录报价及D HTTP200，服务全部停止保留。首个失败包175754缺对象工具挂载，已补回原工具和/bundle挂载后重验，不当成功包；旧完整121表备份170409及旧工具不改。

正式cron及私密supervisor.json已固定，每日03:12–03:50北京备份安静窗口，03:30持监管锁运行runtime/paired-backup.py；当天配对验证且服务恢复后才自动恢复源worker。新逐行row-sha256-multiset-v2摘要涵盖137表+序列，恢复材料含工具和配置pin。配置/镜像变化需审核后更新备份pin，不放宽校验。意外退出/认证/证书/身份/未知结果sticky STOPPED_FAULT；核实原因→原CLI sync-recovery-preview→同hash/原因sync-recover→必要CAS configure→监管器带reason activate。不能改SQL任务或head、重置队列、盲重登。启动/停止及旧镜像新schema回退的已演练迁移目录只读挂载见任务“后台运行、维护与回滚”，不直接旧库覆盖新业务。

关键TASK回执：delivery-acceptance-summary.json、http-audit.private.json（实时后617）、http-audit-before-live.private.json（旧时点保留）、D1992-automatic-public-reconciliation.private.json、manual-source-publication-proof.json、manual-dedup-proof.json、two-full-high-cycles-proof.json、second-natural-cycle-proof.json、initial-due-pool-proof.json、runtime-isolation-proof.json、readonly-result.json、protected-business-result.json、metadata-proof.json、staging-status.json。D:/受保护交付目录有离机回执、实际before/after与最终公网截图。原始导出/备份/凭据不纳Git。

公网CF520和一次settings连接关闭有真实记录；源站正常、恢复后公网页面与多场景已通过，未擅改Cloudflare/TLS或宣称网络根因永久修复。全量来源不是同一分钟新鲜，30分钟不是硬SLA；当前数据可持续查看，失败保留成功数据。用户已批准仅staging，本轮生产和旧3000/3002均未操作。后续无待用户许可的实施步骤；按真实新故障/业务反馈再开展工作，不为刷漂亮状态重跑测试或采集。前一恢复点在tasks/completed/2026-11-08-before-staging-actual，旧未合并/未部署结论仅属历史。
