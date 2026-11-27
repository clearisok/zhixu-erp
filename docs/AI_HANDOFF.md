# 接力：Issue177 订单工作台 Demo

2026-11-27；`feat/order-workbench`；本轮已核实main **10b9a7d827e1c09f152ead58c21f26712d49a619**，起点clean。[用户批准](tasks/active/order-workbench-approval-2026-11-27.md)、[任务恢复点](tasks/active/order-workbench-2026-11-27.md)。仅实现/本地Demo/测试/提交/推送/PR；禁止合并、部署和真实业务/数据库/服务器配置修改。

源码接线已写入：原详情保留会话/权限/归属和维护保护；新工作台负责布局。交付计划前移，尺码按槽位和规则分组不合计补零；物料历史紧凑入口；成衣出货仅批次摘要。生产和关账复用旧客户端、权限和异步归属保护，不造金额或总进度。

Phase1源码checkpoint `b2cc6ad4ea1c015ffb4960aacb68197b24fe0f5e`已一次push并核实精确远端。原lock npm ci、类型、后端及Server前端构建通过；定向详情断言7/7通过。初轮root两条展示位置断言已修订；root因守卫运行中摘要输入变化而主动中止，不记PASS。最终稳定输入后重跑。

本机5177只读Demo已运行，SSH weaveops经现有app正常认证和GET，凭据/session留在远端进程内存不打印/落盘。本地拒绝所有业务提交/采集，无切版/重启/SQL业务写入。真实6233-937已核对UUID/订单/54000/3色；出货503如实未知，物料stale如实旧来源。main前图已从独立Git archive构建拍摄。

Phase2以b2为baseline，全为本任务增量：新增可复用真实浏览器proof、隔离PG工作台回归与原套件导航适配；修复矩阵卡片最小宽度/字号、精简前置交付计划、顶部物料状态提醒、折叠出货时异步归属失效。初版六项功能/权限通过但900宽卡片可达性失败已定位修复，必须用新checkpoint构建重跑，旧b2图不冒充最终验证。当前守卫正在读取冻结输入，未预报结果。CI只增加同源工作台测试，无触发/权限/部署变更。

本轮fetch经7888进程限定覆盖成功；正式交付用scripts/git-delivery.ps1及完整ExpectedHead。可靠checkpoint只push一次，遇不确定故障即按根协议停止同通道重推。PR171/172/176共享文件风险已记录，不直接合入或改写。

[旧接力原件](tasks/completed/2026-11-27-before-order-workbench/AI_HANDOFF.md)保留历史。下一步完成验证/Demo/截图/影响记录和新冻结证据，提交核验远端并建唯一PR，Issue到Review等用户。


工程恢复更新：UI源码最终构建 `11053c106dd8f97c8bd52ba1482070daa63b4928` 已一次push并核实远端。typecheck/零警告lint/Server后端及前端build通过；同源码Git archive在隔离Linux既有Node24.22.3/TS5.9.3测试镜像完成root 1026/1026、release 182/182，原Git历史只读挂载。Windows长跑主动中止不记PASS；Windows多个浏览器子项通过但退出/EBUSY外层失败保留。最终两张真实订单各42项浏览器检查（含6233）及退出成功；本轮未触发来源采集，既有后台Worker在截图期间正常更新，物料stale→ready与分码变化按各次GET事实展示。Linux浏览器测试在任务专用可丢弃镜像，Docker Desktop loopback用仅容器内TCP转接到host.docker.internal，不改产品/数据库/服务器/共享配置。初轮4项PG连接失败保留日志，已用修复的隔离网络重跑。调价限制角色测试补显式进入“价格与历史”后再断言隐藏金额，权限断言不变。下一步冻结最终截图/工程证据、跑最终守卫、核对重跑UITest、最终交付PR；不要重建UI影响仍在跑的浏览器测试。
