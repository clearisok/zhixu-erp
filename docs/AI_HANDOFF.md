# 本机高密度物料页恢复点

2026-11-11第一阶段仅本机。main/staging基线6dc17c645215b3eb08e03624effdee2d182b3e1d已只读核实；独立material-dense-local/zhixu-ainuoke-api，branch feat/material-followup-dense。5d7b2dbd先冻完整功能清单，bf9de97f首轮UI+具体批准文档+baselineM2。当前未push/PR/远端CI/部署；不得沿用上一轮部署授权。

真实数据：原D:/WeaveOps-Local持久617库在63051只读old4bd（本轮仅启动网页，syncEnabled=false），源worker在宁波，不能启动本机。原目标11/8快照仅4自购/3厂供；staging真实HTTP确认10自购/3厂供。通过原hydrateContractEvidence只读导出最新完整证据，0源请求，保存D:/WeaveOps-Local/material-dense-20261111/verified-181-archive.private.json。原本机库pg_dump后恢复新本机隔离库zhixu_ui_dense_20261111（同现有local容器端口64268），原库未写业务。原importVerifiedMaterialArchive仅在clone接纳7039/PI2610-181：historical_published、created=false、原UUID aa46192f-23b0-4fd9-9a37-55acc7703783，run78c2c95b-852e-43a1-808c-2ba8cd1dd42d，原来源14:44:46.899902，capture14:44:50.325，不改原时间。

目前candidate只读app63054 PID24068（terminal14650），before-current app63053 PID6052（terminal8364），均outputs/material-dense-local/server.ts，pool只连clone、createApp/既有reader/既有loopback-demo，0worker；原63051不动。新的可追溯启动器scripts/material-dense-demo.ts已写，待最终构建后换成该脚本Hidden后台进程。只允许GET/HEAD/OPTIONS及正常auth登录退出，业务写403，默认沿用原7权限preview.real-orders。不要改auth/权限或把stagingUUID c067...复制到local默认映射。

截图/真实HTTP/交互回执均在D:/WeaveOps-Local/material-dense-20261111（private），before-current-1920/1600/1366.png与after同尺寸可比较。1920同10自购+3厂供资料：首屏自购可见5→10，1600 4→9，1366 2→7，13px；六视图10/3/4/2/2/2。after-interactive实际DOM/API无业务POST，搜索/分类/全收放/列恢复/密度记忆/全部抽屉页签/只读到料弹窗/核实/刷新页面均PASS，实际原需求与流水字段相等。源过30分钟需如实stale，不放宽时限；再次比较需同一时刻before/after，派生row.status自然随时间变化不当作源数据变化。

首轮类型/lint/build、10业务显示回归过；后来加未接通不显示0的UI保护，新增单测首轮缺PermissionProvider已修，4显示测试通过。新增helper及ignored临时server TS参数需最终typecheck（临时参数已注解）。当前dist/client烟测build标记5d7b2dbd，实际UI字节属于bf9产品改动（当时dirty构建）；最终须freeze新源码commit后按Server/snapshot/session flags再构建并换新helper，不能把5d元数据当最终精确代码。

分批到料隔离UI测试：第一次把刷新来源当DB页面重读，fixture无目录返回sync_catalog_not_ready，按钮是正确队列行为。新增明确断言该真实命令，另用focus触发原GET重读；新增readCompletions及DOMcanonical稳定选择。第二次预期worker_not_enabled写错，已改按实际catalog_not_ready；第三次旧未渲染错误文案改成现有alert title“物料暂时无法读取”；第四次13子项过，Source失败旧摘要入口在后续focus恢复历史资料后消失，openSaved已改为先找孤立已保存计划、再原同组入口（两者读同一持久计划），测试同时显式HTTP503覆盖孤立计划。最后clear及只读activation仍需整轮验证，不冒称PASS。原失败log保留outputs/.../arrivals-ui[-v2/-v3/-v4].log。因为曾失败必须继续解决，不能停止在报告。

下一步：冻结manifest新批准/feature证据（bf9已有两文件与baselineM2），UI impact三产品文件已有；最终源码commit/build；仅换own24068/6052候选，不停原63051/其他服务；运行最终到料UI、catalog-ui真正刷新采集发布测试（合成fixture，仅本机）、真实other orders/空/未知/尺寸/数据hash；更新功能矩阵/比较报告/guard/交接、启动Hidden稳定63054给用户验收，不部署。新task docs每项实际回执不要写成用户接受。旧staging完整交接在tasks/completed/2026-11-11-before-dense-view，宁波后台继续原M2，不再读源或动配置。
