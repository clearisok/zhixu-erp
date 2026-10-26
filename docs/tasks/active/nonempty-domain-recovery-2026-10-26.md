# 新业务域非空持久化恢复验收

2026-10-26；核实main 869ee84dd0b31de6161011e4aa560678b244a64d，本地分支 codex/persistent-cumulative-43-main-869e；阶段输入 61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，tree 46900a09200739db4a9e528c33b8fdc5331abac9，开始时工作树干净。唯一草稿[PR130](https://github.com/clearisok/zhixu-erp/pull/130)仍精确指向61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，三项CI首次成功、最终独立复审0P1/P2，未合并。原Git退出1的STOP_AUTH_OR_DIVERGENCE及根因未定保持；独立本地工程不解除远端Git/ref写冻结。

## 范围和验收

本轮仅扩展原持久化测试的显式opt-in合成输入：同一可信合同/颜色、资源、内外发排单、完成历史、集货仓/备注及物料到仓版本；使用原领域命令和原exact-target Backup/Restore，不增加第二套恢复实现。新test source与已验6d镜像分别记录，不为测试改动重建同一产品镜像。原8项保持并在新增输入下检查；不是把旧8/8当本次非空验证。

source checkpoint后canonical archive逐blob校验，复用现有依赖不安装；独立预审后一次运行owned合成项目。冷重建及恢复后核对业务表、领域/history/receipt；维护停写后冻结全部public表hash与sequence，在新目标恢复后启动/login前比较。原id、decimal、版本、审计与回执不得丢；要求相关表非空，失败停止保留自有现场。新工程结果尚待真实回执，不提前PASS。

## 安全边界

3001/50426/59069/62426及旧账号、库、对象、卷、网络、备份和Browser数据保持；不使用真实凭据或发起Ainuoke请求，不绑定/激活真实Source，不push/API改ref、新PR、CI、merge、正式部署、入口切换或退役。仅本地checkpoint。完整G1–G8/R继续；跨次成衣稳定事件/更正、关账三项口径、真实Source授权和人工接受仍待后续，不把本阶段缩作整个目标。

结果原件：outputs/domain-recovery-20261026；原[逐字输入归档](../completed/2026-10-26-domain-recovery-input-state/receipt.json)。前阶段[货款CI兼容证明](../completed/2026-10-26-payment-panel-ci-validation.md)和[6d镜像原8项](../completed/2026-10-26-persistent-cumulative-43-validation.md)分别按原source保留。前阶段末尾准备措辞以本次核实的终态前向替代，旧字节不删除。

预审eb176a3e发现1项P2：仅HTTP200不能证明回执known，unknown→unknown会假阳性。已前向修正为逐请求known/原UUID/applied，并比对原POST结果（仅剥离transport replayed/payloadHash）。新增4项正负回归；首次测试fake response缺bytes导致TypeError，不能将其3项拒绝当有效负向结果；修正stub并限定AssertionError后实际4/4。初次继承函数比较只因CRLF/LF失败，按Git canonical行尾核对后4函数/原8名称/新增1名称通过。无runtime/DB尝试已消耗，原archive保留。

实际终态：test source e3a23280e152d4113366604da020c68eb3e519bb、原6d镜像，canonical 2991 blobs/0 overlay；一次新非空runtime 9/9、478994ms，原请求均known且匹配POST。冷重建、全部表/sequence在恢复启动前、领域API在启动后比较通过；旧50/179/27元数据changes=[]。本地原件hash见[冻结证明](../completed/2026-10-26-nonempty-domain-recovery-validation.md)。Git/ref STOP仍保留，本轮Hosted0，PR130仍617。

证明由Q 8e6068b4894fd4d5417edc8ba02fc154f77a1f2d冻结；后续R只追加独立根至505证据/66能力，原504和全部UI/能力字段保持。最终守卫/复审另据实际回执。
