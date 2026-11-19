# 2026-11-19 紧凑业务页面接力

分支feat/compact-business-pages，从独立核实main4a8c9bc24b00983d0d79150349adeed5a333a237建立。原clean操作分支de6f36b7完整保护，未合并至本次分支。Refs Issue155；用户明确授权完整四截图UI实现、Draft PR和Staging候选部署，未授权合并/Production。不得改业务规则/示例价格写真实库。

授权/范围/测试在[任务文档](tasks/active/compact-business-pages-2026-11-19.md)。开始实现前检查已完成：server真实PV/CCT确认价businessValues已存在，可直接使用；AppShell持续壳需要页面owner portal承载顶栏actions；订单维护组件/安全导航保持。保存偏好需要幂等向前、保持个人隐藏/字段模式/权限，不清业务存储。

fetch因现有127.0.0.1代理拒绝NETWORK_DEGRADED，GitHub连接器main确认4a；开放PR136不涉及页面。按有界Git交付协议，不重试失败通道/改全局代理。当前仅初始契约checkpoint，尚未实现/测试/PR/部署。后续通过真实浏览器和必要测试再交付，不把历史通过结果冒称本次。

最新覆盖初始方案：用户v2明确永久取消款式进度列表/风险预警，原迁移二级菜单要求作废；订单中心只保留订单列表。已做依赖审计，保留共享物料详情路由、ControlTower、Summary、数据/表/Repository/API；清理两专用根路由、导航组件/引用、两个专用页面及列表私有导入UI。详情返回订单列表，不留死链。详见任务v2。第一版源码b1e45bd8已完成17项价格专项、typecheck/lint和Server前端build；之后用户调整产生新代码，最终候选需重新必要验证，不能冒称旧结果覆盖v2。

v2工程恢复点：247bb83e真实Chromium八项PASS（含21尺寸/等效缩放组合、确认三态/多价、顶栏/弹窗/创建/刷新/分页/角色和共享物料详情）；截图/JSON输出本机visualizations/2026/11/18/01a1ec55-eaa3-75f0-a103-83b015d43fb4/compact-business-pages-20261119，全合成隔离PG，不访问艾诺科。Linux只读断网full在247为1025/1026，唯一旧测试读已删除Tab文件，已按v2修复，生产定向25/25；后续最终full需再跑。Windows早期full旧文案失败和长baselinechild4636主动取消，不计PASS。新增紧凑区间视觉修正，17专项已通过；最终type/lint进行中。公开旧构建4a从旧镜像只读导出到本机Temp/compact-before-4a，before观察脚本正在跑，不能误当新候选。

SSH weaveops，隔离工程TASK=/home/jackson/weaveops-staging-preview/releases/compact-ui-20261119，audit-source为独立Git clone（不是live源码）；linux-tests.py full/baseline/guard用已存在不可变9fe679镜像、只读挂载、networknone/--init/cgroups写私密日志。真实Staging尚未改动；source/policy/Worker保持4a。正式trial.mjs接受显式完整候选SHA无main限制，但仍需push/Draft PR/测试/备份/完整身份核验后才部署。普通Git代理失败，单次进程URL专用proxy空值只读ls-remote成功核实main4a；共享配置/认证未改，后续只在同进程对照下使用标准git-delivery一次执行核实，不假称网络永久恢复。

最终产品源码c8e82b11be7cd6ec6eae29579f24ca8ef155500f：Linux full npm test exit0，1026项套件，106.547秒；前后端build exit0；最终typecheck exit0、lint exit0（测试JS一条unused-expression已改明确if）。c8实机构建Chromium完整8项exit0（79.315秒，确认区间紧凑修正后），before21几何组合保存但Chrome teardown失败，不冒称before wrapper PASS；清理仅自身临时child/PG，已修嵌套finally+有限退出预算。追加真实搜索/筛选/客户端顶栏owner回归属于测试变化，产品代码未再改。SSH曾单次连接超时导致guard未执行，随后有界只读已连通；不可把超时写为guard失败或PASS，仍需执行guard和独立release-baseline。真实Staging仍未变更。

远端交付：b10a7e7e1b75d9d67f4045753b4ed45aad11b8e2已标准git-delivery进程级proxy空值对照单次push DELIVERED_VERIFIED，Draft PR156已创建（首次传输异常先查head无PR再建，唯一PR），未合并。精确b10源码门禁PASS，17UI路径/0错误；CI team-access和baseline成功，source长套件进行中。追加复核既有ainuoke-continuous-ui的旧h1/“概况不含BillNo”断言需按获批新布局同步，正在独立测试；产品tree仍等于c8。PR正文如实描述范围/全部失败与取消/测试。SSH Staging间歇22超时，tailscale只读ping可经DERP(hkg)达，未改网络配置，真实Staging仍未开始修改。

现有CI浏览器回归进一步发现两个旧位置定位：连续同步返回列表等h1、交期维护操作组closest旧PageHeader。已改为真实topbar，并将概况款号设语义h1保持原21px、顶栏coarse触控44px（桌面40）。需最终重新build并跑9项UI、原连续同步和交期维护；不能把c8 UI结果冒称最新这3个CSS/TSX变化已验。source CI目前仍旧b10运行，推送此正常checkpoint会由原workflow自动取新head，不绕过。Staging仍未修改。

最新70be产品浏览器子场景全部通过但Windows清理失败；交期回归390顶部grid真实未换行，已限定actions顶栏修CSS跨行，需重build/交期/紧凑UI/CI。两测试退出budget仅调整到已有最大10秒；不修改共享清理机制、不冒称失败通过。Staging仍4a/唯一Worker健康，未切版。
