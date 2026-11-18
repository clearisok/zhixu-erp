# 2026-11-18 Staging 备份与同步调查恢复点

后续状态转换已在主管理器接入，模拟证明门禁通过后复用 worker 启动并等待新心跳、缺证据阻断；真实 `recovery_evidence` 仍为空，未连接清理证明及只读健康检查，不能自动放行，事故 E2E 尚未完成。不得宣称恢复完成或部署。见 [监管契约](ops/ainuoke-catalog-sync-supervisor.md)。

进一步本机实现：`--sync-health` 在既有目标身份和迁移校验后只读汇总控制、未决任务及 PG 恢复状态；新增 fail-closed recovery gate 与 Docker exec 列表检查。它们尚未接入主管理器，Docker exec 列表不证明进程树清理，未完成备份失败后的自动恢复、安装器、心跳或事故端到端测试。禁止描述为完成。

本轮继续实施：已引入现场原备份执行器的仓库候选 `scripts/ainuoke_paired_backup.py`，增加命令日志和本地进程组清理；未接入现场、未完成 Docker 内 exec 清理证明或监管器自动恢复。用户要求完整实现、回归和 PR，尚未达到；不可把候选或已有测试当成恢复通过。源文件原 SHA `2a4d0f89fcfcd08d75986906d887eeac4ead2c103afb79558e053c6bd13d0803`。

后续工程尚未完成：已增加备份执行器级脱敏失败回执及中断恢复阻塞检查，不能自动恢复；仍缺可靠子进程清理、数据库/迁移/管理员核验、告警、自动重试和 Worker 安全恢复。不得作为修复发布。详见 [监管契约](ops/ainuoke-catalog-sync-supervisor.md)。

当前分支 `fix/staging-backup-sync-recovery`，经宁波 Git 只读核实 main 完整基线 `a915c7a130ddada13118a1d245b41e7999b9d395`；本机 Git 代理连接失败，NETWORK_DEGRADED。11/17 备份失败导致 sticky supervisor fault、worker 停止；准确子命令尚未证明，系统日志无权限。证据和后续安全约束见 [调查记录](tasks/active/staging-backup-sync-investigation-2026-11-18.md)。用户已授权本机修复、测试、PR，未授权合并或部署。实际备份执行器为部署主机私有文件，不在仓库；不可凭修改监管器单独宣称完成。未知结果不得盲目重试。未操作 Staging 状态或数据，未完成自然周期验收。

# 当前：产品需求管理配置与 Project 实测完成，配置 PR 待用户审阅

2026-11-17基线main **b4fc85ed0ac09ad45db8959257a9b2d840abba26**，工作树 product-management-workflow/zhixu-ainuoke-api，分支 chore/product-management-workflow。先读 [接入审计](product-management/AUDIT-2026-11-17.md) 和 [产品生命周期](product-management/WORKFLOW.md)。只做管理基础设施；不继续下方历史部署任务。旧本地文档分支6c2d5535保留，不合入本轮。

已补8标签，bug复用；3表单/4规范/AGENTS集成。用户现已授权Project：19字段/选项、6视图、7workflow全页读完；TEST Issue149于21:47:11创建、21:47:13自动入卡（延迟2秒），21:47:50首次观察Idea（此前未手动加卡/改状态）。保存证据后只测该项Research/Idea写权限并读回；21:49:33关闭not planned，卡片移出后Project0项，完整配置前后deep-equal未变。证据永久写入审计和Issue评论，不能再次建立相同测试或重写旧结果。

PR148实现beeb7a86三CI全部成功、源码守卫0 UI变化；本次文档补记的精确head/Checks以PR为准。03 · Development筛选文字实际为`03 · Development`，建议用户确认后改`status:Ready,"In Progress"`，本轮没有改。API只提供workflow启停元数据，不暴露触发器/动作，精确筛选和Issue-only配置未逐字读证，正向自动化实测通过。正式Issue Forms测试只在本配置PR经用户批准合并后做；本次不合并、不部署、不改真实Issue/PR。继续时先看PR148状态，不把已清理TEST当待处理需求。

