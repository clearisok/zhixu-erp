# 接力：新增销售合同自动发现已完整交付

2026-11-10北京00:42。目标已完成：PR143已真实合并、仅staging部署及两轮自然目录/新单/原617验收通过，后台继续运行。观察session12756已正常exit0并保存证据，不重复启动观察、推送、合并、导入样本、源刷新或完整CI。下面保留本次实际恢复位置，后续仅按新故障或明确用户需求开展工作。

## 精确版本

工作树 C:/Users/Administrator/.codex/worktrees/ainuoke-order-discovery/zhixu-ainuoke-api，分支fix/ainuoke-order-discovery；应用和operator源码main **dbc61af9be80d0a72e8226afa2cefad6e240ef09**。PR143最终head1e2af646e2f4d34b42a0db13f41a942379886189，11/09 23:48:18 merge commit，双父390569c4/1e2af646、tree472100d2d0dbe2a18801d56eadf24cbb1f3655ab与候选一致。三必要CI首轮成功source42631733312、team42631733387、baseline42631733481。当前后续改动仅交接文档，不是另一个产品部署版本。生产workflow_dispatch未触发。默认Git代理17989失效，已验证进程级URL代理空值可以传输，未改持久配置/认证/TLS；只有一次实际安全push，后续无需重复。

## 宁波实际运行

SSH weaveops；ROOT=/home/jackson/weaveops-staging-preview；PROJECT=zhixu-quote-trial-staging-562fbf07；gateway127.0.0.1:3003，公网https://staging.weaveops.top。TASK=ROOT/releases/order-discovery-20261109，SOURCE=TASK/source同M。RUNTIME=ROOT/runtime/catalog-sync-dbc61af9。应用sha256:6f35170fea69b3247acd48394f1cd42166ed9848c332a52179b4f2648f144ea5；operator sha256:41a162ab6cfa5ff3e4aa6d97045b57cf1a61a8ae9feea8ed076d9d58d237c6d5；build staging-material-dbc61af9，0057迁移后139表。原project/卷/端口/附件/正常RBAC保留，无DEMO。

唯一后台weaveops-catalog-sync-dbc61af9由正常minute cron于00:10:01.930启动，一Node/一Python；旧390正常TERM exit0，cfg.enabled=false/stateDISABLED。旧3合同collector仍PAUSED。本机D:/WeaveOps-Local serviceEnabled=true但syncEnabled=false，源Python0；保留网页/617数据/原6queued，禁止同时启用第二owner。凭据只在原受保护配置，不打印env、Cookie、JWT或原始配置。

00:10:04.899–00:10:08.257首轮新版本目录request64568458-30d0-4e46-8b11-2700ed7df9b9，619合同，前后各13页26不可变页；scan_state成功00:10:08.623，next00:40:08.623；run9fe81ca8-351e-4009-bd5d-b6b8d026bd77。1登录26报表，水位complete-directory-overlap，不以合同日期或源ID裁剪。没有经过验证的源站新增时间增量API。第二轮request56abc9e1-23f7-467a-96ea-a4898e6a8f39，00:41:05.372–00:41:08.611自然完成，619合同/26页/created0/pending0/0登录/26报表；下一计划01:11:08.611。两轮间隔30分59.988秒，包含分钟级调度检查的实际延迟。

00:25当前后台前53批共1登录/2857报表/失败0。两个新单新版本自动任务也已发布：081在00:20:40.173 run e4fb2cd3-39a0-4f7e-a818-17d886cac65f，084在00:19:08.452 run2837aebc-d593-4d97-932e-697a42f8ceb0。两者均automatic非手动。00:22队列queued/running/unknown0，历史30失败回执保留，当前订单错误0。动态R当前258高频/121每日/190每周/50每月，共619，不沿用旧617分布。

## 根因及真实样本

03:30备份cron碰每分钟tick的非阻塞锁，operations.log SUPERVISOR_BUSY，监管器自03:12一直BACKUP_QUIET等当日已验证备份；最后目录02:54。原390已存在30分目录及adoptNewOrders=true，不能说完全没有发现代码。按原保护流程补备份20261109T124359Z-9530194e后，原cron20:49自然发现619中的两张11月9日新合同、自动建档与首次采集；这是修复前恢复路径的真实结果，不能冒称当时已部署M。修复使普通tick补跑原备份并验证，失败仍STOPPED_FAULT。

