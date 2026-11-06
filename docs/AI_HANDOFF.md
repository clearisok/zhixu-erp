# 接力：真实物料闭环，禁止重新初始化环境

先读[本轮任务](tasks/active/ainuoke-material-closure-2026-11-06.md)。真实worktree为ainuoke-it-material-details/zhixu-ainuoke-api，分支fix/ainuoke-order-material-closure。本轮用户已授权本机全量真实接入，不部署staging。

页面127.0.0.1:63051使用原数据库，resume-real.ts保留库启动器PID34788（恢复时复核）。禁止运行real-demo.ts：会初始化新库；旧PID34992已硬停止，未调用清理回调。现有预览账号保持只读。

全量PID24300、exec会话72081；不要重复启动采集。D:/WeaveOps-Previews/real-orders-20261106/closure-all的scope.private.json、receipts.json、status.json是恢复依据。617条冻结范围，D1992单独验收，616任务持续进行。所有私密文件不得输出或提交。

新CLI material-recover只排队，需精确target、source-ids、稳定request-id；中断沿用同一ID，worker沿用有限退避。认证/身份/证书及未知结果仍停止。全量结束须逐单实际HTTP+数据互斥核对；不能用任务complete替代。

当前修改尚未提交。类型/构建通过，剩余最终复审、发布门禁、全量收口、正常刷新入口核验和版本记录。用户数据、旧原文和备份均保留。[旧接力](tasks/completed/2026-11-06-before-material-closure/AI_HANDOFF.md)。

继承的本地发布manifest基线为cb5cc29baa49ed7115fdb6c9506b6a80356936ea；它不是本轮新核实的远端main。远端PR门禁尚未完成，本轮本机验收不以远端交付为前置。

23:20外部认证拒绝后采集已暂停，未自动重试。全量617实际HTTP互斥对账：本轮有物料可读143、完整无物料1、仅历史可读3、认证失败1、未发布待处理469。PID24300已退出，472任务保留；恢复依据及配对备份见本轮任务记录，不能再次按“正在采集”运行重复进程。用户确认没有他人登录且密码未改，拒绝根因尚未明。
