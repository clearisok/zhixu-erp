# PR178 Staging集成执行

用户在2026-11-27本聊天明确授权必要修复、只合并178、部署Staging并只读验收；不操作Production、其他PR、业务库/数据库结构、Worker调度、清理、备份保留、服务器网络。保全失败或备份恢复门禁失败停止相关操作。新授权见[原修复任务](order-workbench-staging-2026-11-27.md)。

独立工作树 codex/pr178-staging-integration 起点 36ce6565c414270552e288584423e8db1191c622 clean。当前预整合受审178与已运行Staging 220ec86cb6cfa695c83ea474247bb01150075131，main基线10b9a7d827e1c09f152ead58c21f26712d49a619；178仍等待最终CI，尚未合并或部署。此候选不能宣称实际main集成；CI全绿后仅正常merge178到main，再把实际main合并SHA正常merge至本分支，核对实际基线/来源并完成发布守卫。NETWORK_DEGRADED，仅本地checkpoint，不重复push失败通道或假称GitHub已交付。

保全：以两个完整祖先正常合并，仅两处UI重叠人工组合，保留Staging物料读取错误反馈/只读重新读取、历史起点/历史缺口与recordKind；保留178摘要/紧凑历史入口。自动合并订单挂载/已有测试，域API、0061–0067、权限、备份/Worker/ops脚本精确保持220字节；不改变176/172/173分支。717条冻结记录完整并集，旧hash/ID不改，能力/验收状态不借集成升级。实际main前向证据收口后才最终guard。

Staging只读实况：220/build staging-i174-220ec86c、app c0d84053…、Worker4d16d738…运行，正式配置/data/issue174-phase3-20261126b，原DB/对象/卷不变。6233数量54000、三色23000/17000/14000、交期2027-01-13，来源stale保留16自购/15采购记录/12入库记录，完成16项未知无百分比。

旧配对备份20261127T151646Z-2658b2bc、manifest SHA256 bb0e23d68fe8c33a4a234aab52c086d45bb06019c674293e41cd3259af1a3d01：57文件111724319字节哈希一致，147表/13附件，cleanup正向及原服务恢复。独立临时数据库恢复完整行/序列/附件引用验证ORIGINAL_RESTORE_VERIFIED，原服务和业务库不动。原crontab SHA256 c71caad3ddc46bf13a725ddd15e53b82345208ead6deb044e13dca3559716f82。

待完成：工程/隔离UI/最终CI/main合并/实际main集成/新版本与原Worker配对发布策略/正式发布前新备份及恢复门禁/只读验收。不得预写PASS。

预整合db785a：typecheck/完整lint/server build PASS、root1035/1035、release182/182、精确main10b9的47UI路径守卫PASS。离线候选image94c08e27…/op1cffd99…构建通过未上线。集成UI发现C3 driver仍等待默认折叠来源中的错误；本分支保留原role=alert和time/ISO详情、只读重读功能，并让driver实际展开来源后执行原403/网络/恢复/三GET/时区断言，不能删除此测试。其余五项维护页签/桌面/角色等正在原隔离套件验证。首次完整bundle过大已停自有传输，使用已有220对象的1.8MB增量bundle；首次镜像FROM误写裸digest被拒绝，改用核验精确digest的既有本地tag完成离线构建，没有改服务器网络/代理/拉取依赖。失败输出与所有旧资产保留。

H1浏览器其余物料历史/六宽物料排序/七角色/交付计划/分页/颜色/来源读取已通过；工作台错误场景断言要求原次级诊断继续明确不会回退Browser。现结合原Staging错误反馈，在展开来源错误行保留该既有边界，主指标仍全待核对且不含技术文案。没有通过改断言隐去。da918增量构建通过，C3真实展开回归正在运行。

2026-11-28：正常merge主线本地c04（catalog真实stale/指标断言加强及CI整job35分钟），仅共享摘要冲突并逐字归档主线版本，717历史记录不改。主线新代码NETWORK_DEGRADED暂未GitHub送达；未merge/deploy。集成F7完整type/lint/build及受影响compact/workbench两套25/25 PASS；其他五套H1的51/51为同保持组件结果，不伪造全76在F7重跑。

## 2026-11-28 本地预检收口 / 等待远端恢复

