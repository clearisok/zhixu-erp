# 2026-11-18 17:14 北京 Staging 恢复接力

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
