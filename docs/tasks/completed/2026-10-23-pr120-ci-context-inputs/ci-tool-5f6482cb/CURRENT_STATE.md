# 当前状态：CI 实际 PR 合并基线修复

2026-10-23；已核实 main `e06162c70c9792895c30030216dc8c2a66368069`，#126 获单独批准并已合并。#127 精确 e2dc2704 三 CI 通过，仍为草稿，不自动合并。

原 #120 已非强制前移至 `e872472f380262ad3dfc486e38a0d815bcec43a9`，remote ref、PR head 与 tree 均独立核实，冲突解除。其新 134+804 源码、34 DB/API、6 Chromium、干净快照类型/lint/Server 构建通过；First team / Source 两项 CI 已 success。Release CI 39889936426 的末步失败：实际 checkout993c5949 父提交为 [e061,e872]，事件 base.sha 却仍996。原失败不覆盖；不能以旧CI或本地PASS替代新CI。

当前独立 `codex/release-pr-base-context` 从精确 main 干净建立，只修工作流比较上下文。解析器核对 PR 事件/ref/编号、检出SHA、恰好双父和第二父匹配，第一父为冻结基线；异常拒绝，不回退旧payload或清单自报base。原守卫及134项测试逐blob保持，无业务、SQL、UI、权限或Source代码。首轮发布实际117项中15项因接力文档未写完整基线失败，证据保留。源码9b1d0560和状态检查点628f5951重新完成134发布、19解析器、显式e061门禁、语法/lint及YAML检查，全部通过。213证据/46能力不变，六份归档核实，独立静态复审无P1/P2。远端和新CI待收口，见[任务](tasks/active/release-pr-base-context-2026-10-23.md)；不把本地PASS写为已送达。

完整Goal active，累计7c与固定Source观察见[冻结记录](https://github.com/clearisok/zhixu-erp/blob/7c0c027334e49ae9c3c833f45cc1aeccb05d52e5/docs/tasks/active/candidate-main-forward-2026-10-23.md)，不表示已合并/部署。固定读取额度已用完；覆盖v1、关账三问和50426切换/退役不默认。保护3001、50426及所有旧入口、卷、工作树、账号和Browser数据。无真实读取、绑定、激活、调度或部署。
