# 接力：Issue177 订单工作台 Demo

2026-11-27；`feat/order-workbench`；本轮已核实main **10b9a7d827e1c09f152ead58c21f26712d49a619**，起点clean。[用户批准](tasks/active/order-workbench-approval-2026-11-27.md)、[任务恢复点](tasks/active/order-workbench-2026-11-27.md)。仅实现/本地Demo/测试/提交/推送/PR；禁止合并、部署和真实业务/数据库/服务器配置修改。

源码接线已写入：原详情保留会话/权限/归属和维护保护；新工作台负责布局。交付计划前移，尺码按槽位和规则分组不合计补零；物料历史紧凑入口；成衣出货仅批次摘要。生产和关账复用旧客户端、权限和异步归属保护，不造金额或总进度。

依赖按原lockfile npm ci。初轮typecheck执行状态名错误已改；初轮root两个旧源码位置断言已按新组件位置修订并保留事实/权限断言。类型/lint/root/build、浏览器和真实6233样例仍待最终结果，不预报PASS。

本机无现存ERP容器或63051应用；SSH weaveops只读可达。新增只读Demo工具经正常认证和GET读取已有API，凭据/session留在原app进程内存不打印/落盘。本地拒绝所有业务提交/采集，无切版/重启/SQL业务写入。工具待构建后实际验证；失败不改账号或认证。

本轮fetch经7888进程限定覆盖成功；正式交付用scripts/git-delivery.ps1及完整ExpectedHead。可靠checkpoint只push一次，遇不确定故障即按根协议停止同通道重推。PR171/172/176共享文件风险已记录，不直接合入或改写。

[旧接力原件](tasks/completed/2026-11-27-before-order-workbench/AI_HANDOFF.md)保留历史。下一步完成验证/Demo/截图/影响记录和新冻结证据，提交核验远端并建唯一PR，Issue到Review等用户。
