# 当前状态：本机只读演示直接进入

2026-11-07。分支feat/local-demo-auto-session，从干净afffff25841cb47cc67c2b9368f3d3c1e42b59c7继续；继承main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea，未刷新远端/推送/CI/staging。当前固定运行仍为40930078ba8931dc717541712d83aef2b8ed0c04；入口代码已完成，待本机切换与真实HTTP/浏览器验收，不能提前宣称生效。

仅显式本机runtime安装自动入口：匿名文档/会话恢复通过原v1服务生成已有preview.real-orders会话，固定public ID与只读权限上限；原深链接及正常有效登录身份保留。普通服务默认关闭；回环连接/Host、无转发头/跨Origin才自动进入。热关闭可撤销自动演示会话，不重启同步、不影响普通会话。不改前端、账号、角色、密码或schema。

边界单测和新的8项数据库/HTTP场景及父测试通过；旧browser-session集成通过，类型及受影响lint通过。新用例第一次将不存在订单送入sync-order得到503，系fixture未建来源；改用正式sync命令验证403，未改变业务实现或断言门槛。新脚本PowerShell解析通过。待固定版本构建、受控本机切换、空cookie直达与实机确认。

本机仍http://127.0.0.1:63051，root D:/WeaveOps-Local；617订单和独立分档同步保留。258高频/119每日/202每周/38每月为前阶段快照，后台继续更新，不能拿重复周期结果当不同订单。原持久容器/卷、旧tmpfs和所有备份均保留，不为入口测试重启数据库或取源。

[演示链接、启动及验收](tasks/active/local-ainuoke-automatic-2026-11-07.md)；[前阶段完整状态](tasks/completed/2026-11-07-before-local-demo-entry/CURRENT_STATE.md)。
