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

## 2026-10-20 18:20 恢复：依赖已绿，6A纯契约

前述c6失败及准备状态保留为发生时记录，由本节前向更新。Gate5最终 `5464aca3582bbec13b056727b7dc3bd8b938cb72` 已由一次正常push交付并经独立GitHub API核实。该精确提交的新Source [39405202505](https://github.com/clearisok/zhixu-erp/actions/runs/39405202505)、Team [39405206974](https://github.com/clearisok/zhixu-erp/actions/runs/39405206974)、Baseline [39405211718](https://github.com/clearisok/zhixu-erp/actions/runs/39405211718) 均completed/success；未用旧目标绿灯替代。main再次独立核实仍 `996dfedc12da3527343cd3ff2aa5eea35497e10e`。

本分支保留准备184b110e，并以显式merge `251287b943df4e240467c51dc56844d6ee79729a` 整合已验收5464历史，无冲突或继承用户dirty。修改前登记仅两个实现owner未跟踪契约文件；共享摘要修改前逐字、逐SHA256存档于 `completed/2026-10-20-gate6-inputs/reference-fix-5464aca3/`。

本小阶段仅新增 `server/production-resources/contract.ts` 及其测试：四类显式输入、服务端身份与版本边界、真实日期、非空唯一工作日/例外日、Unicode、非有限值、稀疏数组及伪服务端字段拒绝。生产组排序保留小数；外发厂不强加地点/日历；没有Browser默认资料、成本或关账币种。技术上限明确拒绝而非截断：1000例外、3650提前天数、排序绝对值10亿。

本阶段实际执行：纯契约8/8（369.9008ms）、全量typecheck、Node编译、两精确路径lint通过；独立审查无阻塞。尚无新数据库表、资源API、权限命令、事务幂等、CAS、资源关系查询或UI，不能据此标记资源能力完成，也未声称重跑完整项目/数据库/浏览器。下一步6A后台再依次验证这些边界，随后复用既有表单。保留旧45/44/2验收缺口、62426原镜像与全部真实操作限制。

收口再次实际执行纯契约8/8（308.0259ms），精确main源码/证据守卫PASS（11页/48能力/41继承UI路径，无新增UI），显式发布基线116/116（160044.8728ms）；无失败、取消或跳过。该基线不替代资源DB/API/浏览器验收。当前小阶段独立commit后继续6A后台，不创建累计重复PR。
