# 接力：同步因来源图片变化停止，图片排除与1400目录本地修复

2026-11-05；branch feat/ainuoke-full-catalog-followup；main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea。远端PR140/运行候选仍d8774ba50446d4c894f2c756a363280382afe8b8；下述新修复尚未交付，不能套用旧CI结果。

用户批准目录新增上限1400、原610身份必须保留、明细仍原243+1。固定恢复13:19:47–13:26:48完成147张高频首轮，第二周期0；单月频在243积压中6847ms完成，幂等、一单指针和通知通过。最后一批41报表全部成功，但目录前后PI2611-046.ImageFile从空变PNG引用，其他身份/字段/分页无变，D181未知字段保护停止；不归因网络或登录失败。5张该批失败、91张高频排队，原608历史/未选成功指针保留。原截止14:13:59已过期，剩余保守101登录/8200报表未使用，不自动延长或恢复。

用户随后明确不需要来源图片：新采集在构建快照前仅排除目录ImageFile，未知字段/身份校验不放宽，旧证据不改写。目录1400页数/预算同步两端，明细单表仍1000，单批80报表/4000行/180秒。已补调度1400容量及1401拒绝；无UI、迁移或6087051接入。相关本地类型/构建/25采集器/21协议检查及184 Python通过；数据库套件首次因Docker未运行未通过，启动已有Docker后隔离61/61通过；最终类型/lint/build通过，发布基线待收口。

测试副本control disabled/version12/paused catalog_changed_or_over_limit；操作者/PG停止、旧worker PAUSED；staging仍旧f21，未升级。原608配对及异机恢复仍有效，升级需最终新版本验收和临近live配对/附件HTTP/备份策略重绑。不合并main、不导入benchmark队列。

[本轮证据](../artifacts/five-step-convergence-20261104/directory-image-change-stop.json)、[此前接力](tasks/completed/2026-11-05-before-image-projection/AI_HANDOFF.md)。

远端执行目录/home/jackson/weaveops-five-step-convergence-20261104/continuous-additions-v1，scopeHash2ee0bcffe912c2115709c31a48a07f9e3d88e447f83e52a6406939d82d1355ce；runner SHA7d713673164acbee05d278f5f1c2aef417d833cbced1a8ac0b7354fec23e8f42。reservation已耗用且过期，不重跑。最后capture-36.private.json完整保存，last-capture-safe-diff.json仅字段名变化；metricsUnknown1表示领域校验前拒绝未累计，raw实为1登录41报表/42完整诊断。完整本轮37登录1293报表（含最后被拒绝），保守预约37/2920；此前2/80已经扣除，剩余101/8200。合计已知39登录1345报表、预约39/3000。

旧d877三项CI成功，勿重跑。新测试日志outputs/five-step-convergence-20261104/image-free-*；本机Docker原来未启动，已正常启动已有安装，无安装/删卷/重置。184 Python通过；新目录/图片跨语言21通过；类型通过；queue1400增量最终类型/lint/build、数据库61/61通过；发布基线待收口。

知识库独立工作树D:/workspace/zhixu-ainuoke-knowledge，3ce658027e645132c8f59ac0caaa1de58d2e326f，入口docs/ainuoke/艾诺科系统知识库与织序协同依据.md。已只读核对：6087051按合同带采购/收发明细ID、需要分层去重，当前业务候选未接入。不要整枝覆盖主线恢复文档，也不能把本轮技术同步通过当成新报表或最终材料金额已可信。
