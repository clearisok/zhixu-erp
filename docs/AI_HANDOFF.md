# 2026-11-18 17:59 北京 Staging 恢复接力

**最新Gate：首轮260/260真实automatic complete/published完成**。范围来自首个09:26:18真实观察的260高频订单，原manual不计；首轮started09:26:17.150Z–last finished09:57:10.156Z。第二轮started09:56:55.252Z，09:58:53观察20complete/5running/5queued，230尚未创建；30对计划间隔均精确1800秒。10个瞬时due但未入队最长30.564128秒（下一分钟automatic tick前的正常等待）；不要把这当长期遗漏，也不得用人工enqueue消掉。TASK/round-summary.py新增实际oldestDueWaitSeconds字段，复用原syncSchedule，没有门禁默认通过。全部两轮仍INCOMPLETE，必须继续等包括原manual对应订单的第二次automatic（预计10:27Z之后），不要缩小cohort。

17a522971ca450326f1fbcaec4e62eee46b4c64a操作记录已DELIVERED_VERIFIED。当前HEAD追加Linux隔离复核（git bundle→TASK/acceptance-source-17a独立clean checkout，只读挂载到同operator image，networknone/不接DB或ERP）：source guard PASS，完整182/182在Docker --init+serial模式89.804秒通过（09:54:33.574630–09:56:04.077018Z）；TASK/release-source-guard-linux-17a.log/json和release-baseline-init-linux-17a.log/json。最初无init并行及串行均162源码断言通过但第二responsive子进程SIGABRT；单独responsive20/20通过，加init完整182通过，失败日志全部保留；进程回收是对照支持的推断，具体OS原因未确证。Windows旧快照运行和后来的重复运行均主动取消，不计PASS；后者精准停止本机测试child44764（parent14804），不涉及真实Worker。session45450/89851/11105/70881/64475/20819全部完成，无这些后台测试。源guard17a确切HEAD/4a基线PASS，不重跑原已验收产品根测试。

**最新覆盖下方“备份正在运行”时点**：session24948已exit0；新4a备份20261118T091329Z-a0d73b4a于09:24:53.448136Z成功BACKUP_VERIFIED，cleanup全true/服务恢复。TASK/new-backup-verification.py独立核实56文件、143表、11对象、dump2659790990bytes，manifest **2bca43c332b2eaa596593882d05f7a5817a4e14b701ae24695150e15a2e3cd1d**；所有Policy pin/cron/三模块1000:0600/原私有executor更新/原failure不变均PASS。回执TASK/independent-new-release-backup.json。首次09:25分钟tick因executor仍完成收尾而安全阻断，09:25:59真实readonly Recovery Gate九项全true（工具响应）；后续实际只读文件TASK/recovery-gate-after-backup.json。

正常分钟cron09:26:01.792690Z开始恢复，Worker342e3b7d796b81a82f379da631cc793b958fe8faab43fbaa95982fa6468f2c3c于09:26:03.510281077Z启动（唯一，image9fe679…，仅本project default+ingress）；09:27:01.813141Z Supervisor RUNNING/recoveryResult=heartbeat_verified。真实09:27:11.972Z PG heartbeat已观察，admin enabled/无pause。旧OLD STOPPED_FAULT仍未清；新状态保留originalFault以及上次阻断code=backup_cleanup_unverified，该code是保留历史字段，不代表当前gate失败。

