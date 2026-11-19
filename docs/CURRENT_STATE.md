# 当前：6086103可变字段恢复修复，Draft PR待审查

2026-11-19，main基线1ab40fd39b035e471f5557903c026dd36d3bab8e；分支fix/catalog-mutable-recapture，[Draft PR158](https://github.com/clearisok/zhixu-erp/pull/158)，Refs [Issue157](https://github.com/clearisok/zhixu-erp/issues/157)。用户仅授权代码、隔离测试和PR；不合并、不部署、不解除真实Staging暂停。

Price及已确认可变字段单独分类，原存在性/类型/值保留；定向异常页属于全新before，其他页及完整after全部新读，相同完整证据才发布。复用1/5分钟、总计三次采集及原56/80请求、4000行、180秒预算。单合同耗尽保留mutable_field_unstable失败，其他合同也须新完整证据；周期目录沿原目录周期退避，身份/范围/分页/认证/unknown仍严格阻断。已确认可变字段的安全整数float指纹兼容JSON 1/1.0，原values/page hash不改，不改商业价格或合同匹配。

新增0059 append-only逐字段/定向页/决定诊断，不回填历史、不改旧失败/成功。历史失败原Price行未保存，不能确定具体合同/真实差异类型。诊断仅现有受控DB运维读取，未新增日志UI。旧镜像缺0059清单会被迁移校验拒绝；实际部署前必须准备兼容回滚候选，保留0059及证据，不删除账本/破坏性降级。

完整冻结73384534ed555f72348d9188f27fa8c780d67bc8：npm test1026/1026、release-baseline182/182、显式基线guard PASS（0 UI变更）、目录套件102/102、Python211/211、审计/恢复24/24；真实SDK专项14/14及隔离Docker/PG完整E2E5/5包含在对应套件；typecheck/lint/前后端build通过。首轮GitHub Source CI因本PR漏更新公共显式迁移清单0059失败，已补清单、保留严格断言；本地server-source20通过、1项Linux专用CLI在Windows跳过，等待最终HEAD Actions验证。最后增量仅该测试清单及交付记录，运行源码不变。

本轮未访问真实ERP或读写真实Staging DB/Worker/cron/暂停/心跳/队列；旧112失败/259到期为此前读证，不冒作新实时查询。后续须用户批准、实际版本/Policy/0059一致、新完整目录及其他来源健康、正式来源恢复/Gate/Supervisor/真实心跳后按去重/租约/并发限制自然调度。[完整覆盖、失败历史和恢复设计](tasks/active/catalog-mutable-recapture-2026-11-19.md)；[当前接力](AI_HANDOFF.md)；[此前UI状态](tasks/completed/2026-11-19-before-catalog-recapture/CURRENT_STATE.md)。
