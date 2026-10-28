# 当前累计43迁移持久化候选与隔离恢复验收

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T08:25:23.082Z经独立API核实，原生Git仍未刷新。新分支codex/persistent-cumulative-43-main-869e从N建立、显式快进c5f994396203803218c5bb853e316cdf761e83ce，普通合流原已审持久化harness分支38580ae2185cddedb175cdd8fde88fee2eb8443d，两边原提交和全部保护引用保持。仅四共享文档冲突按当前事实解决，原502证据/66能力和UI记录不变。

## 范围与计划

镜像从本次实际source checkpoint的canonical Git archive单次构建，明确标为未合并累计候选，不能冒称main镜像。43份迁移（最高版本44）只在两个全新、归属可证明且prepared的合成项目中显式初始化；正常启动verify-only。应用/API/SQL/UI源继续8cf，新增仅已审f03 harness和ops说明；原模块QA按各source复用。复用S c1f8e861的144/144与R c5f99439的exact-N守卫，不把它们冒称新harness/镜像结果。原main31迁移8/8仍是历史。

先逐blob校验archive和43SQL、已审harness f03ac2adcb7aa27695565ade10c788a070161144；独立复审后只build一次，运行一次实际镜像8项持久化/TLS/S3/重启/冷重建/备份/独立恢复。成功后仅清理本轮新项目；失败保留自有现场、不自动循环重试。旧容器所选身份/镜像/状态及既有卷/网络名单在前后只读比对，不读旧业务内容、私密config或凭据。

准备时尚未构建镜像、初始化新库或运行8项；当前实际终态见下方，不把原准备计划当结果。结果以outputs/persistent-cumulative-43-20261026为准。原[精确main演练](main-persistent-rehearsal-869e-2026-10-26.md)的source/31/8项结果保持。

## 边界

3001/50426/59069/62426及其他旧入口、账号、库、对象、卷、备份、Browser数据保持；不升级旧库，不读取D:/workspace/ainuoke-key.txt，不登录/采集/绑定/激活/调度真实Source。不合并main、不正式部署、不替换50426或退役。当前NETWORK_DEGRADED及原STOP保持，不重复Git探测/推送，H0d70授权未消耗，Hosted0。完整G1–G8/R继续，关账三项、来源具体授权、人工接受和切换仍待条件。

前阶段policy-checks.json原件位于outputs/ci-cost-main-869e-20261026，另外四份验证原件位于outputs/release-evidence-efficiency-20261026；其五项raw hash均已冻结验证。

[两输入旧状态原文](../completed/2026-10-26-persistent-cumulative-43-input-state/receipt.json)。

实际终态：source 6d27d1e7fa1079f1830511068ff070791df310ab、image sha256:6a30bf2e192a27b090a9444244d4c918e09afc07f5f65df1d5ae672c4c1677be，单次build 74723ms；当前43迁移实际8/8通过，332416ms、无fail/skip/cancel/timeout/overflow，runner0 overlay。旧50/179/27所选元数据前后不变；新自有项目已按harness成功清理，未替换旧入口。[永久证明](../completed/2026-10-26-persistent-cumulative-43-validation.md)冻结raw hash。原生Git三只读当前通过并核实main 869ee84dd0b31de6161011e4aa560678b244a64d，未改共享配置；push/PR/CI尚待最终head交付，不因只读成功宣称永久恢复。

证明由真实Q 1a2a5fa7d699509bd4a81d087d8c07edf296f6e8冻结，R只追加独立根至503证据/66能力；原502和其余manifest/UI字段不变。最终同HEAD守卫/复审以实际回执核定。
