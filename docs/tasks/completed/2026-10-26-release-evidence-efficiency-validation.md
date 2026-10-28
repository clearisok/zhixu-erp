# 当前累计Server的发布回归与输入效率证据

2026-10-26；实际回归终态2026-10-26T09:57:31.988Z。工程、远端、运行、来源和人工接受分别记录。

## 精确输入

- main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T08:25:23.082Z独立API核实；本阶段未刷新原生Git。
- 本轮完整发布源码S：c1f8e861f6491026c4943f498554256a640bd609；tree dd16cc9a10355aba31a8977091de333d346db23c；父a7783eab61b0dd192599e901c6588b17e75ffc20。
- 起始干净基线968b9e71267363cb7e224324b306c470c8f7a246保留原CI合流S44103291和其901399ms超时；该旧结果没有汇总，不是134通过。
- 应用/API/SQL/UI继续精确8cf667f26f191b0ca1d3b31b423dd293d7f2a5b6。与其相比仅三workflow成本增量和两个测试输入工具文件不同，无新业务规则、SQL或UI。

## 本轮实际验证

1. 精确S唯一执行npm run test:release-baseline：144/144，fail/cancelled/skipped均0，exit0，886968ms，timedOut/overflow均false。运行前后HEAD和manifest稳定且clean。原134项全部保留，新增10项批读取协议和资源边界检查；64MiB唯一内容正边界、同OID别名及超额拒绝实际纳入这次完整运行。
2. S的两项Node语法和两文件ESLint（max-warnings0）通过；AST逐函数核实原validateBaseline、runCheck及单blob读取等8函数未改，原77个test/t.test调用表达式均保留。
3. 原单条诊断84890ms（501串行读取78521ms）和361009ms有界全套诊断保持诊断身份，不算发布PASS；后者完成41顶层/46校验，不能声称已定位原900秒的具体耗尽位置。新test初始化使用两次真实Git批读取、协议/类型/字节边界及显式预算，没有缓存PASS或跨check文件缓存。独立夹具仍复制真实文件，仅父目录创建去重。
4. 复用2026-10-26T08:41:13.569Z的三YAML解析/6分组示例结果；本次核对三workflow的精确规范化SHA256仍与该回执相同，不重跑未改变的策略检查。原检查名称、触发、固定action SHA、完整测试/构建和15/20/20分钟上限保持；只加入同PR过时取消及npm缓存。Hosted0，未测缓存命中、取消效果或美元节省。

## 限制

144是精确S的结果。后续Q仅冻结此证明，R仅追加独立证据和状态说明；不把S144冒称文档/manifest变化后的exact-R重跑。最终R的exact-N门禁和独立终审另按实际回执核定，此文件不预写其PASS。

没有新跑业务SQL/API、TypeScript全仓、应用构建、浏览器像素或Python套件；既有成衣/生产/来源结果只按各原source/范围复用。当前43份迁移的全新本机运行验收尚待执行，旧main31份迁移8/8不替代它。

Push/新PR/Hosted/真实Source/凭据/现有账号/业务库/卷/备份写入0；未合并、启用、调度、正式部署、切换50426或退役。普通PowerShell仍复现同类传输失败，NETWORK_DEGRADED和原STOP保留，不改共享代理/TLS/认证，H0d70授权未消耗。完整G1–G8/R Goal继续，关账三项等业务待决不因本支持性阶段通过而完成。

## 本机原件SHA256

release.json：98cb82362b58d5fb52641d9c93bb0d7f2d6ce2b7885a4ce01f7cff54e8560e9a

release.log：3756e1d7a6b171514a70c37832ac5808bf26986670029276393efb22f9ee455d

quality.json：72e16a9f93d042bdf0dbf664c19b23cc155cc4e3b9a586baf813b12ea71b5d78

validation-start.json：8a0f7ef76da506741622354d796e57eefabd74a642b9dd7ea76d564b880562f6

policy-checks.json：25bd679216ee1a9cf5a66c704af92133e4dbc14715c19b539176be3ad74ab95e

原件保存在outputs/release-evidence-efficiency-20261026；不上传临时日志。[阶段](../active/release-evidence-efficiency-2026-10-26.md)。
