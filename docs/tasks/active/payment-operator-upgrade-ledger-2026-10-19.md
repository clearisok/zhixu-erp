# 财务操作升级测试的分支清单兼容

2026-10-19；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。指定交付119/1ab0d8c0598a4cf270bf2618ece260bcbcbf20f5及117/92623fe652fa9c650bb185a2494907e5d63e03d1、118/e7c8bafdb732827bbcde340bf6f7a3ba3281e071已独立核实。119新三CI SUCCESS，110原三绿；117/118各baseline/team-access SUCCESS，source失败。

## 已确认原因

source run39182637068、39182641231分别在ainuoke-payment-operator.integration.test.ts:275失败。旧断言只列0026/0027，当前Source正确新增0028，G3还新增0029。加工整合测试已列到0030，故本机37命令和新Hosted119均通过；这不能证明上游分支同一测试已通过。两个失败前均通过261完整PG与本轮安全引用检查，后续步骤被跳过。日志保留于outputs/price-coordination-delivery/final-compat-pr{117,118}-source-failure-*.log，不重跑旧失败SHA掩盖。

## 最小修复与安全边界

只修改测试的import与升级清单断言，复用同目录已有migrationFilesAfter(25)。该函数读取人工维护、明确排序的CURRENT_MIGRATION_FILES，不发现生产migration目录或调用runner生成期望，仍逐文件、逐顺序严格比较。旧行inventory哈希、操作命令表为空、二次迁移零应用、旧schema回退拒绝、CLI洁净提交要求及秘密不反射等断言全部保留。没有产品代码、SQL、UI、金额/权限或来源范围变化。

不修改真实账号、现有业务数据库、旧演示、Source读取/绑定/激活、调度、宁波或18443/18444；只使用既有合成fixture、一次性空PG和私有临时文件。不自动追加推送、合并或部署；本轮指定一次119上传已消费。

## Source阶段

从clean feat/order-business-source / 92623fe652fa9c650bb185a2494907e5d63e03d1开始。交付复审的本地文档分支chore/price-coordination-delivery-review-2026-10-19已在10e39c8600570b63d27974a236032574f5e4c970独立提交并通过精确main守卫、94基线；它没有上传，也未引入Source分支代码。

本阶段两个测试行修改后，类型、目标lint、Node编译及21项操作测试通过（工作树dirty，实际CLI子进程正确拒绝dirty，未冒称洁净提交的durable readback）。先保存独立checkpoint，再在clean状态重跑21项以验证实际读回。Source和G3需各自核实尚未到达的工作流尾部，不能只依靠119结果。日志前缀outputs/price-coordination-delivery/source-ledger-*。
