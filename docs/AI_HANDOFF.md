# 接力：本机演示就绪，等待用户验收

2026-11-11。工作树C:/Users/Administrator/.codex/worktrees/material-dense-local/zhixu-ainuoke-api，branch feat/material-followup-dense。实际前端构建6dc9601549b65a15e60da0ae2c472c89d5e902ff，main/staging基线6dc17c645215b3eb08e03624effdee2d182b3e1d。本轮0push/PR/远端CI/部署、0艾诺科登录/报表；协议/认证/调度/计算/schema未改，禁止沿用PR144部署授权。

完整结果见[tasks/active/material-dense-local-acceptance-2026-11-11.md](tasks/active/material-dense-local-acceptance-2026-11-11.md)。实施前基线/失败历史见同目录material-dense-local-2026-11-11.md。批准与feature证据绑定bf9de97f，不随意改文件或hash。

演示：http://127.0.0.1:63054/order-center/style-progress/detail?orderId=aa46192f-23b0-4fd9-9a37-55acc7703783 。preview.real-orders只读自动进入，原7权限，POST同步403/新增任务0。hidden PID42352运行scripts/material-dense-demo.ts，实际前端6dc96015，后端启动元信息33091dee（启动器未变），不冒充重新启动。原63051保持；旧版比较63053已关。本机source worker=false，宁波原服务不动。

原D:/WeaveOps-Local617库只读保留，全dump恢复独立zhixu_ui_dense_20261111。PI2610-181原UUID不变，经importVerifiedMaterialArchive历史发布created=false，run78c2c95b-852e-43a1-808c-2ba8cd1dd42d。来源2026-11-11T06:44:46.899902Z、捕获06:44:50.325Z。10自购/3厂供/4采购/2入库/2出运/2出库。配置、原始回执、截图在受保护D:/WeaveOps-Local/material-dense-20261111，不能提交。原订单/角色一致、原物料7行未变，final-boundary-proof.json已证明。

7业务事实+4显示+11排序/客户端+18到料UI+9合同刷新UI+10排序/流水UI=59报告项PASS；最终type/lint/build及baseline guard PASS，guard12页68能力3UI路径0错误。真实样本progress.rows字段相等，六视图/分组/搜索/列/密度/8抽屉页签/只读到料/核实/历史状态/0写通过。1920前4后10首屏，1600前3后9，1366前2后7；最终截图after-final-interactive-*。D1992、真实完整空PI2511-141已抽查；PI2611-058当前4自购，不再称空。

初轮刷新标题卸载丢回执的真实UI回归已在21aa修复，正向catalog-ui通过；完整空重复提示6dc960已修。旧失败日志保留。没有全仓完整测试、没有远端CI；真实源刷新本轮未发生，写权限及队列→fixture采集→发布→读回仅隔离测试通过。不要重跑已通过检查或重新采集样本。用户视觉认可尚未发生；继续按本机反馈小改，未明确批准不得部署。