自然目录09:26:10.118323Z完成并接纳2新订单，628orders/bindings（原626保留）；next_scan09:56:10.118323Z。09:27:20自然15automatic完成/5running/356queued，无新failed/unknown，原manual1已complete但不得计自然轮，97历史failed仍在；高频260、daily117、weekly185、monthly66，无重复slot/observation，无到期却无pending。TASK/natural-observation.py仅DB READ ONLY+Docker inspect，并用networknone同Workerimage的原syncSchedule纯函数计算计划；不写heartbeat/任务或访问Source。原始私密证据TASK/natural-observations/*private.json，latest-summary.json脱敏汇总。TASK/round-summary.py从第一真实观察固定260高频cohort，每个必须两次automatic root job complete/published；manual占过首个slot的一单会晚半小时，仍继续等，不缩小cohort冒称完成。尚未达2/2。

本机npm run check:release-baseline第一次因继承manifest baseline=a915和新文档缺旧基线锚报BASE_SHA_MISMATCH/STATE_BASELINE_DRIFT，已只读ls-remote核实main仍4a，于docs/release/baseline.json仅前向改baselineSha/verifiedAt，不改冻结证据/截图/UI。修后源码门禁PASS（checkedHead de3c0230，0UI变化）；npm run test:release-baseline仍session45450运行（WindowsCPU密集，未完成不能写PASS）。相关产品测试仍验收head d2的原通过，无产品代码变化不重复跑root/type/build。de3c023023c3a07724ae7599fdabb43bec5ba6bb操作checkpoint已DELIVERED_VERIFIED。当前新Gate须收口文档+manifest commit并标准push一次。

最新用户明确批准正式机制重建app/gateway/objects-tls；此前保留其Container ID的限制被替代，不再待答。其余数据库、objects及全部卷保全/Production禁止规则继续。详细历史操作与精确SHA完整保存在[切版前接力](tasks/completed/2026-11-18-before-stateless-release/AI_HANDOFF.md)，不可按其中旧“待答”限制停止本次已授权工作。

PR154已MERGED，发布源码4a8c9bc24b00983d0d79150349adeed5a333a237，验收head d2ec945357569a12316704a03c90682dee7f3b06。当前操作记录branch chore/staging-recovery-acceptance-20261118，不添加产品代码。SSH alias weaveops，project zhixu-quote-trial-staging-562fbf07。

TASK=/home/jackson/weaveops-staging-preview/releases/sync-recovery-release-20261118；SOURCE=TASK/source；OLD=/home/jackson/weaveops-staging-preview/runtime/catalog-sync-b4fc85ed；NEW=同runtime/catalog-sync-4a8c9bc2；BACKUP=/home/jackson/weaveops-trial-backups。

17:11完整私密回滚资产保存TASK/stateless-rollback-assets（700/600），manifest f45c469c0d8e4775df932448fb633d9cbfef43e84487e0a90666a3fca7ca92c4；包含5容器完整inspect、镜像inspect、4卷inspect、旧新展开Compose与hash、47文件。TASK/stateless-audit.py preserve/plan/verify仅保全与核查，正式部署仍TASK/install.py deploy-app --allow-stateless-recreate调用原trial.mjs/Compose。dry-run只替换3无状态服务，database/objects Running，无新卷。

17:12:45正式切版成功，17:13:02独立验证STATELESS_RELEASE_ACCEPTED：新app f8d6f503626d、gateway 6d0af8266928、objects-tls 93de368c6578均image sha256:6024cb566e6930aa351c9e2fcf86b1a09ee36c7b66a380cbae65818859924085，完整configHash见TASK/stateless-release-verification.json。DB原0f4bc64935ba、objects原f2ed36f79485未换；四卷inspect及RW挂载完全相同，旧镜像存在，rollback文件hash全部有效，internal/ingress隔离、HTTPS/app/storage readiness PASS。

17:13:09 install-policy-cron已实际完成：Supervisor a0109d4fd68b8ff3fe5556f8e3e1b61312396cc9d3eadc8e861a0e6587441676、executor 9765b3a95131cd685a9b02c21c80123e19a93c900e40b28014959f11cb4e7a27；NEW实际文件600/1000，原OLD/paired-backup.py也已由正式受锁安装更新同hash，原2a4d0f89完整留档。Policy绑定真实新5容器/source/143表并pin所有配置、模块、cron及限定PG planner配置的保存/应用/回滚3文件；分钟cron与每日备份cron实际指向NEW。Workerimage sha256:9fe679cba15927c2c345921ea7b20bae95ca30190a49bb993e9bd70f86fd851b；sourceKey local-empty，target f3fe09ceadd17c8e74757eff75a3e2a9452c00ef0786dec7364c82d1ba13a7c9。

新只读recovery-check已执行，collectionError=backup_terminal_receipt_missing，合理拒绝旧b4回执用于新4a。实际管理员enabled/无pause；此前新状态RECOVERY_BLOCKED仍originalFault，原OLD状态STOPPED_FAULT/backup_failed_requires_review未清。切版后30975complete/97failed/1queued，626orders/bindings，running0；migration max58/57条，无新migration。

**当前正在运行真实新版本受控备份20261118T091329Z-a0d73b4a，17:13:29北京开始，工具session24948，尚无terminal。** 标准命令NEW/ainuoke_sync_supervisor.py --config NEW/supervisor.json --reason '<user authorization>' backup，日志TASK/controlled-new-release-backup.log。不得重复启动；backup持supervisor锁，分钟tick忙等而不启动Worker。期间避免额外数据库客户影响no-clients证明。可仅读BACKUP/status.json/commands日志元数据，不把未完成说成功。

备份terminal后验证新source/manifest/files/cleanup，正常cron应该通过gate→启动Worker→RECOVERING→新PG heartbeat→RUNNING。不手动docker start、不清暂停、不写heartbeat/last_run、不创建/补跑任务。观察两轮自然30分钟并记录automatic jobs scheduled_slot/IDs/start/end/result、audit/capture、数量/失败/pending、单Worker/租约和真实heartbeat；原1manual不算自然轮。数据库不健康、未知结果、清理不明继续阻断；不SIGKILL。

旧部署前成功备份20261118T084308Z-e594db1c（08:54:33Z，52文件143表11对象）已独立验证，仅是b4。旧原failure20261116T193001Z-c6870e6d及今天两个失败包保留。PG planner角色+库限定off仍有效，非业务数据变更，回滚TASK/planner-setting-rollback.sql；细节见历史接力。

后续每可靠Gate更新此接力/CurrentState并独立commit、标准git-delivery一次push/精确核实。新备份成功、恢复启动、两轮自然结果均尚未完成，不得预写。Production未动；Issue153不自动Done。最终报告按用户A-E及卷保全完整给出。
