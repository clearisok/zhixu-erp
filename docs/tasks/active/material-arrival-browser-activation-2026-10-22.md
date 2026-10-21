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
