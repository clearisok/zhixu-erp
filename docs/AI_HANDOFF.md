# 接力：Issue174技术方案v1，禁止直接实施

2026-11-24；main设计基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**。用户附件只批准设计及必要只读核对；[原文](tasks/active/issue174-design-request-2026-11-24.md)、[完整方案](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)、[Issue174](https://github.com/clearisok/zhixu-erp/issues/174)。Open/Design/P0，保留规则已批准但任何A–F代码/SQL/迁移/清理/配置/部署/暂停恢复都未批准；不重复询问保留期限，也不自行进入Ready。

branch chore/issue174-storage-design，起点游离10b9a7d8且clean，GitHub API读main精确一致。起始fetch连接失败→NETWORK_DEGRADED，不能重试同通道或自动执行恢复命令，不用文件API伪造commit送达。完成本地设计checkpoint与Issue回填；精确远端HEAD未核实前PR为pending。最终commit/恢复命令在最终Issue评论与工具回执，避免文件自引用hash循环。下一执行者先读最新Issue/用户决定，不把当前设计当实施授权。

沿用原调查12.336GB/145表/636订单；本轮仅补引用、角色和故障有界只读核查，没有重跑体积调查/全量去重。方案四种新增职责（共享正文、逻辑引用pins、incident、90天汇总/容量），目录复用0055；无变化不建业务版本、freshness与版本创建分离；E1无损compact与E2期限主动放弃分开；独立资源演练，原盘39.7GB不可假定足够。95%和1–2GB待实测。

现场既存catalog_diagnostic_write_failed，heartbeat 11-24 11:16:20.855北京；原码可能归并DB或回调错误，不能据此吞错/恢复。Staging调查app标签a0a9c78c（PR172）、未合并备份PR173 da1c2653，未来候选需整合已批准有效整改而非直接覆盖。引用保护必须包含material_arrival_plans FK、历史JSON、生命周期run、幂等/未知/在途及目录chunks JSON边。运维PG连接为superuser，应用身份隔离尚未验证，TTL apply保持禁用。

本轮仅文档及release manifest基线/新版本证据：旧冻结ID/hash逐项保留，业务输入/决策新blob前向supersedes；无截图hash/能力状态/UI变动。共享依赖目录只读使用，当前工作树node_modules junction指向锁文件SHA256一致的ui165-staging-acceptance依赖，没有安装或修改共享包。最终检查须为精确10b9a7d8的release guard＋基线回归、文档链接/diff；不运行或声称通过未来迁移/业务测试。

[上轮摘要原件](tasks/completed/2026-11-24-before-issue174-storage-design/README.md)、[Git协议](tasks/active/git-delivery-resilience.md)。原库、对象、备份、受控配置未改，无新源站请求，不合并任何PR或部署Production。
