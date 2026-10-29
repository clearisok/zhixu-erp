# 关账非金额显示读取：本机工程证明

2026-10-28。branch feat/order-closing-month-plan；clean输入80398cb2e53bfbb7b167a2fd473841d1140789e9，初始源码6791a641527d7ea17e3099068d9e94032659ed8d，修复源码de5f7682b32eb159bdabb824a273a4de4d385ca1。沿用核实main869ee84dd0b31de6161011e4aa560678b244a64d，未fetch；Git/ref STOP原退出1原因仍UNRESOLVED。

## 已验证

- 仅显式GET month-plan?view=display扩展；fresh既有权限、单一REPEATABLE READ READ ONLY、原GET/年度保持，完整颜色/执行方/期间集合没有金额、联系人、备注或写入。模型4/4、客户端2/2，分别713ms/511ms。
- 初始源码的月份接口、年度、执行匹配、Source复核和原客户端回归47/47（57227ms）。修复只涉及新display读取预算，不改这些原入口；没有把复用结果说成在修复SHA重跑。
- 修复源码的owned PostgreSQL/HTTP8/8（10948ms），0失败/取消/跳过：含真实并发快照屏障、不可变名称与当前Source分离、旧执行方/当前候选四元证据、加工/空月份、fresh撤权和重复载荷负控。SQL合法900KB快照10次引用在首次完整facts SELECT前拒绝；9次引用的实际首次载荷仍小于8MiB，但累计标签载荷超限，第二次完整facts读取前拒绝。两阶段共用同一预算，原reader不变。
- 修复源码规范Git archive3214个tracked blob逐一验证，0覆盖、未安装依赖。完整typecheck、lint、前端build及server:build均exit0；runner位于新的D:/zhixu-server-convergence/candidates/closing-display-de5f7682-3a7d42ba26/source，不使用工作树里的ignored冲突测试产物。
- 既有只读reviewer复核80398→6791发现一项P2预算先后顺序问题；再复核精确6791→de5后无剩余P1/P2。本次reviewer只读未运行测试，不冒称全ERP终审。
- 同main源码/证据守卫在checkedHead de5f7682＋working559清单PASS，12页面/68能力/累计84个UI路径，session87480退出0。证明自身尚未冻结时不将该结果叫最终560清单守卫；后者在证明checkpoint后另记。

## 失败、复用及边界

初次PG测试4PASS/2FAIL（含父）错误假定基础资料改名会刷新旧排单快照，原integration.log保留；改为明确更换未开工执行方，未改生产规则。7/7修正结果、8/8首次预算结果（10420ms）与8/8累计预算结果（10948ms）分别保存，不能混用。私密原件在outputs/closing-month-display-read-20261028。

本片不修改发布工具。上一工具source5b9c21547f5c1e48dd467176f79f54a7e25f6e0a的完整168/168仅属[原证明](2026-10-28-release-document-anchor-engineering.md)，不重复运行未变工具测试、不冒称本片新结果。新清单保留原556条，只前向冻结D175/契约/阶段三条为559；本文先checkpoint后再单独冻结，最终同base守卫终态另记。必要远端CI仍未运行：Hosted0、远端写0，PR130未更新，无merge或部署。

没有新正式DOM/布局、schema、Source请求、归属更正写命令、旧Browser/真实业务数据改动。没有重新构建Docker候选或挪用source125的镜像恢复/Chromium证明。运行中容器名称在定向测试前后完全一致，所有新owned测试容器由fixture正常清理；不删除旧卷/备份。

61104合成实机仍运行source4107aea1ebf181265b543ad4c25a8afe1168f886，本片没有替换它。当前选中tab3的关账调整预览保留蓝色外发5件2027-02→2027-10、已保存10件→11月及tab1用户输入。只读确认实际页面和可用确认按钮，未点击保存；不把旧演示说成de5新读取功能的浏览器验收。三处配套UI具体批准、归属恢复、全业务终审、精确远端/必要CI及显式切换仍待，完整Goal未完成。
