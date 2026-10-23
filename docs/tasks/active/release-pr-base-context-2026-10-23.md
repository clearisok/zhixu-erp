# Release CI 的实际 PR 合并基线

## 证据与范围

2026-10-23；main `e06162c70c9792895c30030216dc8c2a66368069` 经GitHub API核实且对象本地可验证，未重复降级fetch。前一PR120检查点 `e872472f380262ad3dfc486e38a0d815bcec43a9` 已精确送达；当前新分支 `codex/release-pr-base-context` 从干净main开始。唯一writer=root，独立reviewer只读。

实际Release运行 [39889936426](https://github.com/clearisok/zhixu-erp/actions/runs/39889936426)末步失败：检出 `993c5949c52f100cc3758b02018aab11a2ac7aa1`，父提交精确[e061,e872]、tree=`0e06a1acd713065afdfad5b8614901f1bdb17c69`，但event和PR REST返回的base.sha仍为996dfedc。guard收到旧base，正确拒绝BASE_SHA_MISMATCH及两条旧侧祖先关系。当前main API仍e061，产品树与e872相同。不能把本例扩大为所有GitHub事件都有问题。

[GitHub官方文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)说明默认pull_request checkout为PR合并提交；本修复只取实际验证的冻结合并上下文，不联网取浮动base，不修改原guard。#127网络预检工具保持独立；#126已合并历史不重写。

## 实现

新增只读本地解析器：验证pull_request事件、PR编号和merge ref；HEAD精确等于CHECKOUT_SHA；只有两个父，第二父等于event PRhead完整SHA；两个父对象必须可读且为commit。输出第一父作为比较基线，安全日志记录event旧base与差异。缺字段、缺对象、单/多父、head漂移或身份不符一律拒绝，不能回退旧payload、manifest或默认检查。

workflow_dispatch保持原默认命令，未知事件拒绝。权限、fetch-depth、checkout及guard源码/134回归均保持原样。新解析器19项合成与临时真实Git/CLI检查通过，4625.6548ms；完整发布及最终门禁尚待执行。无业务、SQL、UI、运行配置或Source范围增加。

源码 checkpoint `856947574be89b79fa39033f30632f1aeb63bdb5` 的解析器19项再次通过（6971.1204ms）。首轮精确门禁及完整134回归因AI_HANDOFF只写缩写、未包含清单完整基线而失败；原日志保留为 `release-first-85694757.log`，不能声称首轮通过。随后只补全该文档基线，并在解析器的Git子进程设置 `GIT_NO_LAZY_FETCH=1`，使缺对象时不触发promisor远端补取（[Git官方定义](https://git-scm.com/docs/git#Documentation/git.txt-GITNOLAZYFETCH)）；不改共享Git配置。新checkpoint与重跑结果继续记录，原guard不变。

## 验证与交付边界

完整测试、最终精确HEAD、远端和新CI逐步记录。本机日志在ignored `outputs/release-pr-base-context-20261023/`，原失败与两份前摘要[按Git字节保留](../completed/2026-10-23-pr-base-context-inputs/)。仅更新本切片，先交付唯一草稿PR，再把相同原始修复提交前向整合到受影响原PR；不复制各自业务代码。若main再前移，重新核实真实main和各侧H见证，不能把旧e061见证当新基线。

不自动merge/close、不部署/切换、无真实Source读取/账号/业务库操作；不改共享Git/TLS/代理/认证，不安装依赖。完整Goal与用户待决边界保持。
