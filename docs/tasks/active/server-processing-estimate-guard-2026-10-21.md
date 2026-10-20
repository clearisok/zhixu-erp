# Server 加工报价 Estimate 命令保护

## Baseline and authority

2026-10-21，root 唯一 writer，沿用已有独立只读 reviewer。
main 独立 GitHub API 核实为 `996dfedc12da3527343cd3ff2aa5eea35497e10e`；
从该基线建立 `codex/server-processing-estimate-guard`，显式仅快进到已独立核实送达的
`933df62646e9507a4e7754a3eba2462eeadf1776`，无继承 dirty。
未 reset/clean/rebase 或修改其他工作树；933d 三份共享摘要按 Git blob 逐字归档于
`../completed/2026-10-21-processing-estimate-inputs/933df626/`。

用户已批准 D-145 加工仅工价与整体 Server 收敛，安全工程交付沿用持续授权。
本切片补齐已有隐藏功能的服务端命令边界，不新增价格系统、费用公式或 Browser 行为，
不依赖 Gate6C 尚待回答的生产权限/产出归属问题。

## Reproduced finding

独立 reviewer 在报价验收维护时指出该接口静态风险。随后用新的 owned disposable PostgreSQL、
合成全权限身份和 loopback HTTP 实际验证：加工当前默认 Revision 的 generate、regenerate、
update、restore、ignore 五种命令均返回200、改变raw Estimate及Quote版本。
同一探针的经销正控200；响应真实省略Estimate并返回restricted，**未发现响应金额泄露**。
原两命令探针用 `=== null` 判断隐藏并不正确，其false不能作为泄露证据；保留原日志，
第二次五命令探针改用 `Object.hasOwn` 已核实字段省略。两次owned cleanup均PASS。

这是当前隐藏快照仍可写的实际缺口，不把D-145原文字面冒称已经逐项禁止五种命令。
新统一限制见 `ESTIMATE_COST.md`；历史通用流程和旧工程结果保留。

## Narrow implementation and checks

- 在既有 `applyEstimateCommand` 克隆、分配身份前检查保存的默认Revision。
  当前加工统一409 `estimate_not_applicable`；请求source/current视图不改变权威。
- 不改服务鉴权/CAS、普通PUT保护、repository、SQL、历史或确认/商业价格。
- 既有Source验收CI显式运行该纯命令单元；API回归继续由原test:postgres执行，不另建workflow。
- 默认经销包含加工历史时仍允许原生命周期，尤其来源PV移除后的独立历史恢复。
- 加工全部五命令拒绝后比较完整raw快照、版本和审计；普通资料保存保留隐藏事实、
  PUT注入继续拒绝，响应字段省略按Object.hasOwn验证。

新增纯命令单元先在未修复源码实际得到7pass/5fail（448.7996ms），五个失败均为缺少预期拒绝；
原成功例保持。随后只补上述三行产品保护，定向PG/HTTP与单元28/28（12302.2841ms）通过。
首次typecheck检出新增测试对QuoteResponseRecord union未缩窄；补运行时assert.ok缩窄后，
类型、Node编译及全仓lint通过。未改产品类型或放宽断言；下一步冻结完整定向与项目/基线复核，
源码冻结 `8ce227d05d9719653638493386693af819ef6827`；其后仅CI接线checkpoint
`db037290da1e74fbb67d3de190af0059c68419a3` 未改产品。该冻结实际结果：
定向28/28（17964.9544ms）、全项目927/927（256163.0327ms）、显式基线116/116
（247111.8648ms）、完整Quote Chromium87/87（134483.4707ms），全部0失败/取消/跳过。
前端仍919643，后台为新保护源码；Node实际编译app导入PASS，不冒称新前端构建或部署。
独立静态复审截至8ce未发现阻断，确认默认类型/历史边界、raw保护和三归档逐字一致；
reviewer没有代跑测试。上述为本地工程结果，最终main996守卫/远端交付及新CI仍分开核实。
一次性库探针原JSON及红/后续验证日志在ignored outputs保留，不上传raw业务数据。

## Delivery and boundaries

输入933d已一次上传并独立API exact；工具STOP标签与remoteSha矛盾的原回执和独立证明均保留，
没有再次push，不宣称永久网络修复。仅三项验收CI各调度一次：Source39472329558实际失败，
Team39472336074与Baseline39472342830已success，同完整SHA、attempt1；未重启任何旧run。
Source停在原quote-order-context-ui首case目标按钮文案超时，后六case通过，新Quote87和Python未执行。
本机自然8/8（19072.6607ms）未复现，不能据此说CI已修；受控最后一个真实候选GET释放，
按钮首次启用时仅点击一次，实际仍留订单页并出现父导航拦截，且创建POST为0。
这是已复现的同步窗口；原CI没有地址/提示证据，不能确定该次CI根因完全相同。后续独立UI修复，
不混入本切片三行API保护或借延长超时/重复点击消除失败。
本切片尚未交付。#120–127原头不动，不创建重复累计业务PR、不merge/close/deploy。
不安装依赖、不变共享Git/TLS/proxy/auth，不升级3001/50426/59069/62426或旧卷/工作树/Browser，
不改真实账号/业务库，不新增艾诺科读取/绑定/激活/调度或退役。Goal保持active。