# 以下历史：已部署M，修首轮压缩目录审计计数

本次源码检查基线：b3047410ac292c48f0850e841241c00658dc0d75。历史部署和冻结证据保留原版本。

先读[当前修复与真实恢复点](tasks/active/sync-audit-packed-baseline-fix-2026-11-16.md)。本机release记录分支9588ddb7保留。M=b3047410已真实部署/0058/发布后备份完成；11/16 11:40Z正常启唯一owner，首目录成功/626订单，后续复用登录。发现首台账626假新增，真实旧621→新626为5/11/610，正本分支修复+明确保留原计数的受控维护能力；尚未在真实台账更正/部署新修订。原数据/同步业务不变。以下为M合并前旧记录，不再代表现授权/部署状态。

# 接力：继续同步审计staging交付

新检查点：e912d20b已精确送达、复审6847694671无新问题，来源CI第五轮仍在运行。自主补充共享目录计数断言证明旧updated=0应为1，已修同batch同validated directory只保留首次源记录比较、后续追加publication IDs；49目录与持久审计27/27通过，types/lint通过。最终需集中commit/push并以新HEAD CI为准，不能部署过时e912。预备备份52文件2326134762字节已流式逐文件离机核对到D:/WeaveOps-Backups/ningbo-trial/bundles/20261113T071520Z-7d0120a1，manifest SHA a09f1e1051bd4ca139861c41436448588d63c9efb873a7e72e55b19a787a939f。旧工具readFileSync超过2GiB失败，本次不重传，scratch流式复核成功；常设工具未改。恢复139表/序列/11附件已通过。staging未迁移/部署/启源，native source已私密clone旧c513等待最终真实merge对象，source-accept.py的expected head须改为最终修订。

更新：ba6860f1自动复审07:56:55Z无新问题，四条thread已resolved；两项CI成功，source第四轮在14分钟末发现货款无效scope在audit前未校验而触DB。现包装器先原sha/parse校验再audit，保留原业务校验，补无效targets在真实collection入口零DB测试，payment22/22通过。待最终commit/CI；此前共享目录、历史升级、恢复保全结果不重做。旧应用继续可用，未迁移/部署/启源。

新恢复点：427db08c复审4560851175共享目录成功证据被失败子行覆盖已修，保留确认COMMIT、发布ID并集、计数并标partial。目录16PASS、历史17PASS、45轮归属其余通过；prefix12与21旧fixture使用c513历史写入器，当前缺0058零请求拒绝保留。46类型/Lint/server通过。隔离restore139表+序列逐行哈希及11附件一致，network none/无端口，资产保留；原dict/list比较误报已修正结构，真实无内容差异。尚未合并/迁移/部署/启源，待最终必要CI与复审。

再下一恢复点：7742626d精确交付后本机build/lint/server、浏览器3、源码guard通过，CI baseline/team-access成功，source因0043旧fixture使用当前collectGarmentOnce失败；现历史fixture扩展与对应升级8PASS。自动复审新增4560743078的成衣正常终态COMMIT漏确认已改commitWithSyncAudit，首发布真实审计断言及collection/store41PASS，types/lint/server43PASS。当前dirty只此产品1行、相关3测试/fixture及本段文档，待最终commit/push/必要CI/复审，不能重复已通过的无关本机组。预备备份已于07:28:33Z BACKUP_VERIFIED且原服务恢复；全新隔离restore会话83009进行中，脚本outputs/sync-audit-staging-20261113/restore-check.py，源请求0、live DB写0，容器网络none/无端口/卷保留；尚未迁移58或部署/启源。之前43231备份会话已完成。

