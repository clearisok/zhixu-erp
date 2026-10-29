# Gate8B证据修订与原件范围澄清

2026-10-27；本页追加事实，不覆盖旧证明或修改业务源码。

## 无效修订候选

候选R bcab6ce3c56a89c54ef3628634450d7cdcf16fa1 的两条修订 closing-commands-d163-server_closing-20261027、closing-commands-d163-business_rules-20261027 追溯到分支独立根，实际main 869ee84dd0b31de6161011e4aa560678b244a64d没有这两个路径记录；按现有anchoredRevision规则不能作为修订接受。它们尚未通过精确守卫，现永久退休，不能复用ID。原517清单Git历史、完整SHA、hash和两条逐字对象保存在[候选原对象](2026-10-27-closing-rejected-evidence-candidates.json)。原513条合法证据及其余本阶段合法记录逐字保留；未放宽任何守卫、重写旧记录或修改Git历史。

旧SERVER_CLOSING.md/BUSINESS_RULES精确恢复Gate8A冻结blob；新[Gate8B契约](../../features/SERVER_CLOSING_COMMANDS.md)用独立实质路径和新根。D163在合法decision链前向接续当前状态。D162业务规则、0045和全部Server源码不变。[原冻结工程证明](2026-10-27-server-closing-commands-engineering.md)保持不变；其旧契约链接现在只表示历史Gate8A，当前功能以新契约为准。

## 测试与原件

原bcab候选的npm run test:release-baseline实际144/144、exit0、405240ms。原包装器仅解析TAP，spec输出计数原为null；原JSON/log不改，按原spec终态另出release-tests-reconciled.json，不把该结果归给新HEAD。新HEAD的精确守卫/受影响发布回归另行记录，当前不提前PASS。106业务检查、811项目和类型/构建结果沿原精确来源复用，没有改变应用或测试blob。

source-corrected.json中继承hashes属于最初e851工作文件，不能冒称S2重新计算的hash；两个真实Git归档分别逐blob核对。artifact-notes.json追加精确initial/current Git blob SHA256映射，实际仅历史测试收窄和AI_HANDOFF不同，未改原元数据。

最初大数预期常量、备注范围断言的失败仅有原工具终端记录/接力，本机未保存完整raw；不能补造原log。预算测试误读错误封装与初次canonical类型失败有完整本机raw。原工程证明“原始结果保留”应按上述来源理解，不能理解为四项均有本机完整raw。

本机outputs/server-closing-commands-20261026：artifact-notes.json SHA256 110b5cf770c3b9d2a753b537324fdb7baa7330f2bd32c6820da466667eb470f5；release-tests-reconciled.json SHA256 4608ff745be7fad1a66a9ddb960d81fed2055fefa45ba6186c60c526df579a5b；原release log SHA256 4b664d786d796ed1e72dcbac580803d7456ce81f1894207f7223771e8856af2d。原件不覆盖，缺失raw明确保留为缺失。

## 边界

应用源码S2 1e6b21f72ab4c6adbca6ce5ffd36cc85019ae4df；初始S e85107cc6f663f74ede421a1e59e703e8dd2310b。本次只做文档/清单修复，不新增业务/schema/UI/来源范围。无Git/ref写、Hosted CI、真实Source/激活、现有业务库、合并、部署、切换或退役。STOP根因仍UNRESOLVED，全G1–G8/R active。独立审查者只读审查、未运行测试。
