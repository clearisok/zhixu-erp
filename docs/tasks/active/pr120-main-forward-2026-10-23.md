# PR120 main 前移与精确交付

## 范围与基线

2026-10-23；root 唯一 writer，独立 reviewer 只读。从 GitHub API 核实 main `e06162c70c9792895c30030216dc8c2a66368069`，本地对象可验证；未重复降级 Git fetch。原 PR120 `57daca3d3f23f39f0aafff57502f490206b10084`，本阶段新分支 `codex/pr120-main-forward`，开始树干净。合并原 #120 时只有 AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX/baseline 四处冲突。

保留原两处业务修复、两项回归与合成演示工具。保持 SQL、依赖、运行配置不变；原产品与测试 blob 不变，main 守卫与 134 项回归 blob 不变。原证据 215/能力 46 保留，main 的 213 条全部包含。只有原 V1 UI impact 的基线前移，不改路径、级别、审批或历史截图。双方三摘要和原 UI impact 已 [Git 字节归档](../completed/2026-10-23-pr120-main-forward-inputs/)。

## 整合与验证计划

真实 merge H=`5deb87590833de050280f6cfa2163595aaa72511` 已保留两个精确 parent：e061 和 57d。H 后为两个旧侧文档修订追加同路径见证，recorded/rendered 均 H，hash 来自 H 的 LF 文本；只追加到 217/46，旧 215 节点与能力原样保留。原五个产品/回归/演示 blob 精确等于 57d，守卫/134 项测试等于 e061。七份本轮归档与原 Git 字节相同。diff whitespace 只有原 57d 的既有 BUSINESS_RULES 归档 EOF 空行，未为消除提示修改历史。

新源码检查点 `1b64e27f20d105acec2e9c607b7528d9a3dfb41d` 已完成：

- 显式 main e061 门禁 PASS：11 页、46 能力、1 个 UI 文件，errors=[]。
- 完整发布守卫 134/134，441669.465ms；其余源码回归 804/804，21499.2769ms，两组无重叠。均 0 失败、取消或跳过。
- 临时合成 PostgreSQL/API 34/34，45150.3506ms；实际 Chromium 6/6，18255.1926ms，含同方案异价、同价异方案及未知结果恢复。未使用已有业务库、账号或用户浏览器 profile。
- 精确 Git archive 的仓库外新临时源码快照完成 typecheck、Server 编译、lint 及 Server/session/writable/snapshot 正式构建。build-info 完整 gitCommit=1b64e27f；只接既有 node_modules junction，无安装。归档 SHA256=`956c72c95413a37db1169c50600e127d4d6ce776c935fedd8c9e6e3fe79df033`。
- 首轮原工作树 typecheck 失败，48 项错误全部位于保留的 ignored 旧镜像 `outputs/server-current-image-0c.../context`。旧上下文未删未改，也未放宽 tsconfig；以上干净快照检查是另一明确范围，不能把首轮写成通过。

原 2026-10-19 结果仍见 [原任务](price-source-stabilization-2026-10-19.md)。新回执/日志在本机 ignored `outputs/pr120-main-forward-20261023/`，含 merge/witness/archives/QA scope 和终态计数。静态独立复审无 P1/P2；最终文档、远端精确提交及新 CI 继续分别核实，不借旧 CI 作新结果。

## 交付与保护

最终干净 checkpoint 后验证原本地分支仍 57d、未在其他工作树占用，remote 原 PR 也仍同 head。可将原本地分支非强制快进至整合提交，使用既有同名安全工具一次交付并独立核对完整 SHA，再更新唯一 #120 说明并检查新三 CI。无法证明映射/祖先/干净树即停止相关动作。不创建重复 PR，不自动合并或关闭。

完整 Goal 仍 active；[累计候选记录](https://github.com/clearisok/zhixu-erp/blob/7c0c027334e49ae9c3c833f45cc1aeccb05d52e5/docs/tasks/active/candidate-main-forward-2026-10-23.md)是独立冻结事实，不随本分支复制其他业务代码。#126 已合并，#127 已验收仍草稿。固定真实查询额度已消耗，不再读取。所有旧入口、卷、工作树、账号和业务数据保护；不部署、切换、来源激活、调度或退役。

## 第二阶段：共享CI修复的前向整合

原e872精确送达、PR冲突解除，但新Release39889936426使用旧event base=996，实际checkout993父为[e061,e872]。另两CI39889936721/39889936322已success。失败不覆盖。独立PR128的5f6482cb只修CI上下文，134+19本地/门禁与Release/Team CI通过，Source attempt1在Chromium端点就绪前失败，根因未定。当前前向整合该相同原始工具提交，未等同于合并main。双方摘要[逐字保留](../completed/2026-10-23-pr120-ci-context-inputs/)。

K须保留parents=[e872,5f]；原五个产品/测试/演示文件保持57d，新增workflow/解析器/测试保持5f；guard/134测试保持e061。217证据/46能力、旧H见证及V1 UI impact不变，无新产品或Source范围。新组合的134/19和精确main门禁待执行，原应用结果仍属于1b64相同源码。只更新唯一#120，不自动merge/close或部署。

2026-10-23后续CI观察：PR128 Source39893272059 attempt1在第一项私密Chromium端点20秒就绪等待中失败，尚未进入页面断言，实际1项0通过/1失败。Release/Team成功不抵销该失败；原日志保留。其Source workflow、Chromium helper及应用与已成功的e872 Source相同，先做固定SHA/同job的有界核对，不延长超时、不跳过测试、不宣称已三绿。
