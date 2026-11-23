# 织序 UI 规范审查与整改方案

2026-11-23（Asia/Shanghai），方案 v1。关联 [Issue #165](https://github.com/clearisok/zhixu-erp/issues/165)。当前为审查进行中的本地 checkpoint，尚未完成报告，不是 UI 实施授权。

## 范围与事实来源

用户授权：将 ecceb144 的 AGENTS.md UI 规范增量与本审查报告纳入独立 PR；只改规范文档和报告，不修改 UI、业务逻辑、数据、权限，不合并、不部署。具体整改等待用户批准范围。

本轮 main 通过 GitHub connector 核实为 10b9a7d827e1c09f152ead58c21f26712d49a619，本地对象存在。原工作树 chore/juntao-migration-plan / ecceb144d182fcf88e9b58e5218ba7f11e972ecd 干净并完整保留；新建独立工作树 chore/ui-standards-audit，仅提取 AGENTS.md 的 24 行 UI 规则，不 cherry-pick 含迁移接力的整个提交，不携带均涛迁移方案。

原分支不移动、不覆盖；目标差异仅 AGENTS.md 与本报告。本轮用户仅允许规范和报告，接力/阶段 baseline、验证及交付恢复点集中记在本报告，不改其他共享状态或冻结清单。

源码以本轮 main 为准；浏览器经现有会话只读访问 https://staging.weaveops.top，实际运行标识 0752d64f309d68b6e52afbbd712d28e0d9db9c1e。两者不是同一版本，实机观察只证明当时屏幕，不能宣称所有 main 分支状态已部署。

## 初始盘点

- 全部 app/**/page.tsx 共 44 个，逐一核对页面入口与 authority 选择。
- Server 白名单中实际存在 24 个入口，加白名单外单独处理的 /login 共 25 个；其中 / 是跳转，/quote-center/new 是恢复/新建流程，部分页面另受能力开关、RBAC 或正式业务 ID 限制。
- 其余 19 个旧 Browser/候选入口在当前 Server boundary 被拦截，不能算作当前可用业务页面；后续清单单列。
- app、components、features 共 210 个非测试 TSX 文件纳入静态信号扫描；扫描不是逐文件完整人工验收。重点复核可达分支及其 Foundation/业务组件。
- 已打开真实报价列表、基础资料、资源、设置、权限、订单、排单、关账和日志类入口。正在逐项核对加载完成状态和详情；尚不报告最终实机覆盖数量。
- 不点击新建报价、同步刷新、保存、导入、支付确认、权限变更等可能写入的操作。写入流程仅检查源码与已有规范，实机覆盖缺口另列。

## 验证与交付恢复点（进行中）

本地起点：chore/ui-standards-audit / 10b9a7d827e1c09f152ead58c21f26712d49a619，clean。Git 通道此前因代理不可达进入 NETWORK_DEGRADED；本轮 connector 可读不等于 Git 已恢复，不重试同一失败通道，不通过 GitHub 文件 API 代替原始 Git commit 交付。开放 PR 查重为 #164（LAN）和 #136（Git 工具），不复用无关 PR。新需求 #165 已建立；Project 字段/状态仍待实际核实，不冒称已进入 Ready。

独立工作树已通过离线锁文件安装本地测试依赖，未改 package.json/package-lock.json。精确 main 的发布基线检查及发布回归已启动，结果待记录；无业务构建、数据库或真实采集测试。

本文件后续将补齐逐路由覆盖、逐模块问题证据、争议项、应保留设计、风险/优先级、前十项和分批计划。未完成部分不得对外标记全站审查完成。
