# 当前状态：#126 已合并，#127 按真实新 main 前向整合

2026-10-23（Asia/Shanghai）。用户已明确批准只合并 #126 并继续整合 #127；不是其他 PR
合并、部署、切换或真实业务数据操作授权。main 已独立核实为
`e06162c70c9792895c30030216dc8c2a66368069`，两个父节点为原 main996dfedc 和
已验收 #126 head0be89ff9；tree 与该 head 相同，六个原始提交保留，分支未删除。

复用干净 `git-delivery-preflight` 工作树与原 `codex/git-delivery-preflight-fallback`，
输入 `37bd0e1e81810f46c1972f37630dc99b7fc9b18d`。本次使用真实 merge，不 rebase/reset/force。
实际仅四处冲突：CURRENT_STATE、AI_HANDOFF、PROJECT_INDEX、baseline.json。
两侧三摘要逐 Git blob 归档；清单两侧除元数据外完全一致，213 条证据与 46 项能力保持。
仅将清单 baselineSha 对齐新 main；不改旧证据 ID/hash、截图、能力状态或业务规则。
本阶段技术规格与逐项结果见[前向整合任务](tasks/active/pr127-main-forward-2026-10-23.md)。

#127 原有 Git-first / 单次固定 API 预检与单次非强制 push / 独立 postflight 保持；证书、
认证、配置与分歧仍 STOP。原数字120误报和 CDP 只读等待修复仍在原提交，不改应用或权限。
#126 发布守卫及其134项测试从已合并 main 原样继承，不另造检查逻辑。
53 工具、原94发布、9来源/10登录及旧CI的历史结果见[原任务](tasks/active/git-delivery-preflight-fallback-2026-10-20.md)，
不能代替本次实际新基线测试。新本地验收、精确最终提交守卫、远端与三 CI 尚待分别核实。

全项目候选仍留在7bf3，未把累计业务功能复制到工具 PR；#120–125 不因本次操作自动合并。
本轮独立固定 Source 核验已由主控在干净0c工具执行成功，其许可已消费，原文留受保护本机
目录；不属于 #127 功能，不授权再次读取、绑定、激活、调度或业务库写入。
覆盖 v1、关账三问、50426切换及旧资产退役继续待明确决定；Num/outdate已确认。
3001、50426及其他旧入口、账号、Browser、数据库和卷保持；完整 Goal 尚未完成。
