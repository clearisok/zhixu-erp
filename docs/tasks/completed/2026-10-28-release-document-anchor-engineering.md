# 发布守卫新文档修订：工程验收

2026-10-28；branch `feat/order-closing-month-plan`。工具输入为已保护的clean f57945e229414a955723f33ede0749049669e141，沿用核实main869ee84dd0b31de6161011e4aa560678b244a64d；本轮无fetch/远端写。最终工具source5b9c21547f5c1e48dd467176f79f54a7e25f6e0a，完整测试的工作清单为555。工程验收与具体UI批准、实机旧演示、远端交付及正式部署分开。

## 复现、修复与证据

- 原552守卫对BUSINESS_RULES新路径的前向修订错误拒绝：revision/anchor/leaf/drift四错误；实际根4bc68c6ecabcb3acc5541d0c4fc20aa850242ddf、后继b7282f94a89c28d319338279d6475b7439c20edb在同分支，main尚无该路径证据。原日志outputs/closing-support-ui-proposal-20261028/release-guard.log保留，没有改base或删旧ID。
- 红测试使用owned临时真实Git分支/merge/冻结提交复现，1失败、12404ms。第一修复source65bf13e0f30514c4de6e381dfa27448ebc3ea14f，定向12/12（45958ms），加blob负控后完整158/158（449969ms）；只读复审发现两项P2，故这不是最终结果。
- 两项P2：后代借前代锚点绕过自身父见证、前代source缺actual-base下界。真实Git两代未冻结与pre-base blob红测试2/2失败（27964ms），旧逻辑错误返回无错误。source93ed270876dfd052e209f29ad259932bed776456修复，定向23/23（128360ms）、lint与同base精确守卫PASS；后续完整套件获知共享DAG资源P2后主动Ctrl-C退出1，review-full.log保留，不能写成PASS。
- 八层共享菱形DAG的有界provider模型以父清单和祖先关系保留实际merge贡献语义，计数红测试证明共享根访问256次而非1次（6097ms）。最终source5b9c2154以completed最长剩余路径缓存、active-cycle/最长深度和256唯一节点界限修复；计数正控1/1、3752ms，只访问1次。它是模型计数证据，不冒称构造了新的实际Git对象；真实post-base merge由独立Git正控覆盖。
- 553契约冻结1951b8c7f096b5207090e7423711a39c9173cc4a；554冻结19998d269b9545c84648339cf83e4f529ac73141；555前向契约指向最终source。原ID/历史blob、base/merge/截图/批准/能力规则不改。每一代普通修订必须有其自身source唯一直接父中已经提交的完整精确证据；链source在actual-base→parent之间，父清单历史完整保留，真实merge仍走原DAG。

## 最终验证（精确source5b9c2154＋555输入）

- Node语法检查：两项工具/测试通过。
- 最终定向DAG：1/1、3752ms。
- 最终lint：退出0，无输出。
- 最终完整发布回归：168/168、0失败/0取消/0跳过、510297ms，原session80723权威退出0；日志bounded-full.log。没有把source93主动中断的运行拼接为完整结果。
- 最终只读复审：精确source5b9c2154最小增量没有剩余P1/P2；审查了循环检查先于缓存、当前深度＋缓存最长路径、256唯一节点和每checkpoint缓存隔离，未运行测试，仅工具增量，不代表ERP整体复审。
- 最终精确守卫：本证明先提交并冻结后，沿用同一完整main SHA执行；结果另记CURRENT_STATE/AI_HANDOFF及最终metadata，本文不预报未来结果，不更换base或消除历史失败。

## 范围及未验证事项

正式产品DOM/API/SQL/schema没有本片增量，不重跑未变的类型、构建、数据库/镜像恢复。source12520f42的完整非空恢复9/9及同source镜像静态产物＋合成API实际Chromium9/9仍只属于[原证明](2026-10-28-closing-current-image-recovery-engineering.md)，不冒称本片是新产品镜像验收。

61104演示source4107aea1ebf181265b543ad4c25a8afe1168f886保持，浏览器可见，蓝色外发5件2月→10月未保存预览及用户输入不被覆盖。配套Source复核、执行匹配、Quote USD采用三处具体UI仍待已提交草图答复；核心关账页面已批准，不重复征询。新增显示读取缺口与归属漂移恢复未完成的事实保留。

无真实Source/现有账号业务库/Browser存储/旧卷或备份操作；Hosted0、GitHub写0、无PR更新、merge、正式部署、目标切换或资产退役。Git/ref STOP_AUTH_OR_DIVERGENCE原退出1根因UNRESOLVED，PR130仍旧61704afe22fe9fd0ea9f6625c6092fcbb9575dfc。完整Goal继续，不将本工具或草图状态当作全项目完成。

私密原件：outputs/release-post-base-anchor-20261028（red/focused/full、review-red/review-focused/review-full、dag-red/dag-final、bounded-lint/bounded-full及各freeze回执），不上传临时原文或环境信息。真实Gitfixture仅owned临时路径，沿用绝对路径与前缀校验后清理，不删除既有项目资产。
