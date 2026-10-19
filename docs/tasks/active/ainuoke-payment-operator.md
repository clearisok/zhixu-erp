# 财务来源受控操作入口

核实2026-10-16；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub是实时事实源；代码/权限/授权/真实验证和交付变化时更新。

## 基线和范围

原ainuoke-live-readiness工作树，干净PR113@3896d66837a25875cf9c364126cfd6c804250b80为父提交，feat/ainuoke-payment-operator独立任务分支；原collector引用保留，不重建工作树或改写历史。该分支依赖PR113及其#109–112/G5累计工程，最终草稿到main必须披露依赖，不能直接当成可合并小补丁。

用户已授权计划工程/隔离测试/独立PR和复审，不授权真实账号、业务数据库、迁移、Source写入/启用或部署。最新两合同真实读取已用完，本Phase不读取凭据文件或艾诺科。历史12/9行/两遍一致证据只供过滤证明，不供过期发布或扩大映射确认。

## 实现阶段

1. 核心：目标只读计划、显式两目标原子启停、持久命令回执和单次采集协调。0026只新增技术表；无自动回填/启用。
2. 私密操作入口已实现：明确action/job/hash/request/deadline；计划、启停、单次采集、只读回执分开，不提供迁移/bootstrap/scheduler或HTTP写入口。完整21项合成/一次性PG通过。
3. 完整隔离回归、前向冻结证据/能力清单/精确发布守卫，安全交付唯一依赖草稿PR、CI和复审；未完成不称已送达/已启用。

## 核心约束

- 启用须重建已有两合同完整过滤报告，与可信SO合同/账号精确匹配；hash不是人类授权或上游签名。停用不要求profile开启/历史绑定健康或重新读取。
- 计划绑定实际数据库及连接主机/端口、操作人、两个目标/归属/版本/代际、证据及请求ID/到期。10分钟内显式启动，执行仍重查全部范围。
- 两目标启停、审计和终态回执同事务。旧enable重放只返历史；停启增加目标版本，不能复活旧金额。
- collect在唯一worker调用前提交started。started不是“正在运行”的证明，也不是可重试lease。终态和started重放均0上游请求；不自动回收/续期。
- claim提交不确定时不调用worker。发布/回执提交不确定保留已知结果并用只读回执及原snapshot候选核对；找不到/过期/关闭不等于从未提交。新一次读取要另有范围授权。
- 原每合同2页/两遍、最多8报表9HTTP180秒不变；不汇总财务数值，不推单位/币种/银行实付，不改CCT或原物料数量。

## 实际验证

第一核心阶段13/13通过：2纯模型＋10个一次性PG子场景及容器父项。覆盖无写入预览、历史证据重建、缺失/伪证明、绑定/权限/版本拒绝、并发启用、停启旧快照隔离、并发/终态不重采、claim/target/terminal三类真实COMMIT后丢回执、SQL终态不可变。typecheck、Server编译、定向lint通过。只在随机zhixu-pg-it容器运行，未触真实库。

最初范围hash验证正确阻断所有启用：实现误把permit.scopeHash通过扩展运算符纳入自身；改为只绑定requestId/expiresAt后13项通过。原失败日志outputs/payment-operator-core-first-20261016.log保留，第二次日志另存。完整项目/94基线/精确main守卫、CLI与最终CI尚待，不冒称全部通过。

## 下一次真实操作前

必须先提交具体隔离DB目标/备份与迁移清单、两个SO/合同、操作人、启停计划、一次采集预算/停止条件及只读回执核对方式，用户明确确认后才执行。当前不能复用已用完的两合同读取许可，不能续旧四单窗口；宁波/18443/18444、真实账号和业务库保持未操作。


## 操作入口与私有配置

`npm run source:ainuoke:payment-operator -- --help`说明参数；入口限定当前干净且已提交的源码checkout，使用tsx，不把旧dist副本当成当前源码。生产HTTP及原scheduler未注册此入口。所有动作必须显式指定action、私有job绝对路径/完整文件SHA256、受保护的Git忽略输出目录和request UUID。计划/写入另给UTC到期时间；写入还须精确scopeHash和`--execute=I_CONFIRM_EXACT_SCOPE`。这些字段是防错条件，不是人类授权。

| 动作 | 上游/数据库行为 |
|---|---|
| `--plan-targets=enable` | 重建历史过滤报告，只读DB，输出两个精确SO/合同及当前版本的私有预览 |
| `--plan-targets=disable` | 不读取过滤报告或凭据，只读DB；profile关闭和历史绑定不阻止停用 |
| `--apply-targets=enable/disable` | 两目标、审计、技术终态回执同事务；不读艾诺科、不发布快照 |
| `--plan-collection=6086941` | 要求精确目标已启用，生成只读采集计划，不读凭据/上游 |
| `--collect-once=6086941` | 先核范围，再由私密进程读取本机文件，提交started后复查范围并最多调用worker一次 |
| `--receipt=6086941` | 只读本操作人的历史技术回执，不读凭据、上游或重新激活目标 |

私有job严格schema为`ainuoke-payment-operator-job.v1`，字段仅`databaseUrl`、`operatorUsername`、`source`、`selection`、`targets`、`verification`。source只包含sourceKey/baseUrl/username/transportPolicy，不能放password；selection复用D137精确两合同/见证模型，targets为S1/S2两个不同SO UUID。verification是受保护报告的path/sha256或null，只有enable需要读取并重建；现有其他工作树的旧报告应先非破坏地复制到本操作树新建受保护目录，保持原SHA，不覆盖原件。

