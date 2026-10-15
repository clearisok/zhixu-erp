# 固定范围货款申请采集协调工程证据

核实2026-10-16；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5（本轮connector核实）。Phase baseline为原clean树/分支a94a7df97ff9b6312cdb9c7990e3e9b32a31c27b；新分支feat/ainuoke-payment-controlled-collector未重建worktree或PR，产品源码提交039e9f5d477c629a3e0134f1db21922aa59300c8。报告在下一checkpoint冻结，manifest按完整Git blob绑定；后续结果只前向记录任务，不覆盖此报告。GitHub是实时事实源。

已确认工程：内部plan只查数据库，固定实际DB身份/连接目标、操作人、来源账号、两个SO和对应合同、目标启用版本、Source链接/原owner/有效归属和预期发布代际。执行须匹配精确scopeHash；该hash不是人类授权、真实过滤验证或目标启用命令。所有目标在唯一worker调用前通过fresh权限/可信绑定；复用现有6086941两合同固定worker/三字段见证、2页×100行/合同、完整两遍、至多8报表/9HTTP、4MiB/响应、16MiB总报表和180秒。无扩大catalog、旧物料scheduler或HTTP/CLI入口。

原JSON经旧严格校验器验证scope、raw SHA、完整页数/数量、返回合同及两遍内容后才提取精确字符串页；两合同的纯快照均验证通过，再复核全范围后逐SO调用旧事务。原单位/币种确认不传播到新capture，Num采购数量与OutStoreNum申请关联物料出运分配数量仍分开；未确认预付、单位、币种继续unknown。不以相同id/完全相同行去重，不求总量/金额，不换汇或认定银行实付；不是物料级匹配，也不改变TotalNum/cgnum/正式齐套。

事务边界明确：单SO快照、指针和审计原子；两SO之间允许部分成功。后一单的目标/权限变更不会删掉首单历史，不自动重试或重采。数据库已经COMMIT而成功回执丢失时，返回UNVERIFIED，逐项带candidateSnapshotId/expectedGeneration；published仅是确认成功计数，unresolved不能解释为零写入。已有DB-only GET可独立对照候选ID/代际；当前为空/过期/关闭或已新代际不能证明从未提交，保留范围计划等待获准核查，禁止盲重放。

实际验证：22/22新增（10纯提取/输入、12含父项的一次性PG协调），相关172/172（原150＋新22）；typecheck、Server编译和完整源码eslint通过。新PG测试从工具创建的loopback/tmpfs库运行，建合成管理员/合同/显式合成目标，结束只清理自有资源。覆盖错scope、SO交换、连接目标元数据变化（模拟而非访问另一真实DB）、旧启用版本、操作人不符、输入异步变化、重复来源行、完整两页、秘密反射、旧捕获/缺页、采集中撤权/停用、不同capture竞争、后项失败、closed错误和COMMIT回执丢失。后者实际先提交再抛错，数据库确有一份快照且回执必须unresolved=1、停止另一单。实际Python子进程仅FakeTransport，9次是模拟尝试计数，不是真实艾诺科访问；同一流程经原DB reader与严格UI client parse。

干净精确提交默认Browser构建039e9f5d477c629a3e0134f1db21922aa59300c8/build20261016-001315通过：quote/master=browser、session、orderRead=disabled。仅candidate构建，不部署或真实激活。前次build20261016-000834发生于已知Phase dirty树，短a94只表示基线，不能当作新源码发布证据。UI文件/截图/0025未改，原D140两种UI各9项及截图仍是其各自SHA的历史证据，本Phase未重跑浏览器像素。

实际失败保留：首轮新提取器页元数据类型与测试known/unknown收窄错误已修；未跳过测试或降低断言。初轮root898中891通过7失败，基线94中88通过6失败，因D141文档已变化而manifest尚绑定旧decisions-payment-read-panel，EVIDENCE_WORKTREE_DRIFT正确阻断。通过新evidence ID/新blob线性前向替代，旧证据/hash/截图不改；最终root、94基线和精确main守卫结果须在任务后续登记，不能用本报告冒称已完成。

公开回执不含真实合同、采购号、原行、金额、账号密码或原异常文本。旧Source48b/G5c54工作树及各阶段ref/私有报告保持；无新增真实读取、凭据访问、真实业务DB、账号、首绑/归一/启用、旧四单窗口或宁波18443/18444/部署操作。原读取额度已耗尽，新的两合同技术核验尚无明确答复。真实过滤/分页、具体SO范围、实际迁移/写入/激活和操作CLI仍有独立Gate；财务申请不作为SO创建来源。

LOCAL ENGINEERING与REMOTE DELIVERY分开：Git原生NETWORK_DEGRADED，未自行恢复或变更认证，无新远端送达/PR/Hosted CI；现有依赖未合并，累计分支只能在依赖对齐后再评审，不建议直接合入main。若继续真实核验，仍须用户明确固定读取范围；若持续采集/写入，另给具体SO、数据库、目标版本、次数/期限、备份和停止方案，不以本报告授权。

本机日志：outputs/payment-collector-{unit-first,integration-first,integration-second,related-final,type-first,type-second,type-third,type-final,lint-first,lint-second,lint-third,full-lint,server-build,root,baseline,browser-build,clean-browser-build}.log；精确默认构建metadata为outputs/payment-collector-clean-build-info.json。所有测试数据均合成，无真实原始财务数据入Git。恢复tasks/active/ainuoke-payment-controlled-collector.md；源码/权限/证据/真实验证变化时只建立新版本。
