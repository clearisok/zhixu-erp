# 当前状态：关账核心链修复通过，新同源实机可体验

接续[当前0051镜像恢复](tasks/active/closing-frozen-image-recovery-2026-10-28.md)：clean baseline cf77e1a6，新同源镜像一次构建通过（50迁移/0051，ID ec2987de），未替换62411/61104。只读复审发现catalog恢复/本机daemon预检两项验收缺口，现仅补测试harness和私密执行保护；真实红2FAIL、定向28/28、owned PG1/1及lint/语法通过，原测试cleanup中断和本机读取失败保留。产品、SQL和API不变；测试源码checkpoint后仅做一次完整非空恢复，当前未宣称其通过。

2026-10-28；branch feat/order-closing-month-plan。沿用已核实本地main869ee84dd0b31de6161011e4aa560678b244a64d，未fetch，不称最新main。Git/ref STOP_AUTH_OR_DIVERGENCE原退出1根因未解，本轮远端写/Hosted0；PR130未更新，前次核实head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc。

[核心链终审阶段](tasks/active/closing-chain-correctness-review-2026-10-28.md)发现2P2、0P1，均已实际红测并修复。源码fde8b0f1f467edfc864cbd616756ad1778c9f40e：冻结行只归并实际目标scope，0051保护confirmed/locked月完整行集合；年度完整facts读取前，对全候选按最多live3次/frozen2次保守预留8MiB。非空0050升级11张关账表逐行保持。规范3220blob/0overlay完整type/lint/前后端build通过，相关模型/客户端/API/SQL243/243；显式Server/session/snapshot同源实际Chromium9/9。两项修复组合只读终审无剩余P1/P2，非全ERP终审。详见[工程证明](tasks/completed/2026-10-28-closing-chain-correctness-engineering.md)；工程证明checkpoint dbc969ac12f309b8a9bb98f9a57d0a86b543b0c7后，原560条逐项保持、前向冻结565条；同main精确守卫PASS，checkedHead dbc969ac＋working565（12页面/68能力/84 UI路径，session27311退出0）。最终metadata仅保存结果，不称新源码重新验收。

新实机http://localhost:62411/closing-center?year=2027，source fde8、合成账号closing.editor、新owned临时PG。它是体验实例，不是持久正式目标；独立localhost避免覆盖61104的127.0.0.1会话。旧61104/source4107aea1ebf181265b543ad4c25a8afe1168f886、订单输入/未保存预览及旧服务保持，未重seed、替换或升级。

沿用而不重复的前阶段证据：[D175非金额显示](tasks/completed/2026-10-28-closing-month-display-engineering.md)source de5f7682、PG8/相关47及规范构建、清单560同base守卫PASS；[守卫工具](tasks/completed/2026-10-28-release-document-anchor-engineering.md)source5b9、完整168/168及556守卫PASS；[source125镜像恢复](tasks/completed/2026-10-28-closing-current-image-recovery-engineering.md)非空恢复9/9、实际Chromium9/9。它们不是本片新测试、0051镜像或现有实机源码。

[完整Gate目标](tasks/active/server-convergence-gate0-2026-10-20.md)仍active：三处[具体配套UI](tasks/active/closing-support-interfaces-proposal-2026-10-28.md)待既有问题答复，归属漂移恢复写命令、全业务独立复审、精确远端及必要CI、显式合并/目标切换分别待办。核心关账UI已批准，不能重复问。无真实Source/调度、既有账号业务库/Browser修改、自动合并、正式部署或资产退役；旧环境、卷、备份保护保持。
