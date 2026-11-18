# 2026-11-18 17:14 北京时间：Staging 切版完成，恢复验收进行中

用户已授权合并PR154、真实Staging部署/受控备份/安全恢复及仅重建app、gateway、objects-tls。Production禁止。PR154已MERGED，部署源码 **4a8c9bc24b00983d0d79150349adeed5a333a237**，tree与验收d2ec9453一致；此前1026根测试/182基线/23 Linux/恢复E2E及全部CI通过，产品代码未追加修改。

正式trial.mjs/Compose于17:12:45北京切版完成；三个新容器使用app镜像 **sha256:6024cb566e6930aa351c9e2fcf86b1a09ee36c7b66a380cbae65818859924085**，配置hash/HTTPS/应用及对象存储readiness通过。database和objects原Container ID不变，四个原卷inspect身份及挂载关系相同，旧镜像仍可用。完整旧inspect、展开Compose、配置/环境/证书/密钥及挂载文件私密保存在TASK/stateless-rollback-assets，清单SHA256 **f45c469c0d8e4775df932448fb633d9cbfef43e84487e0a90666a3fca7ca92c4**。未重建数据服务、创建空替代卷或初始化数据库。

新版Supervisor/executor/gate、真实新容器Policy及分钟cron于17:13安装。迁移仍max0058/57条，无新增迁移。Worker仍停止，旧STOPPED_FAULT及原失败回执保留；切版后97历史failed/1queued/30975complete、626订单/626绑定均在。只读recovery-check因新版本尚无terminal receipt正确拒绝，没有清控制状态或伪造时间。

新版本受控配对备份 **20261118T091329Z-a0d73b4a** 于17:13:29北京开始，尚未完成。完成后独立验证回执与清理，由正常分钟tick通过门禁启动Worker并验证真实PG心跳，再观察两轮自然30分钟任务；不手工补跑。尚不能宣布自动同步恢复。

部署前旧版本备份20261118T084308Z-e594db1c已独立验证52文件/143表/11对象，不冒充新版本备份。今天前两次snapshot_timeout失败包保留。只读等价验证后，仅Staging quote_trial角色IN DATABASE quote_trial的enable_presorted_aggregate=off使标准快照完成；原值及精确回滚SQL保全并纳入新Policy。无业务数据、heartbeat或last_run_at人工修改。

完整SHA和执行恢复点见[AI_HANDOFF](AI_HANDOFF.md)；此前日期/hash/限制完整保存在[切版前归档](tasks/completed/2026-11-18-before-stateless-release/CURRENT_STATE.md)。操作记录分支chore/staging-recovery-acceptance-20261118，不向已验收产品树添加代码。
