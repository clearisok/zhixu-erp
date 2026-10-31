# 标签页图标跟进

2026-10-31；base/main e37a131a7182a5488f440dcc8fde3ea66de1c6e4；分支 fix/brand-shell-navigation，输入提交2432c955ccbb6651c496c1ada64c6461af504b60，起始工作树干净。

用户指出标签页仍显示地球；此前“再试试github 且同步体验站”的范围继续覆盖本次图标修复，不授权合并。公网/login的HTTP200实际HTML输出link rel=icon href=http://localhost:3000/favicon.svg；公开/favicon.svg能200返回，711937字节。根因是metadataBase将相对icons地址绝对化为本机地址，不是仅凭截图推测缓存。

移除metadata.icons，RootLayout显式输出同源相对link。将已有mark-only SVG按原viewBox渲染为64×64透明PNG（格式转换，不重画、不改原图），新文件名避免沿用旧favicon缓存。原始PNG和旧SVG均保留。侧栏、账号、业务、数据库、Source与路由规则不变。

验收：检查实际构建HTML只能存在一个icon link，href以/branding/开头且与页面同源；图标200/image/png、64×64带alpha；检查登录页和订单入口及浏览器。必要发布检查、精确交付与CI结果逐项记录，未运行不记通过。

前一阶段2432三项CI成功；e460应用已完成配对备份、独立恢复与34路径公网读回，原3SO/2报价/2用户和附件保持。证据outputs/pr138-completion.json和outputs/pr138-approved-staging-update保留。输入状态归档到../completed/2026-10-31-favicon-input-state。当前修复尚未交付或部署。
