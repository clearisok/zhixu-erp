# 接力：本机自动进入已启用，仅无痕用户对照待确认

2026-11-07 17:13北京时间。feat/local-demo-auto-session；运行/静态固定SHA bf81f8ea4b7adcdf26e3319dbca37206c992e6d3。main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新；无远端/CI/staging。后续纯文档HEAD与运行版本分别记录。原afffff目标及617自动同步的接力已归档tasks/completed/2026-11-07-before-local-demo-entry。

本机http://127.0.0.1:63051；订单中心/order-center，D1992 /order-center/style-progress/detail?orderId=d2e302cf-f0d5-404e-9474-e8ecf11ec81e。root D:/WeaveOps-Local私密配置不可输出。localDemo.enabled=true，固定preview.real-orders ID50f290ff-552c-428e-bb57-95649b9c9602；7项原读取权限不变，无修改/刷新来源权限。server/auth/local-demo-entry.ts只由local runtime安装；原v1会话与RBAC保留，普通有效cookie不替换。普通环境默认不安装此入口。

空Cookie真实HTTP直达/刷新/重开200，617；D1992物料200/server_snapshot、30自购＋8厂供、来源16:47:29；真实sync-order及写入403，无新增任务。热关401、重开200、错误Host/转发拒绝；HTTP窗口0新来源请求/登录。46保护业务表哈希和617head一致。工程/类型/lint/build/PowerShell及源码守卫已过，未重跑无关182项或CI。证据root/local-demo-entry-http.private.json、local-demo-entry-data-proof.private.json、local-demo-entry-activation.private.json，均无密码/令牌/Cookie。

浏览器工具当前已可读现有页面（没有绕过旧拒绝），新标签显示bf81f8ea的D1992，并保留原preview.material-sync普通有效会话身份。工具无新无痕上下文能力；已发async问题让用户开无痕窗口核对订单中心、D1992、刷新/关闭重开。等待这一确认，不能以HTTP空cookie或普通已登录UI冒称无痕浏览器通过。若用户确认，仅更新验收文档/接力并本地提交，不再取源、重建、升级或重跑未变测试。

受控切换只用原restart.request.json流程，旧组完成后app46316→34284；原watchdog28348保持。现有VBS仅更新固定release路径，未另启动后台。普通开关可用固定release/scripts/set-local-demo.ps1 -RuntimeRoot D:/WeaveOps-Local -Enable或-Disable，即时读取，不重启同步。只读预览账号及正常会话不删改，617/人工记录/调度不动；旧57404模拟不作验收。

持久容器weaveops-local-postgres/卷weaveops-local-postgres-data不变；原tmpfs zhixu-pg-it-d8777f722881绝不可停/删。service-status含617行，只解析摘要。不要为入口任务重试源站、重跑617、修改同步队列、重启数据库或重复备份。具体启动恢复见现有local-ainuoke-automatic任务。
