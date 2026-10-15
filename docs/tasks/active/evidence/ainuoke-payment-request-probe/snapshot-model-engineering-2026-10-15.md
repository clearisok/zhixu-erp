# 6086941完整合同观察模型：合成工程证据

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。起点G5联合c54a2234cfe7920ff4023d9cab56345bde455a7a＋Source48b63101675f7773b63c7d820d4c1d60088ed9b4，复用旧干净树、原ref及私有报告保留。所有输入合成，无真实HTTP、凭据、数据库、Source或部署。GitHub为实时工程事实源；后续源码/测试/授权变化新增前向证据，不覆盖本文件。

## 源码及实际验收

- payment-request-observations.ts：只抽出共用纯投影，旧v1仍固定page1；新显式v2支持两页受检精确字符串，真实page进入行trace/captureId。旧首页schema/scope、未知/精度/币种证据边界保持。
- payment-request-snapshot.ts：受检页的两遍完整合同校验、账号/逐行合同/三字段见证、完整计数及页序、重复整页/回放/变化/超限拒绝；snapshotId绑定页trace。最早页10分钟时效；scope/时钟变化不能继续当新鲜。
- 不修改采集器范围、HTTP协议、Bridge catalog、真实查询、订单、SQL、UI或金额/单位/齐套计算。不把快照构造当授权或财务分录身份。

实际104/104相关Node通过，包含47原首页probe、13观察、19两合同及25新模型；typecheck、Server build、增量eslint通过。日志outputs/payment-snapshot-related-final.log及payment-snapshot-{typecheck,server-build,lint}-final.log为本机忽略产物。旧114Python不是本轮新执行。新脚本及既有Source CI使用相同合成测试，无秘密或真实环境。

负向实际覆盖：旧首页page2仍拒绝，v1不能冒充合同页；缺/多/乱页、少行、总数/顺序/数值变化、混合同/换账号、见证不符、重复整页/回放、零行未验证、201行不截断、未来/倒退/过期时间、未知字段/伪enabled/非精确number。正向保留127/200行第二页身份、同页真实重复、不同单位、零/空/负调整及超长精确小数；没有求和或自动币种。

原失败不抹去：初轮37/38为回放双页样本先触发时间倒退，修测试为单页独立回放场景，未放宽实现或断言；首次类型检查未收窄Record的两个数组属性，显式unknown[]承接已通过的运行时验证后修复，104及类型/编译复验通过。

## 分维度冻结事实

implemented=yes仅指纯内部完整合同观察模型；isolatedTest=passed-historical为上述合成范围。merged=false：main064e尚无该模型；humanAcceptance=not-run；sourceActivation=not-connected。没有HTTP/API/数据库持久化、有效SO读接线或对账页面，不是正式财务来源激活。

trial18443/preview18444均not-deployed，本轮未观察或修改运行态；清单原source/image元数据仅作其历史身份，不能升级日期当新部署。旧四单2小时窗口已结束，本轮没有恢复。实际真实读取次数已用完，新增两合同请求仍无授权，本文件不能授予许可。

后续必须完成存储/有效SO/fresh权限、真实过滤及分页核验和侧栏独立交付；稳定财务分录/全表汇总、银行实付及容量扩大均不由本纯模型证明。完整root/基线/精确main守卫在证据绑定之后另记，不提前填写PASS。
