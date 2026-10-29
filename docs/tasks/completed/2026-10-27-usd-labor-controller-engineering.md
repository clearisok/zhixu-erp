# Gate8D2：USD采用原请求控制器冻结工程证明

2026-10-27。分支codex/usd-labor-controller-main-869e；clean父3d727b46c17b8f02dfc8952804c47771621ab295。沿用本日既有连接器核实main869ee84dd0b31de6161011e4aa560678b244a64d及PR130原61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，无fetch/新API/重复诊断；Git/ref写STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED。

## 实现与边界

D166在原client/pending/Server命令上串联完整save/readback→POST→原GET→精确终态ack。构造/刷新无网络，unknown后只有用户显式确认且原slot精确存在才可同UUID/body重试；坏字节/缺失/不同slot不覆盖。新意图无效也先撤旧预览；状态副本不能改原命令。操作锁、取消/超时和真实owner对象代际合同保护ABA/晚响应，业务回调再次核owner。撤write仍可读原回执，撤read隐藏；ack失败保留核实结果和原请求。

无schema/API/价格规则变化，不另建价格或日志系统；加工null颜色和0USD沿用已批准依据。未接DOM/CSS/新入口、真实session provider或页面导航；navigationBlocked只是待接线状态信号。三步V2答复仍pending；测试不能代替设计批准或人工接受。Server关账UI/税率更正、远端交付、来源激活、切换/退役及完整Goal仍后续。

## 实际分源验证

- S1 0399744fbb87d3f7fe1425a2f58a3d7c9fa3b24e：owned archive逐一核对3060 tracked blob，0overlay，junction复用既有node_modules，无安装。38/38受影响项通过：11原client、22新controller、5真实HTTP（含父项）；root typecheck、Server build和package前端build通过。新增review负控中的holder写法触发prefer-const，因此该轮lint失败、canonical.passed=false原件保留，不能写成整轮全PASS。
- S2 2c9e321c5a5d0e6ddca85f90f7348c07de955eda：只修改一处测试holder为const对象，应用源码、SQL、HTTP测试和package与S1逐字节相同。另一个全3060blob/0overlay archive上，22/22 controller、root typecheck、三文件lint、项目Vite8 browser bundle通过（1输出、6模块，无Node/PG运行时）。没有把22与38相加，也不声称S2重跑38。
- 实际HTTP只使用新owned tmpfs合成PG和合法领域夹具：真实COMMIT后合成丢POST确认及首GET回执，刷新只核对不重发；撤adopt权限后原回执仍可读；加工null颜色确认0USD；旧商业全行摘要、另一订单、SO/批次数量与原Browser示意字节保持。原Server完整关账/后端模型未修改，不另重跑父811项目及144发布负控；这些旧结果只归原Gate8D1。交付新PR前仍须当前候选的必要完整门禁。
- 初次WIP20单元通过；lint一处先修；独立审查两项P2（非法新意图保留旧预览、发布状态后旧owner回调）均有直接负控并静态闭合。最终只读审查0剩余P1/P2，核对两archive及9日志hash；审查者未运行测试。最终精确发布守卫在后续验收收口单独记录，不预报。

## 保护与交付

开始时273条旧本地branch HEAD完整保留。原50容器/179卷/27网络标识前后相同；这只是标识核对，不是业务内容或完整运行状态审计。新owned测试库按夹具回收，没有操作既有环境/账号/业务库/Browser存储、卷、备份或Source。

Hosted runs/远端Git-ref写/真实Source/合并/部署/持续调度/目标切换/退役均0。只扩展现有USD测试命令，无新workflow/job。68项能力快照不改；不把本地控制器测试称为可体验、已部署或Git交付PASS。完整Goal保持active。

## 本机原件SHA256

目录outputs/usd-labor-controller-20261027，原件不覆盖。

- start.json：`4a64c71735b96aba01c33fac90574a342dab6b17ec2f8cf09f9dd7270287e3ea`
- source.json：`7a66c308c5666b5a97f256adbd3abeb3ee5b593e00a8a6a9b0c1c682bdaf2a6e`
- prepared.json：`63c330fa042f705c5c556c197d9c681f142a6123b45f70fba635e5f91804e23f`
- canonical.json：`08cf51826ca0c139071e001e58e00126a4d3b7cb96a253d09f68b353dacf30d3`
- canonical-affected.log：`1cdefa8e8fe2c0c5c9f81f497426ed22a33dc4dd581a5d8470b085e60064d453`
- canonical-changed-lint.log：`1b9b40f256dfedcfe839c65fd0ad3c9ae3cb66f909f96babda1406b2b55d4124`
- prepared-final-source.json：`907365c28e106fb6de2aa569b22994e7a2ea76542fe04f61bc7085e5ea95dfed`
- final-source.json：`8f8cd1e97b1bf188e7738eefb830a177ee28cc8274b1ac61fc1eb167ba8df0e4`
- final-source-browser-bundle.log：`2d1d774363917f239bd3855b3f472a7ec3b213d6a3bdbdf0f64c44fb25443d27`
- preservation.json：`ea2c3576b77111a0b75edec4ccc2fd5ebc9c67956c3465609c9b535045ebae20`
- ref-preservation.json：`4edd976f89e6eed648d53167dfd299fedb02668006ffd57d7030af9b336aa461`
- review.json：`6b5e41fbd903b16f66b5986a2cb5b393d45bd39bdb960fd2a8ba80e0f5c22b3a`

[当前契约](../../features/ORDER_USD_LABOR_INTERFACE.md)；[阶段](../active/usd-labor-controller-2026-10-27.md)；[原Gate8D1收口](2026-10-27-order-usd-labor-interface-validation.md)。本页固定本切片，后续采用新证明前向接续。