PI2611-081/source7186/311OW/9752件/交期2027-01-25，stagingUUID faf4038f-467d-4bff-aaa7-b4c17145f047，SO-00000618；20:49:07.085建档，20:49:36.761首次published，2颜色/4物料原行。PI2611-084/source7189/款MS7700C、工厂款7700C/8491件/交期2027-04-07，UUID b23cca8e-a489-4206-b47c-7e4947474bf4，SO-00000619；同一事务时间20:49:07.085建档，20:49:22.844首次published，2颜色/2物料行。无手动导入/刷新。旧390第二自然周期21:20成功619/新建0/26报表0登录，不与新M周期混淆。

两张新单已在公网正常Jackson身份下通过订单中心搜索→正式详情→颜色尺码→现有物料页。081为2自购2厂供2采购，084为2自购0厂供2采购；无收发源明细不造流水。084实际HTTP200、provenance=server_snapshot、合同/UUID正确且frequent；未知尺码、需求单位仍真实未知。原617完整身份文件TASK/original-orders.private.json SHA13f756710ccc5ea392eaddbd63e1c434fe2a93c40d776eda71fb5cea2d39f30d；00:11全619物料HTTP通过、原617五元身份保留、4完整空、匿名401。正式来源旧时点仍可读，不把stale当刷新失败。

D1992实际stageUUID25285166-1585-449f-a8fd-81cbd7c98084，保留20项原精确同单位事实及原业务UI。PI2611-057采购M2611107旁路只读核对已完成，首来源11/08 07:57:18/发布07:57:21，两唯一采购1970千克358540元；不替代新单目标验收。

## 备份、恢复与保护

受保护23业务表、3原用户/角色、619既存订单哈希前后无变化，protected-business-result.json已保存。升级前137表/9对象备份20261109T155208Z-6e554d68，23:52:08–23:57:46完成；新M备份20261109T160127Z-718188f7，00:01:27–00:07:09完成，139表/9对象、服务恢复verified。两包均49文件离机逐个hash全等，D:/WeaveOps-Local/order-discovery-staging-20261109/backups，当前用户/SYSTEM/Administrators私有ACL。新manifest SHA85abf22a7f4305ec226df4646d7bd016cb94c072623f3f043e0e70d05fc0f070。

独立恢复ROOT/recovery-final-dbc61af9/project zhixu-quote-trial-recovery-dbc61af9be（43004）139表/序列哈希全等、9对象恢复校验、正常登录/报价/D1992 HTTP200/38来源行；0源请求，恢复服务全部停止保留。实际result.json已复制D:/受保护根restore-proof.json；原实际staging未被恢复覆盖。正常每日03:12–03:50安静窗口、03:30备份，minute tick补跑同一受保护命令；认证/未知/身份故障不会自动解除。回退保留M之后新业务，不能恢复旧库覆盖；沿用已演练旧镜像挂载完整新迁移目录的只读兼容核验。

## 检查与恢复位置

204 Python/8监管器、新目录PG5项、刷新18项、适配9项、原非法日期隔离16项、类型/受影响lint/固定46路由构建，182发布回归及最终精确guard均通过；最终完整CI也全部成功。Windows冻结前失败/取消仅是历史，不能冒称通过；后续合并版CI证明最终版本。未改产品代码，不重复已通过检查。

私密TASK：full-order-http-acceptance.private.json、first-new-runtime-scan.private.json、new-runtime-progress.private.json、protected-business-result.json、staging-status.json、worker-stop-proof.json、upgrade-result.json、activation-result.json、fresh-pre-upgrade-backup.json、post-upgrade-backup.json、natural-discovery-first-proof.private.json、natural-second-cycle.private.json。第二轮新M证据second-new-runtime-scan.private.json及final-natural-runtime-proof.json已保存；00:42首轮258不同订单在11分22.868秒完成，累计278成功任务、58完成批/1登录/3102报表，失败及当前排队0，原Node/Python owner未重启。原始业务、配置和备份不提交Git。rollout.py/acceptance.py/preserve-business.py/restore-final.py及本地outputs观察脚本仅审阅过的交付工具，不维护另一个采集发布逻辑。

未完成实施项：无。本轮只部署staging；目录上限仍为经验证的1400合同，超过上限/认证/身份/分页/未知结果按原门禁明确停止，保留已有成功数据。源站没有证明创建时间增量或永不掉线，30分钟不是硬SLA。最终逐项审计见任务Gate5及final-completion-audit.json。交接文档checkpoint与实际部署M分开，不因更新文档重启服务。此前原日期/hash/限制在[tasks/completed/2026-11-10-before-discovery-actual](tasks/completed/2026-11-10-before-discovery-actual/AI_HANDOFF.md)。
