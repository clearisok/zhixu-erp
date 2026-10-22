# 到料只读浏览器验收的原子激活

2026-10-22；fix/material-arrival-browser-activation，干净输入c0d87bcd55fbda58db101f46d6e61b07f77db7df，
main独立核实996dfedc12da3527343cd3ff2aa5eea35497e10e。root唯一writer、既有reviewer只读。
本阶段只修复测试harness、补受控浏览器回归和阶段状态，不改变产品/权限/SQL/UI/Source范围。

输入105的Source39689481386在material-arrivals-ui只读角色阶段等待标题超时；Team/Release
success，后续Quote/Python未跑。原日志/失败保留，不能从静态窗口倒推该次CI的真实时序。

已静态核实测试open/openSaved先独立等待enabled、再另一CDP evaluate调用click；实际
Source完成后会queueMicrotask重读arrivals，loading再次禁用按钮。两次evaluate间可发生
正常刷新，disabled原生按钮click不发事件。产品只读权限允许查看，Modal标题仍未改变。

计划在自有合成PG/私密Chromium中保持一个真实arrival GET回复，先证明enabled→loading
和disabled点击无事件，再让新helper等待释放后原子查找/检查connected+enabled并只点击一次。
只轮询尚未发生的激活，不反复点击等标题，不放宽16秒等待，不去掉只读/无Browser/无金额断言。
角色/旧请求/Source失败等原场景仍运行；不操作用户浏览器或既有端口/卷。

上一镜像阶段c0d精确守卫PASS、发布116/116（202484.7174ms）。其一次push STOP原回执保留，
原工具后续DryRun pushes=0 DELIVERED_VERIFIED、远端精确c0d；Release workflow已dispatch一次，
结果待核实。候选镜像105的8/8与41迁移只是独立持久化事实，不受本测试文件修改冒称刷新。

本分支是原收敛验证历史的前向修复引用，不创建重复累计PR，不改变PR120–127。
不merge/close/部署、真实读取/业务库操作；原待答不默认。完整Goal仍active。

## 实际本地验收

源码72d0a0af8302e4aa761d587a3ca786296a23b4c0只改原浏览器测试，独立静态review无P1/P2。
精确Server build server-activation-72d0a0af-20261022（2026-10-22T07:24:50+08:00）完成；
16/16 built浏览器通过（23374.3454ms，无skip）。受控GET将读取2→3，disabled点击0→0，
新helper释放后恰1次enabled/connected点击，只读输入保持禁用、版本仍7。不是倒推历史CI时序。
syntax、全lint、最终typecheck、Node/前端build和main996/head72精确守卫PASS；发布116/116
通过（198257.996ms）。没有重跑项目927/PG270，不复用这些旧计数冒称新验收。

typecheck首轮只因本任务outputs内的精确源码提取副本也被TS glob扫描而失败；2603文件逐一
hash核对原tar后，仅此自有副本移出项目到新私密目录，原tar/image/错误日志保留；不改tsconfig、
依赖或共享环境。后续类型检查通过。完整范围见[工程报告](../completed/2026-10-22-material-arrival-browser-activation-engineering.md)。

上一c0d文档阶段Release39692878584 attempt1 success已独立核实。PR120–127开放草稿heads均
与Gate0原值一致，没有修改PR。本阶段冻结报告、绑定、最终metadata guard/交付及新CI仍待；
原105失败保留，不重发其原workflow或提前宣称最终三CI通过。

报告冻结91c2eafba03e6a3d471add0be76442f5b9804ec8并前向绑定为第268条证据；原267条、
57能力及所有其他manifest字段逐对象不变。独立证据复审无P1/P2；working main996/head91
守卫PASS（11pages/57capabilities/80继承UI paths，errors[]）。后续只有最终metadata提交与
该精确SHA的guard/交付/三CI，不修改报告、不将旧失败改为通过。

## 后续精确交付和CI

最终31cad6f71dced9f1ad399b13dd1b4871d2234abc的main996精确守卫PASS。原一次Execute
返回STOP_AUTH_OR_DIVERGENCE但remoteSha精确F；原stderr未保留，原因unresolved。
后续只读DryRun pushes=0返回DELIVERED_VERIFIED，远端精确F，没有第二次push。
Source39694581228（2026-10-21T23:59:14Z）、Team39694584779、Release39694588911
均attempt1/completed/success；没有重跑旧105失败workflow。

随后获准的一次固定合同工具在candidate阶段失败，0 HTTP/0报表、凭据未读；不算来源过滤通过。
离线定位编码配置深度误拒，转入[独立前向修复](garment-filter-metadata-screening-2026-10-22.md)。
冻结报告保持其当时事实，本任务只追加后续结果。