主线checkpoint c04ef84eb0b980591369b11726bc7dc7c9f24824 精确main10b9/10路径守卫PASS。实际8e1a同产品构建+本次catalog driver，剩余13套完整Chromium119/119 PASS（578416.965786ms，约9分38秒）：catalog八场景含加强的过期来源验证、source_deleted、同步审计、关账、交付计划、成衣出货、物料详情/历史、商业来源/调价失败恢复、付款观察、加工批次/报价推送。没有删除断言或放宽单项等待。与先前35项有重复，不将两批虚构为不重叠总数。

独立部署候选产品f7b1201d530d3e9cdf7a01932ec023e8218e482d：typecheck/完整lint PASS，正式离线前后端镜像5591d1f7…/operator acd28e87…；受影响compact+workbench两套25/25通过，旧Staging的具体错误/alert/时区time/原始ISO/仅GET重读与主线无回退边界均在同次真实浏览器验证；其余五套H1的51项原结果保留，不能写成F7完整76新跑。root1035、release182、47路径守卫仍对应db785a7ceac5d78d574284adbd911d532345d436，随后产品变化只在上述两处UI及测试/文档，已最小充分补验。

当前独立分支已正常merge本地主线c04（ace6e8c7），原PR分支和176/172/173不改。实际main仍10b9，远端178仍36ce，source FAILURE/catelog旧文案，team-access和baseline SUCCESS；c04尚未远端交付，无法据本地结果将CI改记绿色或合并。

已依据AGENTS131/136向用户发出一次固定c04完整HEAD、调用原官方git-delivery的一次性PowerShell恢复命令。包装脚本仅设置子进程GitHub代理7888，不改共享配置或认证、不force/reset/rebase，官方guard自行校验分支/dirty/祖先/远端精确HEAD。脚本仅准备，Codex未自动执行。等待用户真实执行或明确新的通道恢复指令；时间经过不是答复。工具路径在本地主工作树outputs/order-workbench/recover-pr178-c04ef84e.ps1。Issue177评论7222899932回链当前事实。

后续恢复：先核实远端精确c04及新三CI；仅CI全绿/Review无阻断后merge178（普通merge commit，expected_head_sha守卫）。从实际main取完整M并正常merge到独立候选，禁止移动其他工作树或改176。H2双亲必须含M和本独立候选，保留717旧证据、给5份来源侧当前文档建立H2前向supersedes见证；新UI影响记录覆盖相对M全部保留路径、共享摘要/manifest同锚M。完成精确守卫/必要工程与最终SHA镜像后才能生成release-ready。

Staging维护脚本只在主工作树outputs/order-workbench/staging-quiesce-backup.py准备，必须读release-ready证明CI/实际main/候选工程均真才允许执行，当前前置不存在。正式发布必须沿原Supervisor锁/TERM优雅停稳/正常paired备份、独立恢复门禁、trial.mjs与projectUpdateConfig的唯一镜像/版本更新，旧DB/对象/卷、权限、cron、清理/保留/网络不变；新source配对备份及原恢复门禁通过才由原Supervisor恢复Worker。不能绕过backup-check的安静Worker前置，不SQL清pause或制造回执。现网仍220及原Worker运行，从未执行本次停稳/配置更改/发布/业务写入。

## 实际main收口

2026-11-28；实际main合并SHA **396b03c443f2170255ea4927e05d5889bdcb4b96**，PR178最终HEAD **c04ef84eb0b980591369b11726bc7dc7c9f24824** 三项必要CI全部SUCCESS，唯一Review P2已解决。仅178普通merge到main，没有合并其他PR。用户人工恢复首次push1/第二次push0，精确远端核实，通道NORMAL；此前NETWORK_DEGRADED是历史时点。

本阶段起点17aa5f9de35d27a628fdbef7f41844f7e15b7b49 clean。开放PR精确HEAD交集已检查，176/172/171与物料/订单挂载及共享摘要重叠，其他UI/ops PR主要共享摘要/manifest，136/164还有CI历史交集；仅在独立候选保全，不修改或合并其他PR。实际main与17aa正常双亲合并，新的精确UI路径影响以实际main为基线，旧证据前向保留。新工程门禁、镜像、发布、实际验收仍待完成。
