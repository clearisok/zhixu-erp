# 当前累计Server：43迁移持久化与独立恢复证据

2026-10-26；运行终态2026-10-26T10:26:51.769Z。这是全新合成项目的工程验收，不是main已包含、50426切换、真实Source激活或人工业务接受。

## 精确来源

- 比较main 869ee84dd0b31de6161011e4aa560678b244a64d，本次原生Git三个只读对照再次返回该完整SHA。没有更改代理、TLS、认证或共享Git配置。历史故障和原STOP仍保留；只读恢复不能保证下一次push或解释全部历史根因。
- 实际source S 6d27d1e7fa1079f1830511068ff070791df310ab；tree 358e09269375fd006c0637337a9671366aad0448；双父[c5f994396203803218c5bb853e316cdf761e83ce,38580ae2185cddedb175cdd8fde88fee2eb8443d]，原提交历史保留。
- 全部应用/API/SQL/UI继续8cf667f26f191b0ca1d3b31b423dd293d7f2a5b6；本阶段非docs仅原已审f03 harness和ops README。原144仅属于c1f8e861，原exact-N守卫仅属于c5f99439，不合计为本次运行。

## 实际制品与结果

- 新累计候选镜像zhixu-persistent-cumulative:6d27d1e7-20261026-34ee9055fd；ID sha256:6a30bf2e192a27b090a9444244d4c918e09afc07f5f65df1d5ae672c4c1677be；build ID server-cumulative43-6d27d1e7-20261026-34ee9055fd。标签和编译源为S，不能称main镜像或后续文档R镜像。
- Canonical Git archive SHA256 5a946f277ceda8a6c886b2b4cca77efd79b5a45caf03793c84cd758c39393eaf，2977个blob逐一匹配；43份SQL（最高版本44），原31份字节保持。独立runner同一archive逐2977文件匹配，0 overlay；harness f03ac2adcb7aa27695565ade10c788a070161144。未复制工作树ignored数据、真实env或业务样本。
- 首次且唯一build exit0，74723ms，无timeout/overflow。首次且唯一实际镜像演练8/8，fail/cancelled/skipped均0，332416ms，无timeout/overflow。
- 实际覆盖：fresh schema0、启动前拒绝pending且不自动DDL、显式43迁移初始化及技术白名单/唯一新管理员、TLS/对象存储失败保护、合成Quote/PNG、重启和冷重建、原备份工具、独立DB与对象恢复、篡改/写入者拒绝和原ID/内容保全。没有重置既有账号或导入旧数据。
- 旧50容器的所选身份/镜像/状态/health、179既有卷名单及27网络身份前后无差异；after仍50/179/27。仅成功prepared的本轮合成项目在成功后清理自有卷；旧项目未清理。此比较不是旧业务数据内容审计。

## 限制与后续

8项只证明上面的合成Quote/附件、初始化与恢复链；不替代新增业务域非空恢复、真实Source、浏览器像素、正式部署或人工接受。未新跑业务SQL/API全仓、144、TypeScript全仓、Browser或Python套件；原模块QA仍按各精确source/范围引用。

后续Q只冻结此证明，R只加独立证据/状态说明；不再build或重跑8项，也不把S结果称exact-R运行。最终R的exact-N守卫及独立终审另据实际回执。当前没有push/新PR/Hosted/真实Source/既有账号库卷备份写入；恢复后的精确交付仍须既有工具新head正常预检和独立远端核实，必要PR CI保留，不自动merge。

3001/50426及其他旧体验环境保持；不启用、调度、正式部署、切换或退役。完整G1–G8/R继续：Server关账三项待决、稳定成衣事件/更正、具体真实来源额度/激活、目标人工接受和切换边界未消失。

## 本机原件SHA256

preflight.json：88cab04ca64d8937f5e7aa8dc34f8402844974adead9e2f0eb37a7c4af90209a

build-result.json：48705f100f5dcd3d4fa82ad564462ebc9ca901fade021ca7b32c77af39c735e1

image.json：c12556b9dbd1a4cb142e2f8c7394ccf1ee3e93f40d9ae00216256ff2f9dc0c24

rehearsal-result.json：e80e6c5e559da5d855c01b133e4a8a1bf273c9c16fb2388a5a5a56a66c6c8152

rehearsal.log：3f14a507ea25568cb75c302932aa09017b8a913f88dd78e964e9bbf544b59612

preservation.json：782af37759f71535f4c8a6437de2bc2c7c89a58c7bf074da558e5e3cfb80c94d

native-git-read-recovery.json：de681658e1bebe00ecfeed08efe6cf90e3ae9e3eda0d68dbc15c0b82b3ff2b8f

原件均在outputs/persistent-cumulative-43-20261026，临时日志不上传。[阶段](../active/persistent-cumulative-43-2026-10-26.md)。
