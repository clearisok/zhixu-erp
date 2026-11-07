# 正式登录页与会话入口

## 2026-11-07：显式本机只读演示入口（D189）

本机真实订单演示的默认交付为直接提供现有业务页面链接和只读权限说明，不再让用户寻找账号或密码。仅`server/local-ainuoke-runtime.ts`安装`createLocalDemoEntry`；普通`createApp`、`server:start`、staging和生产默认不安装、不自动登录。不得切成拥有全权限的local-single-user模式。

私密服务配置显式启用`localDemo.enabled`并锁定已有`preview.real-orders`的public ID。仅精确回环Host、回环连接且没有转发/代理头的请求生效。匿名文档/会话恢复通过现有`issueSession`生成原v1会话；Cookie为HttpOnly、SameSite=Strict、8小时，只在本机HTTP省略Secure。原目标路径、查询参数和浏览器hash保持；已有有效普通会话不替换。账号及实时权限不符或含写入能力时拒绝自动进入，不给账号增权。

热关闭演示模式不重启同步owner；后续请求撤销自动演示会话，匿名恢复401。普通有效登录继续有效。此入口不读取来源凭据、不发报表、不改变业务权限或正常登录错误/限流逻辑。未来演示启动和真实结果见[本机演示说明](../tasks/active/local-ainuoke-automatic-2026-11-07.md#本机演示直接进入约定d189)。以下保留2026-10-12历史登录视觉记录，不能将其旧合成演示限制套用于用户已批准的真实本机入口。

## 2026-11-06 五天登录增量

用户明确选择“保持登录5天”。正式表单新增默认不勾选的选项，沿用现有会话接口，以可选boolean `rememberMe`传递；true时数据库与Cookie同为432000秒，否则保留原配置（默认12小时）。期限自登录起固定计算，访问不续期。已有会话、legacy入口和密码规则不变，无schema迁移。不保存密码到浏览器业务存储；Cookie保持HttpOnly、SameSite Strict及原Secure规则，管理撤销立即有效。

工程/CI/部署状态见[本次任务](../tasks/active/login-five-days-2026-11-06.md)。下方2026-10-12记录为历史范围，不代表本次增量未修改后端会话策略。

核实日期：2026-10-12；main 基线：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。代码在 feat/animated-login；是否合并/部署以 GitHub 和环境证据为准。关联 D-107。

## 用户决定与视觉范围
用户要求正式 /login 路由、有趣的 animated login，替代正式 Server 业务页面内部登录框。本次只批准登录入口的视觉变更；报价、订单、物料、设置和导航继续原布局。2026-10-12 用户确认“登录页可以”；该验收仅限登录视觉。用户指定 https://github.com/katavii/animated-login，已核对参考 master 62f0b80c7694c3dfe07b39c7a85bdd832ff4bb15。按其蓝色分栏、四角色、跟随/眨眼/密码反应重新实现原生 CSS/React 版本；无外部图片、字体或动画依赖。参考树未含许可证文件且 API license=null，不引入原源码或 GSAP/Ant Design；此处记录参考来源，不声明原项目许可。

## 当前实现
- app/login/page.tsx 独立全屏页面，复用 ServerSessionProvider、现有 /api/v1/auth/login、me、permissions、logout 与 HttpOnly 会话。
- 正式 Server 支持的业务路由匿名访问时，QuoteServerBoundary 跳到 /login?returnTo=...；成功后 replace 回安全站内路径，保留查询和 hash；已登录访问 /login 自动返回工作台。
- safeLoginReturnTo 拒绝外站、协议相对路径、反斜线、控制字符、编码绕过、登录循环、API/静态文件目标和过长地址。它不授予业务权限；业务 allowlist 与 API RBAC 仍独立执行。
- 页面包含用户名/密码、显隐、提交等待、防重复提交、错误聚焦、网络恢复重试；不持久化密码，不提供假的注册、OAuth 或找回密码功能。忘记密码联系管理员。
- 四角色随鼠标移动、眨眼，用户名聚焦时互动，密码输入时闭眼，显示密码时转身且紫色角色偶尔偷瞄；这些是装饰动画，不读取或传出密码内容。鼠标移动只改变 CSS 变量。prefers-reduced-motion 关闭动画/跟随。键盘、触屏无需动画即可使用。
- CSS 全限定 zx-login，按 1440/1024/768/390/320 宽度验证。1024px 及以下按参考隐藏角色面板并单列显示，其他业务断点不变。生产构建真实加载路由 CSS。
- /login 不执行 Browser Seed，隐藏该页版本角标但保留 build-info.json 和控制台版本证据。Browser/local-single-user 模式显示入口说明，不伪装成正式 Server 登录。
- 退出失败保留可信会话并提示重试；成功退出后转 /login。

## 边界
没有修改后端密码策略、账号、数据库 schema、权限目录或生产路由 allowlist；不修改宁波或 18443/18444。历史 Browser legacy /api/login、被封闭的 shadow/writer 工作区兼容登录卡仍保留；不能将这些入口视为正式 Server /login。
PR101 已合并到 main 3456fe5fc6e213c2e896e4e6a509e28751f1798c。PR100 仍开放，在其独立工作树整合本页与原 P6 订单物料；保留 isEnabledServerRoute 与 LoginRedirect，组合结果见统一本机演示任务。不自动合并 PR100。

## 验证与人工验收
测试入口：test:server-auth-frontend、test:animated-login-ui、test:team-access-ui、test:quote-server-ui；类型/lint/root/build 与 release baseline 同时检查。
正式验收需用户确认桌面/手机视觉与动效、自己的账号正常进入授权工作台、会话过期/错误密码/退出行为。演示只能使用合成账号和临时数据库；真实账号由系统管理员后续创建。
回退：回退本 PR 代码并重建候选，恢复原业务页内登录入口；无数据库回退步骤。部署始终需要独立授权与发布 Gate。
更新时机：登录路由/会话/权限/视觉批准/测试/合并或部署改变；证据见 docs/tasks/active/animated-login.md。
