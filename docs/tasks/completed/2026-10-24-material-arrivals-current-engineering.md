# 当前 Server 人工预计到仓批次后台工程证据

2026-10-24；source `c994eac8aee32f9e6877fa81e65a604376760519`，tree `2916955e902633b5b196aab465826f4ee7610c9c`，实际main比较 `e01a11952b648024c0bd6bf4259de429374981e2`。独立后台切片，不是物料页面或逐批运输闭环，不表示合并、部署、真实来源激活或人工接受。

## 输入和领域边界

从clean83a22eb3继续，原bb0ee176→cbfd22路径中20代码输入一致，README/package按当前基线手工合流、原Source CI只加一条测试调用。原20代码中仅store和容量测试因本轮实测P2增量修复；0039原blob和0034–0038不改。31路径source包括对应feature、V0及状态文档，不整体导入旧分支/清单/未来UI/真实Source探测。

人工ExpectedArrivalBatch/Allocation由物理SO内Canonical物料计划owner保存，多批/部分未安排合法，精确正十进制累计不超需求、不跨单位求和。长期需求UUID/完整身份与各代数量/单位/Source run证据分离，歧义或字段变化保留旧计划并提示，不猜匹配、截断或换算。

D054只采用已持久化明确Hub，保存当时跟进版本/仓快照；换仓不把旧日期变新地点，需显式预览。Source交期、人工预计到仓与实际四流独立，不自动Source批次、不绑定事件、不改订单/排单/执行/报价金额或关账。加工无来源不伪造。

共用已验证Material pipeline和持久化Source reader。新helper在caller事务内读取同一快照，Source profile共享锁先于物理SO，与发布锁序一致；没有HTTP、凭据、Source启用或采集配置改变。fresh order.view/ainuoke.view/style_progress.read/edit，稳定身份、CAS、原actor/request、history和OperationLog同事务。已知拒绝保存422/409回执；可确认提交前错误回滚，连接/COMMIT未知须核对原请求，不声称已回滚。

## 本轮实际检查

canonical archive SHA256 `3c45c607c83f1bb549f0ae446d346bf400b3c99b165c2588bf5dc96cd0e0d773`，复用既有node_modules junction，无安装。PG、Source bundle、用户、会话、仓、订单及Hub跟进均为随机一次性合成夹具；没有访问现有目标。

| 检查 | 结果 | 进程耗时 |
| --- | --- | --- |
| typecheck | PASS | 34192ms |
| server-compile | PASS | 9415ms |
| compiled-app-load | PASS | 2229ms |
| lint | PASS | 52970ms |
| root-nonrelease | 811/811 | 25433ms |
| arrivals-source-and-regression-api | 217/218 | 194379ms |

当前Source/API 217通过、0失败/取消、1既有Windows平台SKIP（218总计，含父节点）；其余列出检查0失败/取消/跳过。跳过的是原ainuoke-server-source.integration.test.ts:277的Linux CLI文件权限/只读check执行用例，guard明确process.platform===win32。本轮未改该用例或cli.ts，不改skip条件、不把它计作PASS；当前新功能/容量/Source读取均已实跑，后续必要Linux CI仍须保留。本次没有为此新增容器环境、安装依赖或重跑已过范围。24个相关单元/SQL/API文件覆盖新owner、现有reader导入调用链、绑定/固定Source、确认/历史/代际、归属和归一引用、订单读取/身份、0038跟进和非空升级。97文件811根与后续发布134分阶段记录；发布与最后精确main守卫尚待，不提前写PASS。Node编译后实际载入app及material-arrivals service，检查运行依赖而非只看类型。

实测GET/preview零注册、无默认仓、严格权限/输入、跨物理SO/物料/单位拒绝、数量变化保留人工值、单位变化先移除旧分配、厂供/歧义排除、Source generation/Hub变更预览失效、丢HTTP回复后按UUID核对、并发首次只一单、profile→SO发布/写入互斥、fresh撤权、pending/unknown只读、审计失败原子性、25条历史锚点、SQL每个中间事件/身份/冻结保护及新五表完整归一指纹。HTTP丢回复不冒称数据库COMMIT确认丢失模拟。

0038→0039非空隔离升级保留全部既有public行、原Source读取、tracking和资源原回执；新五表为空，重复migration幂等、启动verify-only/缺schema失败关闭。未对现有目标执行迁移；没有旧二进制回滚兼容声明。

## 容量P2：真实红绿与邻近正控

原store只检紧凑identity≤8000，SQL检PG jsonb::text≤8192。合法合成StyleColor集合使同身份compact7506/PG8726，整体data仍过24576；真实API红18pass/2fail（含父），21703ms，实际500而非422。修复在任何registry写入前、原SAVEPOINT内批量检PG身份实际字节；8192/24576及0039原SQL保持。

工作态contract/API/升级绿26/26，26430ms，0fail/cancel/skip；不是冻结QA替代。当前source的上述API集合再次执行该案例，拒绝零registry/head/history残留、同原UUID replay和known422，防止未知循环。邻近PG7326身份经真实preview后在明确测试事务内persist及SET CONSTRAINTS ALL IMMEDIATE通过，然后主动ROLLBACK；不能称已提交HTTP成功。原红/绿日志和输入哈希保留ignored outputs/server-material-arrivals-current-20261024。

## 前端复用、复审和交付

唯一app/components/features变化是operation-log模型类型union，V0无视觉差异；同一TypeScript选项transpileModule新旧输出逐字相同（22241字节，SHA256 bebea4cfed4243287a142203881188870d32989f304dd474cfdccbed5cff6dfc）。这只证明该模块emit不变，不能冒称完整新bundle或像素比较。API构造复制已冻结e2cf Server静态产物，原83a/2c286f80浏览器与双Vite结果仅按未变范围复用；本轮没有新Vite、浏览器、截图或人工接受声明。

未改商业价格/生产执行模块不重复其完整套件，不将复用结果计入本轮API数。当前Source CI只加测试调用、不改触发/权限/门槛，无push/Actions；不借#125三CI。

冻结source独立只读静态复审无新增P1/P2，容量P2已关闭；审阅者未代跑测试或网络。proof/manifest和最终终态继续复核。清单只将当前报告/feature与后台能力前向追加，原361证据/54能力/runtime/21routes保留。

网络继承NETWORK_DEGRADED，push0/PR0/Actions0；不逐Gate重复失败通道。没有真实凭据/Source/账号/业务库/卷、目标升级、绑定/激活/调度、自动merge/close/deploy、50426切换或退役；3001/50426/59069/62426、Browser账本、备份和已有结果保持。Goal active，后续0039页面/唯一运输投影、0040/41出货、0042交期和关账仍独立。
