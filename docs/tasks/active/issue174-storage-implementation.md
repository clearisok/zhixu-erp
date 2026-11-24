# Issue174 v2实施恢复点

Refs [Issue174](https://github.com/clearisok/zhixu-erp/issues/174)，[批准转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)。2026-11-24，第一/二阶段已批准，第三阶段未批准。旧摘要原字节见[归档](../completed/2026-11-24-before-issue174-implementation/CURRENT_STATE.md)。

基线main `10b9a7d827e1c09f152ead58c21f26712d49a619`；branch `feat/issue174-storage-v2`，起点`dee3d6800d718d67ac91494ec56c76b89ef11caf` clean。继承文档包含完整v1.1/v2，后者优先；不覆盖其他worktree。源代码/新migration/有意义PG测试及隔离迁移进行中，未提前声明验收通过。

文档提交的一次批准Git交付已执行，uncertain transport，状态LOCAL_PASS_REMOTE_UNVERIFIED，API独立核对目标分支不存在。NETWORK_DEGRADED，不重复push、不换认证或用文件API伪造commit。原文档工作树冻结在dee3，完整`npm run test:release-baseline`182/182通过，1377.3秒；工程最终HEAD仍须自己的门禁。

演练资源：D盘133.5GB可用，60GB新增预算；Docker数据WSL在D盘，PG16.15镜像已缓存。任务私有目录`D:\CodexPrivate\issue174-20261124-v2`，独立容器/volume `issue174-v2-pg-20261124`，label task=issue174-v2，network none，无端口、无源站凭据或Worker，2CPU/4GiB。备份只读挂载，原样恢复库`issue174_original`；不对现有Staging写入。最新成功配对备份20261124T023509Z-089bb129，3,829,641,400 bytes，13对象，58文件hash和manifest `0a2f9c372571ef3e81a1df681fa7b28d5752fb491a1ce4ac193f6466361bb796`匹配。敏感备份/对象/原始业务审计仅在私有目录，不进Git。

待完成：原样恢复逐表/序列/对象验证；保留根＋FK/已知JSON闭包，未知hold；目标选择性迁移/新表示转换；业务和附件等价；同负载增长/同步性能；TTL/汇总/权限/并发/幂等/恢复/历史全部门禁及工程commit、远端状态、PR。实际停机窗口只能由隔离演练测得迁移步骤推算，不冒充已实测Staging停机。

禁止实际Staging切换、删除、自动清理启用、Worker恢复、旧库/备份退役、自动合并及Production部署。原暂停catalog_diagnostic_write_failed保留；普通辅助维护与必要证明失败须区分，不自动解除。
