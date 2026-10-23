# 当前状态：独立 PR120 前移到已合并 #126 的 main

2026-10-23；GitHub main 独立核实为 `e06162c70c9792895c30030216dc8c2a66368069`，对象本地可验证；网络降级状态下未重复 fetch。#126 已经批准并以 merge commit 合并；#127 精确 e2dc2704 三 CI 通过但仍草稿未合并。

当前 `codex/pr120-main-forward` 从上述 main 干净开始，真实双父 H=`5deb87590833de050280f6cfa2163595aaa72511` 保留原 #120 `57daca3d3f23f39f0aafff57502f490206b10084` 的全部提交。仅四处摘要/清单冲突；产品修复仍是原两处：同报价方案不同颜色成交价正确分组，加工订单的报价上下文来源提交与预览统一保护。不新增规则、SQL、依赖或运行配置，不混入累计候选的生产和 Source 功能。原 215 证据/46 能力全部保留，追加 H 两条同路径见证至 217/46；main 的守卫与 134 项测试逐 blob 保持。

新检查点 1b64e27f 的显式 e061 门禁、134 发布守卫及其余 804 源码回归、34 合成数据库/API、6 实际 Chromium 均通过，0 失败/取消/跳过。仓库外精确 Git archive 快照的类型、Server 编译、lint 和 Server 正式构建通过；首轮根工作树类型检查因保留的 ignored 旧构建上下文报 48 错，范围及处理如实保留，未改 tsconfig 或清理旧成果。静态独立复审无 P1/P2。完整新证据见 [阶段任务](tasks/active/pr120-main-forward-2026-10-23.md)，旧日期结果保持原范围。本轮只更新唯一 #120，远端交付及新 CI 尚待核实；不自动合并或关闭。

完整 Goal 仍 active，[累计阶段冻结记录](https://github.com/clearisok/zhixu-erp/blob/7c0c027334e49ae9c3c833f45cc1aeccb05d52e5/docs/tasks/active/candidate-main-forward-2026-10-23.md)保存 7c 的实际 main 整合、Release CI 及固定真实读取边界。该读取额度已用完，不重读。覆盖 v1、关账三项口径、50426 切换及旧资产退役仍待明确决定，不默认。3001、50426、59069、62426 及所有旧环境/卷/账号/Browser/工作树继续保护；不部署、真实账号/业务库写入、来源激活或持续调度。

[双方原摘要](tasks/completed/2026-10-23-pr120-main-forward-inputs/)按 Git 字节保留，旧日期/源码/结果/限制不删除。
