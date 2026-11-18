# 2026-11-18 恢复证据接线交接

## 已获真实Staging授权，执行中（08:17Z之后）

用户已明确同时授权合并PR154与真实Staging部署/受控备份/安全恢复及两轮自然30分钟验收；不再需要这两项批准。仅Staging，禁止Production、伪造/回填heartbeat或last_run、清旧fault/未知结果、手工补跑自然验收。Worker不正常退出不能SIGKILL。

已核实原HEAD d2ec945357569a12316704a03c90682dee7f3b06、CI三项全部成功、无Review threads/审批阻塞，Ready后正常merge（精确HEAD约束）；merge/main **4a8c9bc24b00983d0d79150349adeed5a333a237**，双父a915c7a1/d2ec9453，tree与已验收HEAD一致。生产workflow仅dispatch，未触发。WindowsCLI一次连接超时后连接器核实Ready状态，随后merge成功；有界Git进程proxy覆盖fetch main成功，无共享配置变化。

运行工作目录：宁波SSH alias weaveops，`/home/jackson/weaveops-staging-preview/releases/sync-recovery-release-20261118`（TASK）；本机操作记录branch `chore/staging-recovery-acceptance-20261118`起点4a8c9bc2且干净，不向已合并修复分支加代码。TASK/source是旧b4fc发布Git的独立clone加原Git bundle，HEAD精确4a8c9bc2、clean。TASK/install.py是本次分阶段安装/只读检查脚本；build-staging.py复用前版离线配方，仅重绑TASK。私密结果仅留主机。

真实预检：project zhixu-quote-trial-staging-562fbf07；旧runtime/catalog-sync-b4fc85ed仍STOPPED_FAULT/backup_failed_requires_review，旧Worker exit0停止；分钟cron与cron服务活。626订单/626绑定；30975 complete、97历史failed、1queued；running/unknown jobs/catalog/capture均0，admin enabled=true/paused=null，旧heartbeat2026-11-16T19:12:01.067Z。新operator DB-only sync-health通过完整migration/current、DB非recovery、noUnknownResult=true、workerLeaseHeld=false，0源请求。DB无公网端口，原default internal/ingress标签归属符合；不改网络/daemon/proxy。

原runtime、旧policy/status/latest、原failure.json及cron已完整保全至TASK/preserved-before，manifest SHA256 **7ee401e28a75c41c87e5c86d46d0770e95bbe6e0117e45e5f8dca9bbcd0be6d3**。原executor SHA 2a4d0f89fcfcd08d75986906d887eeac4ead2c103afb79558e053c6bd13d0803保留；通过受锁安装新executor到原私有路径（SHA **9765b3a95131cd685a9b02c21c80123e19a93c900e40b28014959f11cb4e7a27**，1000/600），同目录安装gate并更新旧policy精确pin，check通过。原故障和控制未清。

合并版离线构建：operator **sha256:9fe679cba15927c2c345921ea7b20bae95ca30190a49bb993e9bd70f86fd851b**，app **sha256:6024cb566e6930aa351c9e2fcf86b1a09ee36c7b66a380cbae65818859924085**；buildId staging-material-4a8c9bc2/buildTime 2026-11-18T08:21:33.189Z。均仅构建未切应用。

当前受控部署前备份 **20261118T082150Z-63545d6c** 使用真实新executor、旧实际应用b4fc的准确旧policy；工具session2235仍运行，不重复启动。输出TASK/controlled-predeploy-backup.log。`python3 TASK/install.py inspect-backup`可脱敏查看真实状态/命令事件/DB等待；曾观测snapshot_query=true运行105秒、BufFileWrite/MessageQueueSend。未确定失败，不沿用历史315秒推断。下一步必须先读terminal回执和清理、确认服务恢复。新应用尚未切换、新runtime/cron尚未安装、恢复和两轮自然调度尚未执行。原始容器/镜像/卷均仍在。

