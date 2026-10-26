# G6B生产排单：当前main本地整合

2026-10-26，root唯一writer，既有独立reviewer只读。

当前比较基线为已独立API核实的main 869ee84dd0b31de6161011e4aa560678b244a64d（2026-10-26T02:05:13.299Z）。branch codex/production-planning-main-869e从该main干净建立，普通合流原G6B b6af0cd247c1e7ec4406e69526fa672544cce1d8；稍后保留已整合G6A 910fbd4834336446abadb64c9d617b1ae868424b的完整历史。全部非docs与已验收源码cd73726babfaa86ffef671cbbe3a37fd542dace6逐blob相同，没有新业务改动。

## 历史与证据路径

先冻结真实两父main+原G6B合流B，再以原main决定叶与D150叶的mergeOf记录关闭决策分叉；生产文档追加前向记录。不重写原ID、SHA或截图。随后普通合流本地G6A的完整证据链，并在真实合流处关闭其独立决定叶；所有父manifest对象保留。每个record只能引用已存在的真实checkpoint，不改变守卫或伪造未来SHA。

## 范围与复用

只恢复已批准的直接SO→Assignment排单、精确预览/CAS/幂等/审计/资源快照和既有页面。0035只新增计划表/历史保护；没有开工、实际完成、物流、出货或关账接线。原cd737规范archive SHA256 06439ae899089ee43a306b293b3bda1d7b4be4939bdee166b2ebc037ed0c7ea9已重核；类型/Node/import/lint、268项API/升级、根811、before2/after17/资源14/导航18/登录11/P6 14及双构建日志和source已逐核。本次没有重跑这些成功且源码未变的检查。before仍为f441客户端配cd737后台，不说是当前客户端。原134属于51a366，不是本次新PASS；本次精确N源码守卫另行运行，正式PR前仍须当前发布134及必要CI。

## 当前阶段

起始预核仅4份汇总/manifest冲突；非docs完全等于cd737。当前还未最终提交、复审或执行本次精确守卫；实际终态以outputs/production-planning-main-869e-20261026同HEAD回执为准，不提前声明通过。

## 交付与保护

H订单读取链0d70的精确交付授权仍有效，实际Execute/Push/PR/Hosted均0。用户普通PowerShell的三种读取也在约5.3秒失败，故障不限Codex；TLS中断具体位置/原因及历史exit1仍未证明。本轮不再探测未改变的Git通道、不改共享代理/TLS/认证，资源与排单不借用H指定上传授权。PR129已按单独批准合并，其他合并/关闭未授权。

不应用0035到任何现有库，不改变3001/50426/59069/62426、真实账号/业务库/对象/卷/备份或旧Browser记录；没有新真实Source读取、绑定、激活、调度、部署或退役。

完整Goal G1–G8/R保持active；关账原三项业务问题、真实Source范围、目标切换/人工接受、coverage V2与资产退役仍按原独立前置。旧[排单任务](server-production-planning-current-2026-10-24.md)与[工程证明](../completed/2026-10-24-production-planning-current-engineering.md)保留各自日期/source/结果/限制。

## 实际历史合流

第一真实合流B 11c6b0e2099346bcec1903c9508392270b30b541的父为main 869ee84dd0b31de6161011e4aa560678b244a64d与独立原G6B b6af0cd247c1e7ec4406e69526fa672544cce1d8；绑定提交2d43ec2f652de4d09b3261877d556f688a021eb3冻结D150/main决策mergeOf及同路径生产文档forward witness，原证据逐项不变。第二次普通合流保留G6A 910fbd4834336446abadb64c9d617b1ae868424b，也只遇4份汇总/清单冲突；完整非docs继续精确cd737。原G5 F/C链保留，第二真实合流的决定mergeOf随后绑定。清单在新绑定前300证据/50能力，旧runtime/能力/截图不改。

独立策略复审已核两次决定贡献/非冗余及生产文档同路径要求，无剩余P1/P2；该策略复审未运行测试，也不替代最终commit/manifest与当前守卫复审。
