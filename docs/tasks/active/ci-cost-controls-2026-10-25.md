# GitHub Actions 成本控制：保留检查门槛

2026-10-25；branch codex/ci-cost-controls-main-9d65 从本轮独立API核实的main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf干净建立。本阶段是用户成本优化策略的实施：先评估，再在不关闭重要检查的前提下减少浪费。不是业务Server模块、环境切换或Git认证修复。旧分支b611/7da和全部成果保留。

## 评估与选择

三条必要工作流目前均为pull_request/main及显式workflow_dispatch，没有push+PR双触发。原先没有并发分组和npm下载缓存。暂不引入paths过滤、跳过测试或减少超时，因为必需检查不能因无job结论而被绕过，权限/schema/基线变化仍需完整门槛；目前没有足够量测证明哪些测试可删减。

本次每工作流只新增六行：

- 按workflow、event和PR号分组；同一PR的后续运行取消旧运行。非PR使用独立run_id，手动运行彼此不排队/取消；条件cancel-in-progress仅在pull_request为真。不加入head SHA，否则无法替换过时PR运行。
- 在原SHA固定的setup-node v4中启用cache:npm、cache-dependency-path:package-lock.json。缓存npm全局下载数据，不复用node_modules、构建、DB、测试报告或来源原文；仍执行原npm ci --ignore-scripts --no-audit --no-fund。

三条检查名称baseline/team-access/source、PR/main事件、所有步骤/命令/env、Node24、固定actions SHA、contents:read、fetch-depth:0/persist-credentials:false和15/20/20分钟超时保持。没有自动dispatch、批量rerun或新push触发。其余Deploy Production/Runner Smoke Test仍只允许显式workflow_dispatch，未改其文件；生产部署原组zhixu-production/cancel=false保持，不会落入这些ci分组。

## 依据与实际验证

按[GitHub并发文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)使用workflow级concurrency及条件取消；按[精确setup-node action输入](https://github.com/actions/setup-node/blob/49933ea5288caeca8642d1e84afbd3f7d6820020/action.yml)和[v4缓存说明](https://github.com/actions/setup-node/blob/v4/docs/advanced-usage.md)配置原action，不升级依赖/运行时。

本地使用已锁定的现有js-yaml 4.1.1，没有安装：三份YAML均可解析，逐字段删除这两项新增后与精确main结构完全相同；删除新增文本后恢复原YAML逐字节LF内容。六个分组输入样例覆盖同PR更新、不同workflow/PR与手动run独立。原7/8/8步完整保留，未加入if/continue-on-error、未改锁文件或任何测试命令。记录在outputs/ci-cost-controls-20261025/policy-checks.json。

以上是本地语法/策略验证，不能证明GitHub已实际命中缓存、节省多少费用或执行过取消。Hosted运行0，手动dispatch/rerun0，push0；实际效果待唯一PR必要CI首次运行观察，不为测缓存额外付费重跑。

最终源码checkpoint、独立复审和精确main守卫的实际终态由outputs/ci-cost-controls-20261025/final-checkpoint.json及final-guard.json记录，必须核对同一完整HEAD/base。缺回执不视为通过；相同HEAD已成功的结果复用，不为更新说明再次运行。

## 交付与完整Goal

当前Git STOP仍保留，不能以本阶段静态PASS或已通过PR129为其他分支上传授权。PR129具体合并确认已单独发出，未答复不视为许可；不合并其他PR，不改认证、TLS或共享Git配置。

此CI分支只基于main，不携带b611/7da累计业务或改变475/66证据；这里保留实际main的230证据/46能力对象及截图/运行时，只有比较baseline/核实时点前移。没有应用/SQL/UI/权限/公式变化，无需重跑其旧业务/浏览器套件。必要发布守卫按当前base运行；134及Hosted三检查在真实PR交付门禁执行，不能把本阶段当正式交付PASS。

完整G1–G8/R继续：b611c61f65227113b6203d23a1a0fe46cce4537b保存最新完成证据审查；可用git show该commit读取docs/tasks/active/server-convergence-readiness-2026-10-25.md。该轮证实62426健康但8175构建落后main、50426无监听且原因未知、3001保留；没有业务行/ledger复查。7da954545bd9b720bfc28edbd313bc387dd5c195保存当前成衣工具最终工程。它们未因切到独立CI分支被删除或部署。

真实Source额度/target启用、关账三问、可见coverageV2、62426/50426替换及旧资产退役仍独立待决。无真实凭据/Source/账号业务库/卷/容器/部署操作，Goal不因CI支持工作完成而完成。
