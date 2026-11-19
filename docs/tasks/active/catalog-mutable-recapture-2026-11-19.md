# 6086103 mutable field recovery — Issue157

2026-11-19，用户明确批准代码、隔离测试和PR；不得合并、部署或解除真实Staging暂停。Refs [Issue157](https://github.com/clearisok/zhixu-erp/issues/157)。基线main `1ab40fd39b035e471f5557903c026dd36d3bab8e`，分支`fix/catalog-mutable-recapture`，起始工作树clean，未改其他工作。远端fetch已核实；开放PR136是独立Git工具任务。

历史事实：11:02:45北京时间，batch `cc1cacad-0de3-46f6-807a-3778b9d586dc`，630行/13页，两遍added/removed/identityChanges均0、scopeChanged=false、changedFields=[Price]。失败原行没有持久化，不能恢复具体合同、价格、存在性或类型变化。旧比较器同schema Price值差走non-identity分支；Price出现/消失走identity/scope分支。不能据此断言历史一定是字段缺失。

实施契约：身份id/BillNo来自映射与数据库绑定唯一约束；InsideOrderNo原保护不放宽。七个已有可变字段加Price允许重采；仅既有hsid大小写变体保留窄例外，未知字段和结构严格阻断。Price仅分类，不回写、舍入、换算或用作Quote商业价。

重采复用持久任务1/5分钟退避、最多3次总采集（初次+两次重采）。异常页优先读取并作为本次全新before的一部分，其余页全部新读，再执行details/完整after；定向页单独不授权发布，绝不拼旧页或接受最后一次读数。原每次56/80报表、4000行、180秒预算不扩大；定向页不重复计数；与新的before页逐字节绑定，预算不扩大。第三次仍不稳定返回mutable_field_unstable，保留旧成功，不发布该任务；周期目录沿原目录周期退避。当前自动合同任务全部需要新完整6086103；独立合同只有自己的新完整采集通过才能继续，不能绕开目录用旧数据。

0059只新增append-only诊断表，保存逐字段存在性/类型/原值/哈希/合同/前后页、源采集时刻、真实请求时间（不可获取为null）、重试与决定；定向页保留安全业务投影和全行/响应哈希。未知字段/姓名原值不记录；价格与合同可定位，仅现有受控DB运维权限，无公开新API。失败主回执保留diagnosticsPersisted，写诊断失败不替换主错误且阻止自动再采。

Gate1：分类、真实SDK定向读协议、现有队列/目录接线；30/30定向测试、根typecheck、server build通过。尚须隔离PostgreSQL完整状态流转、全部回归、lint/build/基线、远端交付及PR。真实Staging未操作，现有暂停/112失败/259到期的历史读证不能冒称当前新采样。

Gate2：独立Docker Desktop Linux PostgreSQL四项端到端4/4，通过真实SDK合成HTTP传输、真实迁移/队列/事务/审计和快照head验证：Price出现不全局暂停、另一合同自己的新完整证据成功、定向页后完整重采成功、三次持续变化明确阻断、目录入口一致、诊断存储失败不覆盖主错/不发布。首轮2项失败为固定测试now早于Python新fetchedAt，运行时正确拒绝source_stale_or_invalid；只修正合成测试时钟后4/4通过。Python全部210/210，IPC新增流转通过，lint通过。旧未知结果、分页/认证/新增/删除等现有集成回归及最终全套检查继续中。

版本/快照机制：当前SDK固定getReportObjAndData请求契约仅有已验证报表/分页/过滤条件，没有经过验证的源端版本号、快照token或一致性参数。未声称源端不支持；本轮不猜参数或访问真实ERP，仍以严格完整双遍证明为准。JSON数字的词法小数位在既有解析后不再可恢复；字符串原始精度保留，数值不自行舍入。

部署后受控恢复设计（本轮不执行）：保留暂停/旧回执；新完整6086103双遍、分页与Price稳定证据；其他报表健康；DB/migration0059/认证/管理员/清理/租约/未知结果检查；通过正式Gate后Supervisor启动及真实新心跳。旧Price聚合错误不足以自动清暂停；需审查后的受控来源恢复操作。到期队列使用现有去重、独占worker lease、批量/并发限制和30分钟策略，不手动造259任务。回滚只回退应用组件并保留0059表与证据，不执行破坏性down migration。

Gate3回归校正：完整目录套件初轮100项有4项失败（新增0059的升级清单1项、旧合成collector未实现新定向页协议2项，以及错误扩大单合同耗尽暂停范围1项）。保留原D183/D194：单合同mutable_field_unstable保留失败、不全局暂停；别的任务须自己的全新完整证据。周期目录沿原三次突发→一个目录周期退避，非直接恢复发布。已校正夹具并新增周期目录完整状态测试；旧测试虚拟时钟与新诊断校验使用同一注入clock。最终全套重跑中。新before优先读取异常页、补齐其他全新页，与完整after逐字节相同才发布；没有历史页复用，630行13页仍26请求、1400行仍56请求，避免额外读取挤占原预算。

依赖审计：高频catalog-contracts（6086103→6087105→6087050或6087051/单位6086405/6086408/6086875/6086354）以及bound/selected材料入口都需完整目录。独立货款6086941和成衣出运6086979使用其自身显式授权/绑定/目标/完整性回执，不由本轮创建自动任务、不把它们加入合同队列或修改其保护。已读成功资料仍可只读展示，但从不作为新的发布证据。未知提交结果和身份/范围/分页/认证的全局阻断不放宽。

根npm test1026/1026、release-baseline182/182及显式基线guard PASS对应不可变3f83c611b12d9ac54726d0db8e5b2310d6f6f8b6，Linux隔离无网络容器，锁文件hash与本地一致；后续源代码修正另由新定向/集成及最终CI验证，不将旧SHA测试冒作新HEAD。typecheck、lint、前后端build已通过，最终源代码更新后复核继续。

Gate4：同样全量1026/182/guard在e97c32fb4ebe09ae5ae80b206cb04926a55ce997再次PASS；目录101/101、审计/恢复24/24、Python210/210、typecheck/lint/前后端build通过。最后源码复核发现真正的Python整数/float JSON拼写指纹差异（1/1.0在Node均为number 1），仅对已确认可变字段内有限安全整数float的指纹规范化；原values、page hash、旧回执不改，未知/身份字段不处理。这一补充通过真实SDK14/14、Python全211/211及隔离PG五项完整流转5/5；数字持续变化用number而非仅存在性变化模拟，before/after类型均number并保留原值。最终冻结源码全量再验收继续。

## 回归覆盖索引

| 用户项 | 证据测试 | 验证边界 |
| --- | --- | --- |
| 1 Price不变 | catalog-mutable-recapture.test.ts | 原数值/字符串原值不改，稳定完整快照 |
| 2 正常数值变 | 同上value；PG numeric三次 | mutable分支，非identity |
| 3/4 字段出现/消失 | 同上appearance/disappearance；PG保全重采 | exists原状态及页/合同可定位 |
| 5/6 null/空串 | 同上null/to-null/empty | 不当成0，不混同缺失 |
| 7 类型变化 | 同上type | string与number保留区别 |
| 8 同值格式 | 同上format/decimals、actual SDK spelling | 字符串格式重采；JSON同数值不制造身份变化 |
| 9 三次仍变 | ainuoke-catalog-mutable.integration.test.ts | 630/13页，实际number持续变化，有限失败保全 |
| 10 稳定身份变 | catalog-business-change.test.ts、sync-stop集成 | id/BillNo/关联/未知结构严格阻断 |
| 11/12 新增/删除 | catalog-business-change及sync-resilience集成 | 不发布不一致目录，完整新证据才可再评估 |
| 13/14 漏页/重复页 | catalog-mutable-recapture及selected-source验证 | 分页不完整不发布 |
| 15 HTTP200/isOk=false | test_catalog_recapture.py、sync-audit/stop集成 | 业务失败非HTTP成功 |
| 16 超时 | test_catalog_recapture.py、sync-resilience集成 | 有界退避，旧成功不变 |
| 17/18 重采成功/失败 | PG五项完整流转、真实SDK/IPC | 先定向新before，再完整after；不取最后一遍 |
| 19/20 旧成功/不部分发布 | PG失败前后head/run/hash、目录profile指针 | 拒绝批次不更新业务事实 |
| 21 独立任务 | PG independent fresh capture、local-transport | 必须自身新完整证据，不借旧目录；目录周期退避 |
| 22 未知结果 | catalog-followup crashed worker、sync-stop集成 | unknown保持人工核对，不盲目重提 |

本轮没有读取真实ERP作故障注入，也没有真实Staging DB/worker/cron/配置操作。0059只在自有一次性PG执行。后续恢复不得拿本地合成测试冒充真实来源证据。

## 最终工程交付（Draft PR158）

[PR158](https://github.com/clearisok/zhixu-erp/pull/158)，Refs Issue157，保持Draft/Open，不合并或部署。完整冻结73384534ed555f72348d9188f27fa8c780d67bc8的最终复验：npm test1026/1026、release-baseline182/182、显式基线guard PASS（0 UI文件）、test:ainuoke-catalog102/102、Python全211/211、审计/恢复24/24；真实SDK14/14、隔离PG五项完整流转5/5属于上述相关套件，不重复相加。typecheck、lint、server build及frontend build均通过。根测试/基线在无网络只读Linux Docker、当前独立Git副本运行；PG真实迁移/事务/队列/审计在自有一次性Docker PostgreSQL16，SDK源站为内存合成HTTP，不访问实际艾诺科。

首轮GitHub Source运行44503495524失败为公共显式迁移测试清单遗漏0059，定位current-migration-ledger-fixture.ts；新增确切0059条目，不从生产目录动态推导清单、不减少数据保全或SQL断言。补清单后本地test:ainuoke-server-source20通过/1 Linux-only CLI在Windows跳过，最终HEAD由Actions独立验证。原7338 baseline已SUCCESS；其余旧SHA状态不能冒作最后提交的CI。最后Git增量仅公共测试清单及交付记录，运行源码不变。

回滚具体限制：migration-runner.verifyAppliedMigrations拒绝目录中不存在的已应用版本。因此原0058镜像不能直接连接升级后账本；后续真实部署前须在正式发布机制中构建/审核含0059清单的兼容回滚候选，并隔离验证。若未准备，不部署；若运行故障则停止候选Worker、保留0059/失败回执/新数据并安全暂停，禁止删schema_migrations条目、drop诊断表或破坏性降级。本轮未构建/部署真实发布镜像，未执行真实迁移。

后续真实恢复顺序：用户审查并另行批准→核对实际发布SHA、镜像/collector/executor/Policy/目标身份及兼容回滚→0059正式迁移及健康→保留旧paused_reason和原故障审计→受控取得6086103全新双遍/分页/Price稳定证据，核对其他实际依赖报表→对旧聚合暂停执行正式预览、精确reviewHash和获批恢复操作，保留原事件→正式Recovery Gate→Supervisor正常启动/真实新PG心跳→核对实际到期集合、去重/租约/未知结果/并发限制后沿现有30分钟策略自然调度。不能把此前259视作当前固定数量，不能人工补造全部任务、直接SQL清暂停或假造成功。

修改范围：catalog-consistency/catalog比较与类型诊断；catalog-diagnostics及0059持久化；selected-source-once/session-collector/sync-diagnostics与Python契约/会话/SDK采集；sync-worker/catalog-capture及原sync-queue/sync-recovery的有界处理；公共/定向测试和package CI入口；业务/feature/决策/发布证据与接力文档。无前端页面、计算价、合同匹配、定时频率、Supervisor/备份执行器或真实配置改动。
