# Issue174 v2实施恢复点

Refs [Issue174](https://github.com/clearisok/zhixu-erp/issues/174)，[批准转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)。2026-11-24，第一/二阶段已批准，第三阶段未批准。旧摘要原字节见[归档](../completed/2026-11-24-before-issue174-implementation/CURRENT_STATE.md)。

基线main `10b9a7d827e1c09f152ead58c21f26712d49a619`；branch `feat/issue174-storage-v2`，起点`dee3d6800d718d67ac91494ec56c76b89ef11caf` clean。继承文档包含完整v1.1/v2，后者优先；不覆盖其他worktree。源代码/新migration/有意义PG测试及隔离迁移进行中，未提前声明验收通过。

文档提交的一次批准Git交付已执行，uncertain transport，状态LOCAL_PASS_REMOTE_UNVERIFIED，API独立核对目标分支不存在。NETWORK_DEGRADED，不重复push、不换认证或用文件API伪造commit。原文档工作树冻结在dee3，完整`npm run test:release-baseline`182/182通过，1377.3秒；工程最终HEAD仍须自己的门禁。

演练资源：D盘133.5GB可用，60GB新增预算；Docker数据WSL在D盘，PG16.15镜像已缓存。任务私有目录`D:\CodexPrivate\issue174-20261124-v2`，独立容器/volume `issue174-v2-pg-20261124`，label task=issue174-v2，network none，无端口、无源站凭据或Worker，2CPU/4GiB。备份只读挂载，原样恢复库`issue174_original`；不对现有Staging写入。最新成功配对备份20261124T023509Z-089bb129，3,829,641,400 bytes，13对象，58文件hash和manifest `0a2f9c372571ef3e81a1df681fa7b28d5752fb491a1ce4ac193f6466361bb796`匹配。敏感备份/对象/原始业务审计仅在私有目录，不进Git。

待完成：原样恢复逐表/序列/对象验证；保留根＋FK/已知JSON闭包，未知hold；目标选择性迁移/新表示转换；业务和附件等价；同负载增长/同步性能；TTL/汇总/权限/并发/幂等/恢复/历史全部门禁及工程commit、远端状态、PR。实际停机窗口只能由隔离演练测得迁移步骤推算，不冒充已实测Staging停机。

禁止实际Staging切换、删除、自动清理启用、Worker恢复、旧库/备份退役、自动合并及Production部署。原暂停catalog_diagnostic_write_failed保留；普通辅助维护与必要证明失败须区分，不自动解除。

工程checkpoint `851750e496a269726580d4c4f41012e027d1faaa`：共享正文、变化版本/确认分离、差异颜色写；server:build、目录followup16/16、hash/存储3/3。后续新增维护权限使用真实LOGIN非超级用户连接验证，不以superuser的SET ROLE冒充隔离；默认清理关闭、不可变/触发器/复制参数/角色切换拒绝及辅助故障退避已通过单个集成场景，完整TTL/汇总/迁移Gate仍待完成。

迁移工具只接受0060/145表备份副本；正式业务用PostgreSQL原始JSON文本流式复制，避免JS number损失精度；固定JSON/数组引用及FK递归选闭包，未知格式或未解析引用停止。只对选择集合离线转换，专用NOLOGIN临时角色只允许表示字段改变，原ID/时点/旧hash不变；验证后恢复不可变函数并撤销临时角色。不使用session_replication_role、关闭触发器或VACUUM FULL；最终通过规范化dump/restore得到紧凑目标，转换工作副本保留审查。

V1精确路径影响见[记录](../../release/ui-changes/issue174-source-history-epoch-20261124.json)。v2批准的新历史起点语义要求旧时间线不完整可见：原弹窗“逐次查看采集记录”会产生完整历史暗示；调整为“来源变化与必要旧快照”，仅当服务端返回真实epoch时显示起点与此前不完整。现有弹窗、权限、表格、分页与交互不改；不是V2/V3视觉重设计。构建/真实浏览器证据待本候选验证，不冒称已部署或人工接受。

隔离环境后续改为专属Docker internal网络`issue174-v2-internal-20261124`，无外部网关/宿主端口，只连接本任务PG和有限迁移工具；原备份只读，工具不挂载recovery凭据，不启动源站Worker。D盘初始60GB预算继续有效。

2026-11-25：原样恢复完成2963.09秒；145表全部行SHA多重集合相同，序列元数据/值和13附件配对相同，manifest58文件hash全相同。备份635订单，与稍后调查636订单时点不同。原恢复所有权仅在隔离库恢复为NOLOGIN quote_trial，未复制源站登录权限。验证SQL使用物化64字节行hash，取消过一次仅本容器的宽行排序，未改全局配置。

选择2：source_runs2076/73934、material_snapshots2078/74311、observations1458/73127、catalog_runs1731/73419；145表复制219.883秒，post-data原FK恢复通过。首个过宽选择副本保留供审查，不作为结果：queued不意味着全部旧成功记录都需保留，running/unknown仍保守整合同hold；普通失败保留精确任务/重试/已知结果/当前证据。617个external archive导入没有observation行是原设计，必须匹配原归档UUID/hash/sourceRequests=0与发布run配对日志，不能放宽未知缺失。正式业务表全量不改。全部工作副本、证据与备份仅任务私有D盘。