分支 `fix/staging-backup-sync-recovery`。已核实main **a915c7a130ddada13118a1d245b41e7999b9d395**；起点24953ec47b523d65bb57094958c61a2a2179ef96。用户授权实现、隔离测试与Draft PR；不merge、不部署、不改真实Staging状态。Refs [Issue153](https://github.com/clearisok/zhixu-erp/issues/153)。

实际采集已替换空recovery_evidence，复用现有迁移/DB/source target检查及worker启动。新executor回执记录进程身份和正向清理证据；监管器持备份锁完成检查及启动。心跳验证与未知结果保护保留。详见[契约/一次性旧故障恢复](ops/ainuoke-catalog-sync-supervisor.md)。

真实隔离E2E已通过（非mock证据）：失败命令→真实清理→真实DB/migration/admin/lease→启动→新PG心跳→后续高频到期任务；包含拒绝恢复场景。执行命令：`pwsh -File scripts/tests/Invoke-AinuokeRecoveryRuntime.ps1 -SourceSha <candidate full SHA>`。测试镜像Source传输为合成SDK，无真实ERP请求。最终测试与交付回执随后补记；不要因Draft PR冒称Staging修复。

真实Staging只读核实仍旧fault，缺新executor pin/cleanup/process证明，现场未修改。需批准部署后进行一次新受控配对备份取得独立新证明，不能回填旧失败记录。超时/信号/未知后代仍fail closed。原始调查和历史接力完整保存在[归档](tasks/completed/2026-11-18-before-recovery-evidence/AI_HANDOFF.md)。

本轮工程结果：Python定向22项（Windows21通过/1 POSIX跳过）；Linux定向22/22通过，真实证据E2E在代码提交efb9b251523d00e1310edbf9d4f609a1df8600fe对应镜像通过（55.113秒），含失败回执保留、新worker心跳、后续到期任务及DB/admin/migration/lock/exec/unknown阻断；相关TS/PG/调度10项通过；typecheck、lint、前后端build、diff-check通过。首次源码基线仅因D195与同步契约文档冻结版本未前向登记而失败，待新commit blob登记后重验；182基线回归已启动，结果另记。Draft PR不代表部署。

已对D195与同步审计契约新增前向冻结记录，旧ID/blob/hash均保留。主机Staging仍原样；Git交付仅使用本机及宁波/tmp隔离Git目录，不属于应用部署。Windows交付预检曾在manifest待提交时拒绝dirty，0push；已核实只含本任务18行前向记录并收口后再交付，未清理或覆盖其他改动。

交付前补上中断安全边界：备份在启动子进程前就持久化backupBeganAt，避免监管器与executor同时中断时复用旧terminal回执；新成功备份绑定新executorBackupId。定向测试增加1项（Windows共23项，22通过/1 POSIX跳过）。源码基线前向登记后已PASS（e8e8e75a，0 UI路径变化）；182基线套件仍运行，不假报PASS。宁波标准Dry Run网络超时、0push且无gh；随后本机精确URL级进程proxy空值+HTTP1.1只读核验main成功，准备按相同进程参数运行标准交付工具。未修改共享代理/TLS/认证。

最终交付回执：代码提交 **cd87ec868ff58619a1a305f85e1495c0624e90ce** 的Linux定向测试23/23通过；同SHA镜像真实Docker/PostgreSQL恢复E2E通过（54.083秒），未mock recovery_evidence。标准git-delivery以进程级代理覆盖执行，实际push一次，独立GitHub API核实exact SHA，结果DELIVERED_VERIFIED；这不代表共享网络配置已修复。已创建并核实[Draft PR #154](https://github.com/clearisok/zhixu-erp/pull/154)：OPEN、Draft、未合并，包含所有既有检查点。随后仅收口本交付记录。

长回归收口：最终HEAD源码门禁重复运行及完整`npm run test:release-baseline`均未取得可核实的完成结果，已中断，不计PASS；保留此前e8e8e75a源码门禁PASS，完整基线回归及根npm test仍待完成。PR须明确这些限制。Staging/Production未部署、真实业务状态未改，两轮自然30分钟同步未执行。后续仅经用户批准才部署匹配组件、执行文档中的旧故障安全核验。

## PR154 工程验收续接（2026-11-18）

本Phase起始branch为fix/staging-backup-sync-recovery、HEAD为9ca4ec1443d6f7b86ee9db91ab6c4f3671b01046、工作树干净；GitHub main仍为a915c7a130ddada13118a1d245b41e7999b9d395。用户仅授权验收及本PR缺陷修复，不merge、不部署、不改真实DB/fault、不调用真实艾诺科故障测试。

起点Actions已经补齐上段长回归缺项：[baseline](https://github.com/clearisok/zhixu-erp/actions/runs/44254344961)通过182项基线及源码门禁；[team-access](https://github.com/clearisok/zhixu-erp/actions/runs/44254344528)通过根npm test、typecheck、lint、server/default-browser/server-session构建。[source](https://github.com/clearisok/zhixu-erp/actions/runs/44254344503)仅末步Python discovery失败，具体是tools/ainuoke-bridge cwd下动态加载supervisor无法找到ainuoke_recovery_gate；其他SQL/API、候选构建及Chromium步骤已过。不重跑本机相同大套件，修复后的最终结果必须取最新HEAD对应的新Actions。

窄修复：两个动态加载测试在加载时临时加入实际scripts目录，保持生产import和全局sys.path不变；source CI补跑已有gate/paired-backup测试。审查门禁/清理/心跳/未知结果/旧故障流程时，增加旧心跳回归，先在Linux复现RUNNING误判，再给新心跳增加与既有恢复窗口一致的两分钟时效约束；Linux原CI嵌套cwd下16项supervisor已通过，另gate2项/backup5项通过。无调度/业务规则/迁移变化。最终HEAD、完整Actions与隔离E2E证据记录在同一Draft PR的Validation，等待用户批准后才能进入部署准备。
