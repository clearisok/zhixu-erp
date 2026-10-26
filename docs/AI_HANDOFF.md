# 恢复点：G5决策证据合流与新main前向见证

实际main 869ee84dd0b31de6161011e4aa560678b244a64d；PR129已获用户批准并合并，双父/tree/原分支已核实，未重跑三CI。当前branch codex/order-context-main-9d65，原开始基线9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf，真实9907+530合流准备冻结为L0。

先读[阶段](tasks/active/order-context-main-9d65-2026-10-25.md)和outputs/order-context-staging-20261025：prepared、decision-merge-checkpoint、decision-binding-checkpoint及后续forward/final回执。不存在的回执不算成功。独立预审metadata P2已定位：需C@L0 mergeOf两叶，再真实W=(P0,新main)，F@W supersedes C；所有旧262保留，预计264/48，不改guard。中间checkpoint不是发布PASS。

新main完整官方签名对象精确hash已补本地，见outputs/pr129-authorized-merge-20261026/main-object-cached.json；未Git fetch/ref/auth修改，Git STOP仍保留。原代码/SQL/测试等同68a，原68/811/2/9/107及构建按精确SHA复用，原134归61e，未来真实PR仍需当前base134/必要CI。

不再等待或重复询问PR129合并；该明确授权已完成，未授权其他PR合并。保留旧环境/Source/账号/DB/卷/备份和全部分支。完整Goal继续；后续资源/生产、4C、出货/待决关账不混入当前G5。
