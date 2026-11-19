# 当前：2026-11-19 紧凑业务页面 Staging 待人工验收

核实main基线4a8c9bc24b00983d0d79150349adeed5a333a237；分支feat/compact-business-pages，Refs [Issue155](https://github.com/clearisok/zhixu-erp/issues/155)，[Draft PR156](https://github.com/clearisok/zhixu-erp/pull/156)。用户批准四截图范围、v2废止两列表功能及候选先部署Staging；未批准合并或Production。

实际部署源码90de5b0af2dede0afc820aa1fd38dfe8315e9e7a：移除重复标题/技术栏，原操作迁入顶栏；详情身份整合概况；计算价与真实PV/CCT确认价独立，保留多价/未知/权限。仅退役款式进度列表和风险页，保留共享物料详情、接口与历史。无业务计算/API/SQL/schema变更；后续提交仅交付文档，不冒作实际镜像SHA。

精确候选三项Actions全部SUCCESS：npm test1026/1026、release-baseline182/182、Linux紧凑Chromium9/9，typecheck/lint/前后端两authority构建通过。四桌面尺寸和75/125/150%等效缩放共21组合；补充交期14/14、物料历史9/9、后段业务浏览器43/43通过。文档检查点b7349f1994b5a1cb4a55802c64e71184ffa5e479三项CI也已SUCCESS。早期失败、Windows Chrome退出限制及版本对应关系见[任务](tasks/active/compact-business-pages-2026-11-19.md)，没有将其算PASS。

Staging正式机制仅重建app/gateway/objects-tls；五服务healthy，原database/objects及data/objects/appsecrets/objectsecrets四卷身份/挂载不变，旧镜像和52文件回滚资产保留。23人工表、3账号权限、630订单身份未改。新版本配对备份20261119T041319Z-efa1f646于04:27:55Z BACKUP_VERIFIED，56文件/143表/11对象/3419126585字节dump独立哈希通过；服务恢复、清理证明有效，原B4故障及失败原字节保留。迁移账本BIGINT最高58、57记录；本次无新迁移。

最终公网真实浏览器staging-90de-settled完整退出0：三页×四尺寸12组合，等待真实SO行和API连续空闲，物料摘要终态；真实分页SO-00000630→SO-00000580→原页；原维护/更多弹窗和正常logout通过，0业务写入/0来源刷新。目视复核了真实业务截图。初轮骨架截图已单独限定，不作为完整PASS。Staging现存7条报价只有未确认/全部确认，完整三态与多价案例使用隔离PG合成截图，未向Staging填示例。1366报价保留表内横滚，页面/工作区无横溢；同合成数据表头上移报价86.9px、订单204.9px。

独立风险：发布前03:02:46.56Z原4a Worker因catalog_identity_or_scope_changed停止，enabled=true但paused_reason非空。本任务保留该来源安全暂停，不改心跳/last_run、不补跑、不清旧故障。最终8项真实恢复证据通过，仅admin_not_paused=false阻断，0Worker；39740完成/112失败/0待处理/运行/未知。不能宣称30分钟同步恢复。UI候选已部署，等待用户人工验收，不合并PR。

[当前接力](AI_HANDOFF.md)；[此前main状态](tasks/completed/2026-11-19-before-compact-ui/CURRENT_STATE.md)。
