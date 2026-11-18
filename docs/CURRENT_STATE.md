# 2026-11-18 当前状态

08:43Z执行状态：用户已明确授权PR154合并及真实Staging部署/备份/安全恢复和两轮自然验收，Production禁止。PR154已MERGED，main **4a8c9bc24b00983d0d79150349adeed5a333a237**，tree与验收d2ec9453一致。Staging应用仍旧b4fc，旧Worker/fault完整保留；新镜像和runtime已准备但未切。真实新executor两次快照300103ms超时、失败包保留；经只读执行计划/哈希等价与全表耗时验证，已限定Staging role+database关闭预排序聚合并保存精确回滚，第三次标准备份进行中。另有“正式机制重建三个无状态容器”与“保留原容器ID”冲突待用户澄清；未收到答复前不切应用。最新现场、工具session和接力见AI_HANDOFF；以下保留本轮操作前的工程阶段事实。

当前任务：Staging 备份失败后的真实恢复证据接线，分支 `fix/staging-backup-sync-recovery`；本次 GitHub API 核实 main 基线 **a915c7a130ddada13118a1d245b41e7999b9d395**。起点 **24953ec47b523d65bb57094958c61a2a2179ef96**，工作树起始干净；保留此前全部调查及工程检查点。用户授权本机实现、隔离测试和 Draft PR，禁止合并/真实部署。关联 [Issue153](https://github.com/clearisok/zhixu-erp/issues/153)。

`recovery_evidence` 已接入身份/hash、executor进程/清理回执/锁、当前Docker exec、DB-only CLI、现有迁移检查、管理员状态、任务未知结果和advisory lease。正常路径不再返回空值；失败返回明确否定。门禁通过后复用原worker启动并等待新PG心跳，失败回执不改。详见[监管及旧故障恢复步骤](ops/ainuoke-catalog-sync-supervisor.md)。

隔离 Docker/PostgreSQL E2E 已通过真实采集、Worker启动/新心跳/后续到期任务；管理员停用、迁移错误、DB暂停、备份锁/exec占用和未知结果均阻止启动。测试Source用已有合成SDK，不访问真实艾诺科。最终质量检查及Draft交付回执在AI_HANDOFF。没有新migration，没有业务数据回填。

[Draft PR #154](https://github.com/clearisok/zhixu-erp/pull/154) 进入合并前工程验收。9ca4ec1443d6f7b86ee9db91ab6c4f3671b01046的baseline/team-access已覆盖完整根测试、182项基线、typecheck/lint及构建；source仅在新增Python模块的嵌套工作目录导入失败。修正测试加载路径并纳入gate/backup定向CI；另以失败回归证实并修复“监管器久停后误接纳旧的恢复后心跳”，现在要求最近两分钟内的真实新心跳。最终验收以PR最新HEAD的Actions及同HEAD隔离E2E回执为准，旧提交通过不能替代。PR保持Draft，部署边界不变。

真实Staging仍旧b4fc85ed版本与旧STOPPED_FAULT；旧回执缺新证明，不自动冒认历史清理。部署需另批，按只读recovery-check→审核新配对备份→新证明→正常tick恢复。超时/信号的容器后代不确定仍人工核对，不能宣称所有崩溃自动恢复。生产未操作，两轮真实自然同步未验收。

此前状态及所有原日期/hash/结果/限制完整保存在[11/18前状态](tasks/completed/2026-11-18-before-recovery-evidence/CURRENT_STATE.md)；历史发布与来源审计仍按对应任务证据，不用当前工程通过替代。