job及过滤原文须在受保护/Git忽略的outputs子目录；DB连接字符串不输出到终端/报告。凭据单独用`--credential-file`本机绝对路径，支持严格UTF8两行“账号：…”/“密码：…”，用户身份须与job一致。不修改现有文件ACL，不记录密码或密码hash。Windows仅允许本人/SYSTEM读取、拒绝reparse；POSIX要求本UID/0600。读取前后核验文件描述符、路径、大小、mtime及硬链接数，job/报告再核完整SHA，非法UTF8、超限或宽权限拒绝。

预览和详细结果仅写新私有报告；终端返回封闭状态、request ID、scopeHash、计数和报告路径/hash，不含SO/合同、来源行、账号或金额。技术终态不表示Source当前仍启用/数据仍新鲜。真实命令需事先明确目标和读写额度；已用完的读取许可不能由新request ID绕过。主入口对不确定/部分成功返回非零状态，不能把进程退出0当成人工业务验收。

## 回退与异常处理

- 不存在持续任务，不新增自动重试；停止调用命令即停止新增采集。若需要隔离正在执行的读取结果，可按明确目标先预览/停用两财务目标，原物料Source不随之关闭；已发生HTTP不会因此被抹去，正在运行的worker仍受180秒预算。
- 新目标版本阻断旧快照继续展示；历史snapshots、heads、审计、命令回执保留。对started/COMMIT不确定先用同一request ID只读查回执；not_found不能证明从未执行。不得删回执、自动回收、用新ID盲重采。
- 部分发布保留首单；先核原candidateSnapshotId/generation与技术回执，不重建或搬移既有事实。
- 0026仅加技术表，但旧checkout的严格migration检查可能拒绝未知版本，不能承诺直接切旧镜像。回退应保留兼容0026的代码/历史并关闭新的操作调用，实际版本兼容和真实迁移另行演练/授权。
- 技术回执不决定SO归属，不承载生产/付款执行流水；实际targets/snapshots/heads继续进入既有归一全量证据，归属变化会让后续coordinator检查失败，不绕过G4审查。


2026-10-16第二阶段：21/21新增模型/文件/真实一次性PG验证通过（outputs/payment-operator-upgrade-final-20261016.log）；112/112原财务回归、261/261完整PostgreSQL通过。非空0025升级仅新增空技术回执表，旧订单/Source/目标/快照/指针/日志全量hash不变，重复迁移不重跑；只含0025文件的旧版本明确拒绝新ledger。主入口实际子进程在dirty checkout正确拒绝；clean checkout成功回执读取留待提交后验证。完整源码lint/类型/Server编译通过。

初次新增“缺迁移”用例的合成合同含小写后缀，先被既有大写合同格式校验阻断；修为合法合成身份后真实到达pending_migrations，验证公共schema仍0表。原错误日志保留。请求回执payload还绑定实际selection/targets/operator和验证文件hash；保持旧scopeHash却改SO也必须冲突，密码不纳入payload以便零凭据回执读取。完整root/94基线/构建/远端CI尚未在本阶段宣称通过。

完整源码6658f0c1d221f581adcc94582bb6538e7654b3c1干净树21/21再验通过，实际源码子进程查询durable receipt成功（不是仅测试注入入口）；默认Browser构建build20261016-122100通过，orderRead仍disabled。冻结operator-engineering-2026-10-16.md后按新ID/新blob绑定，不修改旧证据。

最终本地验收：root898/898、发布基线94/94、精确main064守卫PASS（11页/43能力/56累计UI路径）；新D142决策与工程报告已前向绑定，旧证据/PNG/hash不变。最终commit后再核守卫与精确远端/唯一草稿PR/Hosted CI；这里不提前声明REMOTE PASS。无新真实读取或真实DB/账号/启用/部署。


## PR115 首轮Hosted CI遗漏修复

精确1de59363d4c61959714b6e7e59d69250416f40b4已一次push/独立API核实，创建唯一草稿PR115；到main累计548文件，当前增量相对PR113父3896为28文件，不能据绿灯直接合累计依赖。原Source运行38850983248/job116811905622失败，baseline已绿，原失败保留：[实际日志](https://github.com/clearisok/zhixu-erp/actions/runs/38850983248/job/116811905622)。

原因是server/integration/ainuoke-server-source.integration.test.ts仍将当前ledger数字写死至25，未使用显式维护的CURRENT_MIGRATION_FILES；0026实际已执行，旧expected遗漏。仅该断言改为从独立人工维护的完整文件清单取版本号，不从实际runner/目录推导expected，不减少断言。老1–11历史升级起点和其他固定旧schema测试保留。同类搜索未发现另一处以25为终点的当前ledger数字断言。

本机Source回归20 PASS/1既有Windows平台SKIP（Linux CLI子场景仅在Linux实际执行），fresh-start 7/7，定向lint和类型检查通过。原核心21、财务112、PG261、root898/基线94及6658默认构建是本任务已执行证据，此test/docs修复未改生产文件或这些冻结blob；最终head守卫和三Hosted CI仍须重新核实，不以首轮baseline绿替代。
