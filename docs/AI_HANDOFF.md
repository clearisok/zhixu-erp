# Issue165 批次C3订单、物料、排单与关账10项

2026-11-23；当前main与PR基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**，本轮GitHub核实。已批准38项自动分批，10争议不实施。

[用户批准](tasks/active/ui-standards-approval-2026-11-23.md)、[本批范围/验证](tasks/active/ui-standards-c-operations-2026-11-23.md)、[报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[原索引](tasks/completed/2026-11-23-before-ui-standards/PROJECT_INDEX.md)。

O01–O04、M02–M05、P02、C01已实现，fix/ui-standards-c-operations独立分支，仅本批。最终测试与PR待收口，其他批次不混入。Staging0752原备份恢复门禁阻塞，未切版；Production禁止、不自动合并。

本批typecheck/lint/build、root1028、release182通过；最新compact/物料21通过，关账18/排单37在对应产品构建通过。先修正标题加载位置再重测，原失败保留；Staging原恢复门禁阻塞，未部署。
