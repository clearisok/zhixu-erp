# 当前状态

核实日期：2026-10-12；GitHub main / 当前任务基线：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e（PR99 已合并）。GitHub 是实时事实源，此文为快照；前序记录保留在 tasks/active/ainuoke-server-source.md 与既有 completed 归档。

- PR97 六角色可信账号管理、PR99 默认关闭的 Server Source 基础能力已合并。真实来源未激活，无本次真实账号、数据库或部署操作。
- PR100 / feat/ainuoke-continuous-material-display 已提交、仍未合并：首次绑定、持续调度、既有页面接线的合成验证见该 PR。本分支来自 main，不把 PR100 能力写成已在当前代码中实现。
- 当前 feat/animated-login：用户要求正式 /login 和有趣动画，仅登录 UI 有范围内改版授权。复用可信会话，安全返回原页、错误/网络重试、密码显隐、响应式与减少动态效果；详见 [功能](features/SERVER_LOGIN.md)、[交付](tasks/active/animated-login.md)、D-107。成品人工验收待完成。
- Ubuntu 上线条件仍是“艾诺科数据持续展示后再上线”（D-105）。独立库存台账、生产和关账不是这次前置。真实凭据、连续采集观察、备份恢复、候选组合验证与人工验收仍在发布 Gate。
- 其余 UI 保持 D-099/D-102/P6；生产业务 allowlist 不因新增公开 /login 扩大。历史 runtime 仅保留当时镜像/SHA，不冒充本轮环境核查。
- 宁波与18443/18444未操作；PR98 旧预检/方案需对齐 D-105 后重新审查，不能原样合并。PR100 与登录 PR 合并时须保留双方路由/状态/证据，重跑集成测试。
- 实现、合并、测试、部署、人工验收、来源激活见 [能力快照](release/baseline.json)。无自动合并、部署或共享数据库授权。

更新时机：main/PR/登录/权限/来源/环境与验收改变。
