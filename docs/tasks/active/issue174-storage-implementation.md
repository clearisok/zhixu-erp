# Issue174 v2 实施恢复点

2026-11-25；[用户授权](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)只含阶段一/二。当前判断与授权清单见[简明结果](issue174-v2-phase12-results.md)，原逐Gate日期/hash/失败见[归档](../completed/2026-11-25-issue174-engineering-checkpoints/README.md)。

## 代码与本地工程

- Branch `feat/issue174-storage-v2`，起点dee3 clean；main `10b9a7d827e1c09f152ead58c21f26712d49a619`。checkpoint：851750e4共享正文，26d82759维护/迁移/epoch，9a1f7506恢复/冻结证据，9003d844正常运行角色/强内容相等，f43942db目录/规范化减重复，88ddff31周期日志分类，8dfe2fcf可见性减写。完整SHA在Git及报告，均本地提交，未冒称远端。
- Migration0061–0067仅新增正文与每日汇总两表；0001–0060未改。统一publisher/hydrator保留原hash与当次manifest，变化与确认分开；当前body/目录命中仍全值比较。A→B→A、上下文变化、伪同hash异正文、引用和权限保护通过。普通辅助维护独立事务、退避，不解除源站安全暂停。
- `storage-selection.ts`固定schema60/145表 inventory，FK及已知JSON闭包、未知停止；所有正式业务原行用PG JSON文本复制。`storage-conversion.ts`只转换选中证据，原ID/时点/hash不变，NOLOGIN临时表示角色撤销。`storage-verification.ts`145旧表原列SHA多重集合/序列/FK/全部保留来源proof；不以行数代替内容证明。
- `storage-rehearsal-cli.ts`只接受本任务隔离host/数据库，原样恢复证明和全部对象配对是前置；verify另允许精确新恢复容器，select/convert不扩至其他host。`scripts/issue174_storage_restore_verify.py`提供原样核验；`database/operations/issue174_runtime_role.sql`显式目标/事务/NOLOGIN，不载入或生成真实凭据。
- 全源码1026/1026、发布回归182/182、目录106/106、最终目录/删除恢复26/26、存储4/4、合成浏览器9/9；typecheck/lint/前端与后端build、main源码守卫通过。完整回归后守卫/冻结输入未变，后端小改有对应测试。详细日志SHA/代码版本见[脱敏JSON](evidence/issue174-storage-v2-20261125/measurements.json)。

## 隔离演练与证明

任务私有根 `D:\CodexPrivate\issue174-20261124-v2`；ownership.json，label task=issue174-v2。PG16.15两个专属容器/卷，internal网络无外部网关/端口，2CPU/4GiB；Node24受限工具1CPU/2GiB，源码/依赖只读，合成密码，不挂源站recovery凭据。原bundle `20261124T023509Z-089bb129`，manifest SHA `0a2f9c372571ef3e81a1df681fa7b28d5752fb491a1ce4ac193f6466361bb796`，58文件/13对象校验。实际业务原件/私有键清单不进Git。

原样 `issue174_original` 145表全行SHA及5序列通过；backup635订单与后调查636时点不同。选择副本 `issue174_selected_work2_20261124`，2076runs/2078snapshots/1458obs，132表全量原列、13表选中原列验证。617外部archive导入按原配对日志证明，没有observation是旧设计；189未归自动job的旧sourceOnly技术run不冒充自动。普通queued/proven failed精确保留任务/重试闭包，running/unknown整合同hold；旧宽选择partial副本保留，不作为结果。

转换工作库484,244,503 bytes；规范化dump/restore至 `issue174_compact_20261125` 后406,182,935 bytes；另全新容器 `issue174-v2-recovery-20261125` / `issue174_compact_recovered_20261125` 恢复406,125,591 bytes，普通真实LOGIN角色非owner/非superuser，正文删除/触发器/复制参数/SET ROLE维护绕过均拒绝；145表/全部来源/1731目录/5序列/附件再次验证通过。原/新清理开关false，未执行VACUUM FULL或session_replication_role。

Windows旧SQL CRLF不能用于替换源ledger：私有migration-runtime从精确Git blob组装，59旧ledger checksum逐一匹配、66文件max67；不rewrite账本。物化SHA再排序避免解压宽行临时空间；曾取消一次仅自有容器宽排序，保留失败记录。备份/原样/目标/bench均未退役；60GB预算内的采样峰值和文件系统/宿主区别见报告。

离线重放只操作bench_legacy/v2克隆，精确旧dee3和新f439各5较大合同×20轮，完整Worker/校验/发布，input hash相同。0源站请求/0真实Staging写；强制到期/排队仅fixture。新100次业务版本0，增长1.85MB/P95 2.101秒；旧100版本31.88MB/2.332秒。周期目录另20次，实际检查点/完整双遍；最后8d少写仍保持26场景通过。分配受空闲页影响，两轮斜率作情景，不承诺95%/全年固定体积或24h稳态。

## 远端及下一步

一次用户明确批准的dee3 Git安全交付发生uncertain_transport，独立API核验分支不存在；NETWORK_DEGRADED，不重复失败通道，不换认证/关闭TLS或用文件API伪造commit。原文档及工程PR尚未创建；最终安全送达须现有git-delivery.ps1按Worktree/Branch/ExpectedHead完整SHA执行并独立得到DELIVERED_VERIFIED，之后才补PR。原本地dee3文档182回归通过与工程最终1026/182分别记录。

阶段三尚未批准：不切换Staging、不删真实旧历史、不启用清理、不恢复Worker、不退役旧库/备份、不自动merge、不部署Production。必须保留PR172已部署修复和PR173备份改动组合，新停写一致配对备份、资源/3h暂定窗口、非owner应用身份/受管凭据DSN及普通维护保护、Worker暂停原因和两轮自然调度/≥24h验收都要过门禁。开放新写后不回退冻结旧库丢新写。旧7051历史详情投影不在本轮扩展，原页及当前物料保留。
