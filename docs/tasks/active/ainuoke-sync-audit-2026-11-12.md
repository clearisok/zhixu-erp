# 艾诺科同步审计与暂停恢复（本机开发中）

用户2026-11-12明确要求现有系统设置新增长期同步记录台账，按批次+真实报表审计，修复不必要的长期暂停；不要求演示，不部署staging，不改业务匹配/数量或调度频率。新页面采用用户给出的字段/表格及查询结构，属于本次明确批准的新增系统设置页面。

起始main/origin/main经GitHub只读核实为c5133e9e9e7065dc4fe7672c0c88c75688e0c51f。工作分支feat/ainuoke-sync-audit从该main建立，前向纳入旧分支两个已完成发布文档提交为d4892772、aa60a198；原分支和所有历史保留。开始时干净。之前staging发布结果见material-staging-release-2026-11-12.md，不将本轮开发描述为已部署。

## 已取得的真实暂停证据（只读宁波已有记录，0源站请求）

控制enabled=true，paused_reason=catalog_changed_or_over_limit，heartbeat=2026-11-11T07:52:35.484Z，catalog_failure_count=0，retry_at=null。最后成功目录任务07:37:41–07:37:45Z，620合同，0登录/26报表。随后07:52:23.933–07:52:34.391Z的catalog-contracts捕获失败；其5个任务均保存同一catalogChange：beforeRows=621、afterRows=621、added=0、removed=0、identityChanges=0、scopeChanged=false、changedFields=[hsid]。

原catalog-consistency将未知字段变化与身份/范围等统归复合码；sync-worker因此pauseCapture=true，全局写暂停，runner不能进入只识别明确网络重试耗尽的恢复路径。本次不是已证实的认证拒绝、超1400或网络故障；hsid业务含义未知，不解释成忽略该字段。新候选只允许身份/范围/字段集合均不变的非身份内容差异触发新的完整读取，仍拒绝不一致双遍；新增字段、合同身份/查询范围、账号/权限/证书和未知结果仍保护。已保存hsid-only旧回执可在原周期退避后重新完整读取，不直接发布或清除人工停用状态。本轮不执行staging恢复。

## 实际源清单

注册表server/ainuoke-source/audit-sources.ts来自当前bridge contracts及独立collector：6086103销售合同；6086997销售合同颜色尺码；6087105分色分码；6087050旧面辅料统计；6087051面辅料申购统计-IT；6086405/6086408采购单位核对；6086875/6086354入库单位核对；6086941货款申请；6086979成衣出货登记。6080183为应用systemId，不是报表。没有证明海外应收或外协加工已接入，不新增接口。多余的size_mirrors假设已核实不存在，颜色尺码保存在现有color_mirrors和来源元数据中。

## 当前实现与未完成门禁

新增0058迁移（仅隔离测试库应用），批次/逐表/指纹状态/事件4表；控制和任务事件由原事务触发器持久化，普通HTTP只有GET。AsyncLocalStorage只关联当前任务，真实记录都在数据库；不会用内存代替台账。读取完成保留页原时间，源端修改时间没有证据时null；写入完成只在业务COMMIT确认后由PostgreSQL记录，失联回执不冒称成功。计数基于稳定来源身份与内容版本，不能按GoodsID去重业务交易。无法唯一识别时明确未知。

已接通目录/worker/物料发布及多个旧入口，系统设置页面、筛选、概要、详情、Excel真实导出已实现。仍在完成全部旧入口覆盖、历史记录接入、准确计数/时间及中断恢复核对、暂停回归、UI自动验收与基线证据。未宣布完成，未推送、PR、CI或部署。

初轮类型检查曾通过；后续新增测试存在ExcelJS Buffer类型问题，正在修正。首轮隔离集成已有HTTP/Excel/权限与计数回滚子项通过，但总测试失败：fixture已在初始化完成一次tick，测试再次tick得到idle，断言误设processed；修正后必须重跑，不能将首轮整体写成通过。旧catalog-business-change测试仍断言复合错误码，需按新精确分类前向修订，保留身份/未知元数据不接受的断言。

接力：优先读本文件、CURRENT_STATE及git diff，复用outputs/sync-audit-*.log，不重跑未受影响的旧发布CI，不碰当前63054/63051真实数据或后台服务。完成后更新真实范围、全部测试、代码版本与是否可部署；staging仍M，来源原暂停保留。
