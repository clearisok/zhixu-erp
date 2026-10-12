# AI handoff

核实2026-10-12；main基线 db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e（PR99已合并）。
任务 feat/animated-login，独立worktree初始clean。用户授权独立正式/login、有趣动画；业务UI不改，无真实账号/DB/环境操作，不自动合并。
功能/约束见 features/SERVER_LOGIN.md、D-107、tasks/active/animated-login.md。
G1代码：正式登录页+安全回跳，既有session/RBAC，按用户指定 katavii/animated-login 重新实现蓝色分栏四角色（参考62f0b80），密码闭眼、显隐、错误、响应式、reduced-motion，CI增加真实Chromium验证。
初步root808、会话112、UI9 PASS；最终新增失败场景与重新构建截图待G2核实，不冒称最终CI通过。
PR100仍open，代码不在本分支；不要误覆盖其 isEnabledServerRoute 或 D-106。D-107为登录，避免决策ID冲突。
LOCAL ENGINEERING进行中；REMOTE DELIVERY pending。起始fetch网络重置，但GitHub API核实完整main对象，允许本地推进。每个Gate独立commit，网络状态不等于部署授权。
更新时机：checkpoint/测试/main/PR/视觉验收或环境事实改变。

G1=5b55488cefdc47255302f6e043e5c65b18ba2878；G1b 对齐指定参考，保持安全流程。新截图必须在G1b完整SHA构建后重新生成。
