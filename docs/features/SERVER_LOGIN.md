# 正式登录页与会话入口

核实日期：2026-10-12；main 基线：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。代码在 feat/animated-login；是否合并/部署以 GitHub 和环境证据为准。关联 D-107。

## 用户决定与视觉范围
用户要求正式 /login 路由、有趣的 animated login，替代正式 Server 业务页面内部登录框。本次只批准登录入口的视觉变更；报价、订单、物料、设置和导航继续原布局。尚无本次成品人工验收。未提供具体第三方组件链接，采用原创 CSS 小角色，无外部图片/字体/动画依赖。

## 当前实现
- app/login/page.tsx 独立全屏页面，复用 ServerSessionProvider、现有 /api/v1/auth/login、me、permissions、logout 与 HttpOnly 会话。
- 正式 Server 支持的业务路由匿名访问时，QuoteServerBoundary 跳到 /login?returnTo=...；成功后 replace 回安全站内路径，保留查询和 hash；已登录访问 /login 自动返回工作台。
- safeLoginReturnTo 拒绝外站、协议相对路径、反斜线、控制字符、编码绕过、登录循环、API/静态文件目标和过长地址。它不授予业务权限；业务 allowlist 与 API RBAC 仍独立执行。
- 页面包含用户名/密码、显隐、提交等待、防重复提交、错误聚焦、网络恢复重试；不持久化密码，不提供假的注册、OAuth 或找回密码功能。忘记密码联系管理员。
- 密码输入时小角色闭眼；鼠标移动只改变 CSS 变量。prefers-reduced-motion 关闭动画/跟随。键盘、触屏无需动画即可使用。
- CSS 全限定 zx-login，按 1440/1024/768/390/320 宽度验证。760px 以下单列，其他业务断点不变。生产构建真实加载路由 CSS。
- /login 不执行 Browser Seed，隐藏该页版本角标但保留 build-info.json 和控制台版本证据。Browser/local-single-user 模式显示入口说明，不伪装成正式 Server 登录。
- 退出失败保留可信会话并提示重试；成功退出后转 /login。

## 边界
没有修改后端密码策略、账号、数据库 schema、权限目录或生产路由 allowlist；不修改宁波或 18443/18444。历史 Browser legacy /api/login、被封闭的 shadow/writer 工作区兼容登录卡仍保留；不能将这些入口视为正式 Server /login。
PR100（ba6ec973c4e7c5d884505990cb1db2e1d5861de7）仍独立开放，首次绑定/调度/订单物料路由能力不在本分支；两项合并时保留其 isEnabledServerRoute 判定与本次 LoginRedirect，重跑组合测试。不自动合并任何 PR。

## 验证与人工验收
测试入口：test:server-auth-frontend、test:animated-login-ui、test:team-access-ui、test:quote-server-ui；类型/lint/root/build 与 release baseline 同时检查。
正式验收需用户确认桌面/手机视觉与动效、自己的账号正常进入授权工作台、会话过期/错误密码/退出行为。演示只能使用合成账号和临时数据库；真实账号由系统管理员后续创建。
回退：回退本 PR 代码并重建候选，恢复原业务页内登录入口；无数据库回退步骤。部署始终需要独立授权与发布 Gate。
更新时机：登录路由/会话/权限/视觉批准/测试/合并或部署改变；证据见 docs/tasks/active/animated-login.md。
