# G5 可信订单创建报价：当前main依赖上的本地合流

2026-10-25，root唯一writer、既有独立reviewer只读。实际API核实main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf未变，独立branch codex/order-context-main-9d65从main干净建立，再显式FF到4B 9907a2f3cc87ef4d6896e46aaed994d557ba3fdd，普通merge原G5终态 530203b32aa9b237c4b81be285e91be40d4e990e，保留原历史，不rebase/squash。仅三份共享摘要和manifest冲突，无业务/UI/SQL代码冲突。

## 已批准范围与真实代码

D147/G5与原D149：合同首次“维护来源”可进入原new页，服务端从稳定有效SO/保存合同读取可证明款号、精确数量及交期，不猜master ID。用户明确创建经销草稿，复用原编号/writer/Editor、actor/request、审计和receipt；0033只追加不可变创建参考，不自动创建SO、采用商业价或写Source/执行事实，同一报价仍可服务其他订单。加工、完成/取消、历史alias、已采用商业依据订单不能由此换绑。普通D102默认创建hash/行为不变，未知结果只核对原GET，刷新不重POST，旧session/layout回复不污染新身份。

代码/SQL/API与原测试已沿实际路径检查；0033、完整引用指纹/升级前可选表与同一事务保护一起继承。当前只合流Git文件，不运行SQL或升级任何现有数据库；此步不是4C维护交期、资源生产或关账。

## 既有验收按精确源码复用

预览及最终非docs必须逐blob等于冻结 68a38b6bfb0785cc6019381f095660b38cf8fbf7；包括UI、Server、SQL、package/lock、脚本、类型与测试输入。原规范archive SHA256 48eff4868a2f0051578665b65fb8932fb0976f99ab9408f7e6dda90295577722已重新核对，原日志摘要与回执一致。复用原typecheck23501ms、lint37797ms、Node编译9609ms/import1496ms、68项创建/API/引用回归、811根、before2/after9/相关107浏览器与双模式构建/产物；没有将这些记为本轮新运行。

[原53c9冻结证明](../completed/2026-10-24-order-context-quote-engineering.md)保留完整范围、before渲染6ef/后台68a、after68a、六宽工程观察、首次enabled单击、七PNG和两个几何JSON。Browser唯一users modulepreload提示与前序失败边界保持；不把截图/测试宣称用户接受。本轮无需重建或新截图。原发布134属于61e5643、原811属于68a，不冒称当前完整945重跑。

manifest以共同19c做三方合流，严格保留两父251与258的每个旧对象，证据并集262/48；已有页面/运行/CSS/路由策略只接受可证明的单侧变化，同ID冲突即停。保留原47能力，第48项沿原实现/隔离状态，不提高merged/deployed/humanAccepted。当前六路径V1仅校准实际main与阶段链接，[旧V1归档](../completed/2026-10-25-order-context-input-state/README.md)保留。

最终双父、冲突清零、完整非docs等价、证据并集、独立复审与精确main守卫由 outputs/order-context-staging-20261025 的同HEAD终态核对，未有回执不算PASS。未来真正PR交付仍保留当前base的134及三必要CI；本轮Hosted0，不借旧134跳过新交付门槛。

## 保护与完整Goal

PR129仍唯一草稿且原三项CI通过，具体merge仍待用户答复；本候选明确依赖未合并导航与本地4A/4B。Git exit1原因UNRESOLVED，STOP未解除，不push/ref/PR/HostedCI/merge main，不更改认证或共享配置。真实Source额度、target启用、关账三问、coverage V2、入口切换/用户接受和旧资产退役仍独立待决。

9907a2保留4B，74c94a保留4A，fbfecb保留main镜像8/8与旧50容器/179卷保全，db683保留CI成本控制，b611保留完整就绪审查，7da保留后续累计工程；未因当前切片丢弃、合并或部署。当前候选不包含fbfecb的独立harness修复，不运行旧harness。

无真实凭据/旧私密Source报告读取、真实采集、绑定/激活/调度，没有新运行目标或现有账号/业务库/卷操作。62426仍为原8175，50426无监听的原因仍未知；3001及全部旧入口/备份保持。完整G1–G8/R仍active，当前本地G5不代表来源闭环、部署或用户接受。

## 已批准导航合并后的继续点

PR129已由用户明确批准，以merge commit 869ee84dd0b31de6161011e4aa560678b244a64d合入main；双父9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf+d1917aaf91f6bfde5904e4f49dc1b6fd82599680与tree6f1247dba4c6a3bd3e7077db896ea374f609ab84精确核对，原分支保留，未重跑CI。原9d65是本切片开始的基线，不再称当前main。

独立预审确认业务代码/0033与68a一致，但发现DECISION_LOG两条证据叶尚未闭合（metadata P2），不交付、不冒称守卫通过。先将当前真实9907+530合流冻结为L0，随后以mergeOf记录C闭合两父各自贡献的决策历史，再与新main普通合流W并追加F supersedes C作为真实前向见证。所有262旧对象不改，预计最终264/48；无需更改guard或业务规则。

新main官方签名对象已按完整payload/签名字节与原生Git hash精确核对并只补入本地object；没有Git fetch、ref移动或认证变更。第一次读取辅助程序错误去掉签名末尾换行，hash不符即停且未写对象；离线已有官方对象正控定位后，完整保留签名字节的有界对照通过。GitHub验签valid与本地对象hash核对分开，本地未运行GPG验签；旧Git STOP保持。

L0/P0是有已知P2/旧基线的中间checkpoint，不是发布PASS。最终须按新main重新校准UI记录、双父/证据图与同HEAD精确守卫；本轮不跑已成功的原工程套件或Hosted CI，不操作旧环境/Source/数据库。
