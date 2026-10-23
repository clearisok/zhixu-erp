# CI 与 Codex 成本控制：评估，不改变质量门槛

2026-10-23；用户确认已解决GitHub Actions计费限制并设每月USD5预算。
这是用户确认，未访问账单或用付费运行验证。此前零steps的账单拒绝仍为历史事实。
不批量rerun旧失败、不反复dispatch；本地完成相关检查，集中交付，重要阶段/准备合并时
才安排必要完整CI。每Gate本地commit/接力继续保留，不把每个小commit都推远端。

## 本轮已核实

检查范围仅五份`.github/workflows`及`package.json`，工程源848acfc7，main基线
`d1dd4f0fcf9992d5c055c7b67b6832b635485680`，无新全仓扫描。

| 工作流 | 当前触发 | 并发/缓存 | 超时 |
| --- | --- | --- | --- |
| Release baseline | PR到main、手动 | 无concurrency、setup-node无npm cache | 15分钟 |
| First team access | PR到main、手动 | 无concurrency、setup-node无npm cache | 20分钟 |
| Ainuoke server source | PR到main、手动 | 无concurrency、setup-node无npm cache | 30分钟 |
| Deploy Production | 仅手动 | 生产组串行、取消关闭 | 本轮未调整 |
| Runner Smoke Test | 仅手动 | 本轮未调整 | 本轮未调整 |

**没有发现Push与PR双触发。** 不为解决不存在的重复事件另改触发器。三个验证工作流
对所有PR运行；草稿也未设置跳过。新验证引用单独push、没有对应新PR时，这五份
当前定义不会因此自动运行；不能把这个事实泛化为其他仓库或未来workflow。

三份验证各自`npm ci`，没有依赖下载缓存。Team与Source各自编译Server/构建Server UI；
Team显式运行的browser-session-e2e、commercial-rbac、quote-cost-security三份集成测试，
也被Source的`test:postgres`包含。确认存在重复覆盖，但尚未量化耗时；不能直接删测试，
两个job的初始化和权限验证上下文需要保留或证明等价。

## 推荐顺序

1. **低风险第一步**：三个验证工作流使用各自workflow+PR/ref的concurrency组，只对PR
   取消过时运行；手动重要验收和现有生产串行保护保持。setup-node增加npm下载缓存，
   以package-lock为依赖键；继续`npm ci`，不缓存数据库、秘密或运行时业务数据。
   不变job/check名称、测试命令、权限、断言和原15/20/30分钟限制。
2. **第二步另评估**：在下一次重要阶段取得一份真实步骤耗时后，建立测试所有权清单，
   集中重复的Server编译与公共集成覆盖；现有独立新库/权限/Browser与Server检查语义
   必须保持。跨job共享构建须绑定完整commit/authority，不能用旧artifact伪装新构建。
3. **按范围选择以后再做**：先核实required checks及完整依赖映射，再选择重型job。
   权限、迁移、共享API、构建/路由或未知范围默认完整验证；文档也保留release guard。
   不直接给required workflow加paths过滤，避免检查永久pending；不把未选用的测试标成
   实际运行通过。合并前必须取得对应最终SHA必要完整检查。

GitHub官方支持[条件并发取消](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
和[依赖下载缓存](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)。
本轮只完成评估，**未修改任何workflow，也未rerun/dispatch CI**。

## 当前任务的资源边界

沿用已成功的产品/UI/数据库历史验证，说明原source和本轮差异；不为更新状态文档重跑
全项目或重建同一产品镜像。新增0044非空恢复必须实际验证，Windows长argv只修测试
传输；Docker地址池耗尽已确认，只释放本轮有证据的停止自有容器/空网络，保留卷和
备份后用同一代码/镜像复验一次成功，不扩大到旧环境或无限重试。

最终发布回归与精确main/HEAD源码证据门禁属于必要收口，按一次稳定候选运行；
网络或新失败只处理直接受影响项。不得将未运行、失败或取消说成通过。
不承诺固定节省百分比或USD5足够覆盖任意次数完整CI，实际用量尚未读取。

## 后续实际发现：手动验证不能替代PR必需检查

同日后续仅对合并链下一候选#123@cb1658派发一次team、source、baseline的
workflow_dispatch，三个运行39978341735/39979170713/39979177113均success。
实际head-check-runs有这三份新成功；PR rollup却只认原pull_request计费失败，仍FAILURE。
[GitHub官方](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
明确手动事件的checks不计入PR required checks。选择手动事件没有达到补齐PR检查的目的，
不能写成PR全绿或以它绕过合并门槛。原成功/失败和事件均保留，未改状态。

为避免立即付两遍相同测试的费用，本轮停止再派CI。以后准备合并的必要检查必须在
正确PR事件运行，不能为替代失败检查而先dispatch整套；手动事件只用于明确需要的
独立工程验证，不能冒称满足PR保护。原PR head/base或构建输入变动时再按范围决定
必要重验；其他PR和已经通过的同源测试不批量重跑。本片新构建门禁只做本地验证。
