# Server 收敛 Gate6：资源 → 排单 → 完成

## Baseline and authority

2026-10-20，7bf3唯一实现owner，既有审查者只读；按已批准D147及持续工程授权推进，不扩合并/部署/真实数据。`codex/server-production-resources` 从已独立核实main `996dfedc12da3527343cd3ff2aa5eea35497e10e` 干净创建，显式FF到 Gate5 `c6ca37b2f4b2ea9dc7487647b925b0ffcef98768`，初始工作树/index干净；没有继承用户dirty。三份输入摘要逐字保存于 `completed/2026-10-20-gate6-inputs/source-create-c6ca37b2/`。

Gate5精确c6已由既有工具一次上传并独立GitHub API核实；Baseline39402680845成功，Team39402675944尚在运行。Source39402671214失败：0033的 `quote_creation_order_contexts.sales_order_id` 未纳入归一只读引用清单。新FK被未知引用保护保守阻断，未误判安全或写业务；须先在原Gate5分支补齐引用盘点/合成回归，再重新交付/三CI。当前Gate6仅记录基线和只读评估，尚未实施资源API或UI。

## Approved minimal slices

- 6A：生产日历 → 地点 → 生产组，以及独立外发厂。Server空库不自动Seed，不复用Browser聚合normalize/save；稳定ID、停用而非物理删除，名称可重复。先后端typed表/API/回执，再复用既有表单接线；后台接口存在不表示页面或排单已完成。
- 6B：依赖6A与已有可信订单/交付计划。复用已批准工作日/日产量/交接公式，补真实日期、唯一例外、扫描界限和明确重排预览；不动态覆盖已开工/完成/固定日期历史。
- 6C：生产完成事实独立追加，依赖排单；具体事务/CAS/数量/审计验收另记，不把资源CRUD称生产闭环。
- 物流仓/路线/运输方式后置；关账税率/月目标及CNY销售/USD工价留Gate8，不重标已有RMB字段，不加换汇。

只读证据：Browser repository调用本地初始化/稳定storage；normalize空数组自动补默认日历/地点/宁波，不能搬为Server初始化。`calculateScheduleDates`现有无界循环，零工作日仅UI阻断，Server需前置校验与执行界限；特殊日期每日唯一、真实日期。资源启停不移除历史，组/地点/日历的可用性在新排单时共同检查。内部队列排序与遍历次序存在待6B核对点，不能机械复制算法。

沿用现有权限键，不因新增资源扩大真实账号权限或覆盖数据库角色配置。资源变更需版本、事务、幂等、fresh grants和不可变审计；冻结排单引用具体资源事实，后续资源修改不静默改变已保存计划。实际SQL/API及浏览器验证仅一次性合成库/私有profile，3001/50426/59069/62426和旧卷保留。

## Next

先完成Gate5引用修复和精确CI；本分支是独立本地准备checkpoint，不作为已验收Gate6交付。之后整合经过验收的依赖历史，先实现6A后台，明确未开放路线，再做既有UI接线。完整产品体验前仍须维护旧Quote长验收的过时规则和父级预算；原45/44/2结果不被抹去。