最新恢复点：PR146已创建、head7354d3c3精确送达；baseline/team-access成功，source旧schema fixture正确触发缺0058拒绝，正在前向修测试。自动复审两个P2已修代码并加回归：失败合同必须显式子记录；回执复用replayed不假成功/失败，不计新同步。当前dirty全属本修复，测试outputs/sync-audit-review-fixes-38.log在运行；类型38通过。新0058状态仍未部署，feature契约改变需要新冻结证据前向替代7e，不改旧hash。staging配对备份20261113T071520Z-7d0120a1运行中、会话43231；当前620订单/620head/28237快照/0缺、57迁移/0审计表、27053complete/97failed/5queued。23人工表/3账号/620身份和5真实HTTP基线已保存。新任务outputs/sync-audit-staging-20261113与宁波对应releases目录；预备脚本已语法检查，尚未执行新版本迁移/部署/启源。备份后须核实恢复/保全，不用旧私密回执代替新结果。

最新用户已授权PR检查/合并、0058、staging部署及两个自然目录周期，production禁止。先读[交付恢复点](tasks/active/sync-audit-staging-delivery-2026-11-13.md)。8a2341d9已实际上传一次、独立API精确确认；网络原因是GitHub专用127.0.0.1:17989无监听。仅进程GIT_CONFIG_KEY_0=http.https://github.com.proxy、VALUE_0空、COUNT=1成功，不能改全局配置。Open仅136 Draft/CONFLICTING、非依赖，保留。当前增量是结算单关联证据发布回归与CI接入，18PASS；不新增结算业务模型。尚未部署/迁移/启owner/发源请求。旧运行脚本见outputs/material-staging-20261112，但必须在新任务目录前向适配当前c5133e9e目标，不能原样复用旧sha/旧回执。以下是先前本机收口时点，不再作为当前授权/远端状态。

2026-11-13，工作树material-dense-local/zhixu-ainuoke-api，分支feat/ainuoke-sync-audit。基线M/main **c5133e9e9e7065dc4fe7672c0c88c75688e0c51f**；产品代码 **3d2a3737765d02eae5586e8edff40e27df166acf**。读[最终交付记录](tasks/active/ainuoke-sync-audit-2026-11-12.md)、[契约/11源清单](features/AINUOKE_SYNC_AUDIT.md)，不要从旧“开发中”归档重启任务。

已完成4审计表、各现有入口、GET/RBAC/Excel/新菜单、安全持久计数和COMMIT确认；旧hsid-only全局无期限暂停原因有真实54请求/13页双遍证据。仅有限完整重读，人工/认证/权限/身份保护不变。无新增源站登录/报表。

最终测试108回归、41核心、33旧入口、9历史/重启、4有界入口、3浏览器、182基线负向均PASS；类型/Lint/服务端/前端构建PASS。各组重叠。**不要重复22分钟的182负向套件**，除非产品/守卫/冻结证据又有变化。日志名、旧失败原因、真实历史例子见最终记录。

当前63054/63051真实业务库/进程未迁移/切换；staging仍旧PR145版本、暂停/worker停用保留。不为完成本任务清暂停、启worker或部署。0058只在自有临时PG验证。历史台账维护默认preview、最多100批/次，仅metadata；真实库未回填。源时间、旧提交/旧增改计数缺失保持不可获取，不能从近似时点推算。

本轮用户只要求本机工程，不需要演示，未授权staging/生产。下一步若用户授权发布：先核对远端候选/必要CI，staging自身配对备份和恢复准备→0058→同一构建版本→单认证owner受控切换→真实新审计与自动恢复验收。缺迁移fail closed；不能直接启新worker。不要重做既有物料页面或业务匹配，不碰617历史/人工数据。[原发布运行/回滚位置](tasks/active/material-staging-release-2026-11-12.md)、[先前交接](tasks/completed/2026-11-12-before-sync-audit/AI_HANDOFF.md)保留。远端/PR状态以最终交付回执核实。

远端收口：2026-11-13标准Dry Run的Git预检exit128/uncertain_transport，API通过，NETWORK_DEGRADED；0次实际推送，无PR/CI，未重复撞该通道。最终源码基线34在b23923f5通过；其后仅本段交付回执补记，不改产品/冻结证据。继续工程不受影响，远端交付另待核实。
