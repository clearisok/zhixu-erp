# 货款申请受控采集与发布接线

核实2026-10-16；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。Phase baseline：原worktree由干净的feat/ainuoke-payment-snapshot-storage@a94a7df97ff9b6312cdb9c7990e3e9b32a31c27b分出feat/ainuoke-payment-controlled-collector；原分支/ref保留，不重建worktree或PR。GitHub是实时事实源；源码、范围、权限、真实证据和验收变化时更新。

本阶段落实D121 Gate5，复用D137两合同固定worker、D138完整快照与D139 prepare/publish，不扩大报表、合同数量、分页、读取次数或真实授权。先实现内部一次性协调服务与可检查的只读范围计划；无新HTTP写入口、目标启用、CLI调度或账号/迁移命令。

目标：所有目标在采集前已通过可信Source/SO/账号及fresh权限检查，精确范围计划同时绑定数据库、操作人、目标版本/有效归属和发布代际；错库/换单/旧计划在上游读取前阻断。worker每次最多一次登录、两个已选合同、每合同最多2页/完整两遍；全部原文/行身份和快照验证完成后才允许逐SO发布。来源变化/缺页/混单/旧采集不能进入快照。

两个SO发布分别原子。若第一单已成功、第二单因并发权限/目标变化失败，明确返回部分成功和未发布项，不删除已接受历史、不自动重试或重新采集。该协调计划是操作范围保护，不是用户授权凭证；默认关闭目标与新真实操作独立批准保持。

验证仅合成输入与工具自建一次性PostgreSQL。原Source48b、G5c54、0025、UI及私有真实报告不改；没有凭据、真实上游、真实DB、首绑/激活、宁波18443/18444或部署操作。NETWORK_DEGRADED不自动恢复交付。验收结果待实际运行登记。

## 已执行的工程验证

新22/22和相关172/172通过；包含真实Python进程配FakeTransport→严格原文提取→两遍快照→一次性PG事务→DB-only reader→原UI client parse，0真实HTTP/真实库。typecheck、Server编译、完整源码lint通过。新增提取器两字段类型和测试unknown类型收窄初次失败已修，未跳过断言；原日志保留。

额外处理提交回执丢失：测试实际COMMIT成功后抛连接错误，结果必须UNVERIFIED、含candidateSnapshotId/expectedGeneration，confirmed published=0但unresolved=1，下一项不执行；数据库实际有一份快照。不能把这个0解释为无写入。后续用原GET独立比对候选ID/代际，无法确认则保留现场，不重采或盲推。

默认Browser构建已通过；本轮首次构建发生在已知Phase dirty树，build metadata短a94只代表基线，不拿作精确提交构建证明。完整root/94基线在D141尚未前向绑定时正确报EVIDENCE_WORKTREE_DRIFT；将通过新ID/新blob前向绑定，再运行最终检查，绝不改旧截图或旧证据hash消除失败。

源码checkpoint039e9f5d477c629a3e0134f1db21922aa59300c8/clean，22/172相关及类型/Server编译/完整lint通过。随后以该完整SHA显式构建默认Browser，build20261016-001315、quote/master browser/orderRead disabled，通过。原root891/898、基线88/94为旧决策叶节点漂移，原失败日志保持；冻结controlled-collection-engineering-2026-10-16报告后追加新证据链和能力，再跑最终检查。没有真实运行或Git恢复授权扩大。

## 最终收口（2026-10-16）

源码039e9f5d477c629a3e0134f1db21922aa59300c8、冻结报告499edf5423790392704b35305beb35d13f89790b、新证据/能力绑定9efd500f32f12d5f1a15df0d004a057ac6adb893。最终root898/898、基线94/94通过；精确main守卫PASS（11页/42能力/56累计UI路径），日志outputs/payment-collector-{root-final,baseline-final,bound-guard}.log。172相关、类型/编译/lint及干净默认Browser构建原结果保持。初次失败不覆盖，没有改测试或旧证据消除漂移。

同轮GitHub只读再次确认main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，新分支与PR搜索均空；Native Git并未恢复，不以connector可读冒称交付。Source48b/G5c54原树clean且HEAD不变，原存储a94分支保留；三者均在当前祖先链。UI/0025无增量，所有原真实私有报告不改，0真实HTTP/真实业务库/凭据访问；未合并部署。

最小下一步：获准固定两合同过滤/分页只读核验后使用现有工具，不重做558全量或扩大原额度。成功也不自动接纳/创建SO，后续实际目标须可信来源并另报具体DB、SO、版本、备份、次数/期限与停止方案。当前仅内部协调服务，不称操作CLI/持续调度已上线。提交回执未知时先用原GET核对候选snapshotId/代际，不能以空响应认定无写入或自动重采。
