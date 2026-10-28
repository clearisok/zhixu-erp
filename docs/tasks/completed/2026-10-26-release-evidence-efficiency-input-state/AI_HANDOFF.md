# 恢复点：CI成本增量与当前累计源码

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T08:25:23.082Z独立API核实，open PR 0。codex/ci-cost-main-869e从N建立后显式快进3851936e2fb8d6e3e95b4d47a3e141687a77555f，普通合流原成本分支db683892e7c90df3ea81c4b8162dd2aa36a3d03a（原base9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf），原提交和29保护引用保持。成衣/生产/来源等累计应用源码仍为8cf667f26f191b0ca1d3b31b423dd293d7f2a5b6，只三workflow增加既有成本策略。

先读[阶段](tasks/active/ci-cost-main-869e-2026-10-26.md)与outputs/ci-cost-main-869e-20261026。仅4共享文档冲突按当前事实解决；三workflow自动合流并用新策略检查验证，原db683和当前应用历史全部保留。

三条必要工作流只加入同PR过时运行取消和npm下载缓存：按workflow/event/PR分组，手动run_id独立，只在PR取消。原pull_request/main与显式workflow_dispatch、检查名称、固定action SHA、contents:read、完整checkout、Node24、npm ci、全部当前测试/构建命令和15/20/20分钟上限保持；没有push重复触发、paths跳过、降低门槛或部署更改。新增成衣三项和此前生产/来源测试步骤完整保留。

全部应用、API、SQL、UI和测试源码继续精确8cf；与其相比仅三份workflow有原成本增量。原501证据/66能力对象、11页/21路由及全部继承UI记录保持，原db683证据/能力是其完整子集；实际普通merge保留两父历史，不制造新revision。原三成衣Gate及更早源码QA继续按各自来源/范围复用。集中验证后新增一份独立路径QA证明至502/66，不修改原证据或能力状态。

当前合流YAML校验去掉两项新增后与3851936e逐字/结构完全相等，并检查6个分组样例；复用既有锁定js-yaml4.1.1，不安装依赖。只在实际source merge S集中跑一次当前发布134；终态后Q冻结精确S/base/计数/时长和边界，R绑定独立证明，再仅运行最终R的exact-N守卫。Q/R仅docs，不把S134冒称exact-R重跑。实际终态以outputs/ci-cost-main-869e-20261026/final.json核定，未来最终PR必要CI仍保留。Hosted0，未实测缓存命中、取消效果或费用节省。

当前实际合流策略校验已通过；最终提交、集中发布回归、精确N守卫和独立复审以outputs/ci-cost-main-869e-20261026/final.json核定，缺终态不记阶段PASS。历史QA与当前验证、远端交付、真实Source激活、运行和人工接受分开记录。

完整G1–G8/R Goal active。后续按累计源码准备受保护的本机候选与当前范围验收；稳定成衣事件/更正、Server关账三项待决、真实来源具体范围/激活、目标切换与人工接受、依赖审计后退役仍分别待条件。可见coverage V2未批准/未实现，不借交期维护批准扩张。

NETWORK_DEGRADED及原Git STOP保留，普通PowerShell三种Git同样exit128/约5.35秒；不重复探测/推送，不改共享代理/TLS/认证，H0d70授权仍未消耗。本阶段Push/新PR/Hosted/真实Source/凭据/账号/现有业务库、卷或备份操作均0，不合并main、启用来源、调度、部署、切换或退役；3001/50426/59069/62426等既有环境和Browser数据保持。

## 2026-10-26实际超时恢复点

2026-10-26T08:59:52.446Z，源码S 44103291bbe974069f3476ee81a39b787db3cdcc的唯一发布回归进程在901399ms触发15分钟上限（exit1、timedOut=true、overflow=false），未取得测试汇总，五项counts均未知；不能称134已通过或把未知补0。S/manifest前后稳定、工作树干净，三份YAML策略校验保持。原release-start.json/release.json/release.log完整保留；本轮Hosted/Push/Source/业务库均0。

runCommand按Windows taskkill /T结束自有进程树；终态后只读进程清单无该测试Node残留（仅本次诊断shell匹配），不重启原会话。先做有界本地耗时定位，再决定必要修复；不直接循环重跑。QA证明Q/R尚未生成、最终守卫尚未执行，当前阶段为LOCAL_POLICY_PASS_RELEASE_PENDING_DIAGNOSIS，完整Goal active。
