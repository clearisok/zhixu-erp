# 接力：本机演示自动进入验收

2026-11-07，feat/local-demo-auto-session，从干净afffff25841cb47cc67c2b9368f3d3c1e42b59c7继续。main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新，无远端/CI/staging。本任务仅现有63051真实本机入口，不能使用57404模拟环境。

实现server/auth/local-demo-entry.ts并仅安装到server/local-ainuoke-runtime.ts；service.private.json.localDemo显式enabled、username及userId，既有preview.real-orders公有ID50f290ff-552c-428e-bb57-95649b9c9602。原7项只读权限为order.view、ainuoke.view、style_progress.read/view_history、commercial.sale.view/labor.view、quote.cost.view；不修改角色。原v1会话服务共享issueSession，自动令牌用途标记用于关闭模式时撤销；普通cookie保留。所有业务仍走原app/RBAC。开关scripts/set-local-demo.ps1 -RuntimeRoot D:/WeaveOps-Local -Enable或-Disable，热读取不重启worker。

工程单测/新数据库HTTP集成/旧browser-session、类型/受影响lint/PowerShell解析通过。待核心提交、固定构建和按原restart.request.json机制切换一次（原在途完成后退出75），再做实际HTTP与浏览器验收；目前运行仍40930078ba8931dc717541712d83aef2b8ed0c04，不提前记启用。新配置需先在私密root增加锁定身份，勿输出整份runtime/service。0业务表/schema/凭据更改。打开页面不产生源任务，但受控进程切换会按原生命周期在下次到期采集认证一次，不能混称页面触发。

root D:/WeaveOps-Local，app原46316、watchdog28348；持久容器weaveops-local-postgres/命名卷weaveops-local-postgres-data。原tmpfs zhixu-pg-it-d8777f722881绝不可停/删。service-status含617行，只解析安全摘要不可整份输出。不要复跑617、恢复已完成队列、备份/数据库重启或修改源认证暂停。

剩余：本机切换、无密码HTTP/浏览器直达与off模式实测、更新结果/精确源码守卫/文档冻结前向记录/最终干净提交。浏览器能力无无痕上下文开关，必要时请用户只做一次无痕实机对照，不能冒称空cookie HTTP等于浏览器确认。详细说明见现有local-ainuoke-automatic任务；旧接力已完整归档tasks/completed/2026-11-07-before-local-demo-entry。
