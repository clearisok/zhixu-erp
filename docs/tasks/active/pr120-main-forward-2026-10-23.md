# PR120 main 前移与精确交付

## 范围与基线

2026-10-23；root 唯一 writer，独立 reviewer 只读。从 GitHub API 核实 main `e06162c70c9792895c30030216dc8c2a66368069`，本地对象可验证；未重复降级 Git fetch。原 PR120 `57daca3d3f23f39f0aafff57502f490206b10084`，本阶段新分支 `codex/pr120-main-forward`，开始树干净。合并原 #120 时只有 AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX/baseline 四处冲突。

保留原两处业务修复、两项回归与合成演示工具。保持 SQL、依赖、运行配置不变；原产品与测试 blob 不变，main 守卫与 134 项回归 blob 不变。原证据 215/能力 46 保留，main 的 213 条全部包含。只有原 V1 UI impact 的基线前移，不改路径、级别、审批或历史截图。双方三摘要和原 UI impact 已 [Git 字节归档](../completed/2026-10-23-pr120-main-forward-inputs/)。

## 整合与验证计划

真实 merge H=`5deb87590833de050280f6cfa2163595aaa72511` 已保留两个精确 parent：e061 和 57d。H 后为两个旧侧文档修订追加同路径见证，recorded/rendered 均 H，hash 来自 H 的 LF 文本；只追加到 217/46，旧 215 节点与能力原样保留。原五个产品/回归/演示 blob 精确等于 57d，守卫/134 项测试等于 e061。七份本轮归档与原 Git 字节相同。diff whitespace 只有原 57d 的既有 BUSINESS_RULES 归档 EOF 空行，未为消除提示修改历史。

本阶段新验证：精确 main 门禁、完整发布守卫回归、类型/lint及相关加工来源回归；只使用临时合成数据库。新结果未产生前不引用旧 CI 为本轮 PASS。原 2026-10-19 的应用/浏览器/数据库/构建验收仍见 [原任务](price-source-stabilization-2026-10-19.md)。

## 交付与保护

最终干净 checkpoint 后验证原本地分支仍 57d、未在其他工作树占用，remote 原 PR 也仍同 head。可将原本地分支非强制快进至整合提交，使用既有同名安全工具一次交付并独立核对完整 SHA，再更新唯一 #120 说明并检查新三 CI。无法证明映射/祖先/干净树即停止相关动作。不创建重复 PR，不自动合并或关闭。

完整 Goal 仍 active；[累计候选记录](https://github.com/clearisok/zhixu-erp/blob/7c0c027334e49ae9c3c833f45cc1aeccb05d52e5/docs/tasks/active/candidate-main-forward-2026-10-23.md)是独立冻结事实，不随本分支复制其他业务代码。#126 已合并，#127 已验收仍草稿。固定真实查询额度已消耗，不再读取。所有旧入口、卷、工作树、账号和业务数据保护；不部署、切换、来源激活、调度或退役。
