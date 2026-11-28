# PR178 Staging集成执行

**当前结果（2026-11-28）**：仅PR178已合并main，Staging已部署459005ad；正式备份/独立恢复/原Worker恢复通过，业务只读验收部分通过，历史详情503等限制保留。下面各阶段保留当时真实结果；最终结果见文末，不能将早期“尚未部署”当成当前事实。

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

## 部署前最终工程 Gate（2026-11-28）

实际main396b03c443f2170255ea4927e05d5889bdcb4b96、见证5180818a、722证据checkpoint9632d911：精确40路径源码/证据守卫PASS，release182/182 PASS（191426.562443ms）。最终候选业务/UI/服务器源代码相对F7无差异；此前F7 typecheck/完整Lint/build、root1035（db785）、两套受影响UI25及其他五套H1的51保持各自精确版本边界。补充候选17aa源码与F7干净真实构建：catalog/continuous/compact/workbench四套49/49（223132.62809ms），原404、7角色、三宽、来源失败/过期/只读重读与时区、维护入口和原关账/排单完整断言保留。

首次补验24项中22PASS/2FAIL（子测试及父测试）是镜像COPY合并残留已停用路由静态文件，非源码路由重新启用；原失败输出保留。新镜像层在复制新产物前清除旧dist，R5真实镜像确认两停用页面文件均不存在，四套49全通过。最终构建还清除镜像内旧迁移/来源程序目录后复制精确候选树，并逐文件核对，不改现网文件或共享镜像/网络。

当前6233只读API7/7 HTTP200，物料ready，自购需求16/采购记录15/入库记录12，采购/入库完成情况各16项未知，不能将采购记录当完成或编造齐套率。权限67项hash01ef2d5904f5b137675e977d6a6feccae0ef189c0bdc86260592ca0795f818aa。Staging真实调价历史全库0条，多页失败恢复只能引用51笔隔离持久化回归，不为验收造真实数据。现网仍220，原Worker正常、凌晨例行备份20261127T193001Z-4778f1f9成功及cleanup正向，cron精确未改。

此提交是最终镜像源码checkpoint；下一步精确HEAD守卫、正式离线构建与产物完整性核验、官方唯一push并核远端后，才可生成release-ready并沿原Supervisor/trial/配对备份/隔离恢复/原Recovery Gate及真实心跳发布Staging。尚未进入维护或部署，Production/数据库业务/调度/保留/清理/网络均未更改。

## 实际部署及只读验收（2026-11-28）

### 版本与交付

本收口阶段起点：codex/pr178-staging-integration / 459005ad4a7a1be2297fbf2b9fddfaea3443de34 / clean；原feat/order-workbench / c04ef84eb0b980591369b11726bc7dc7c9f24824 / clean。本阶段仅追加实际结果及截图，不改产品/部署源码或其他PR。

PR178最终HEAD c04的source、team-access、baseline三项Hosted CI全部SUCCESS：run46111047156、46111047176、46111047148。唯一Review P2已解决，无其他阻断线程。核对base main及精确HEAD后，按仓库允许的普通merge仅合并178，实际main **396b03c443f2170255ea4927e05d5889bdcb4b96**；未启用自动合并、未合并其他PR。

独立候选459005ad精确实际main40路径守卫PASS，正常官方git-delivery一次push后精确远端核实，NETWORK NORMAL。旧220与实际main均为部署候选完整祖先，保留PR176/172/173和存储v2；域API/DB/ops/Worker源代码与220一致。所有722冻结记录及能力标签保持，不以部署记录改旧冻结状态。新离线镜像核对67个migration文件、23个bridge文件与精确源码树一致，退役HTML不存在。

| 身份 | 实际值 |
| --- | --- |
| 站点 | https://staging.weaveops.top |
| 运行SHA | 459005ad4a7a1be2297fbf2b9fddfaea3443de34 |
| build | staging-order-workbench-459005ad，2026-11-28T05:46:18.510Z |
| app/gateway/objects-tls image | sha256:bca822b41d3eefe7143ccc65cdecf09de3124d2c86d3ce657168e20d575881a3 |
| operator image | sha256:44943440c1338041fee9064f5326cab220021bb78781a3733f23a8db2053b019 |
| Worker | weaveops-catalog-sync-459005ad，由原Supervisor恢复，heartbeat_verified |
| 原项目 | /data/issue174-phase3-20261126b / zhixu-quote-trial-i174-v2b |

### 正式备份、发布停止与受审恢复

沿现有Supervisor锁、优雅停稳、原配对备份、隔离恢复、trial与projectUpdateConfig执行。发布前备份 **20261128T054910Z-bdd1189e**，manifest SHA256 **5ca503a61d466893993ec66609c096a89b528eaf6874e60ad9353b1a32765745**；发布后备份 **20261128T055721Z-296406bc**。两者BACKUP_VERIFIED、cleanup正向、原服务恢复，并各有独立数据库/附件恢复验证。原备份和镜像均保留，不删除旧资产。

首轮辅助发布控制器在数据保全比较处停止，未把失败写成通过：147表完整比较仅发现app_roles的原初始化时间戳及app_users_id_seq从98到100；其他序列一致。未改数据库。实际代码证据为原server/auth/bootstrap.ts的INSERT ON CONFLICT：即使冲突，BIGSERIAL默认值也会消耗。compose启动及正式trial重启共两次，正好2步。旧失败日志、receipt与状态原样保留。

另外从真实发布前备份做隔离恢复，在隔离库复现两次原初始化语句，证实业务行、业务序列、权限/角色内容一致；只认证序列2步和正常初始化元数据变化。没有回拨线上序列、SQL清除pause或伪造回执。受审续执行精确限定这两个已证明的差异，其余完整比较继续严格；校对既有配置变更仅release identity，重新执行原require_reviewed_worker_backup/perform_backup、发布后正式配对备份和独立恢复，并通过**原有九项Recovery Gate**及真实新Worker心跳，而非将失败门禁跳过。

原九项全部true：admin_not_paused、backup_process_exited、backup_children_exited、docker_exec_quiescent、backup_lock_released、database_healthy、migrations_current、no_unknown_result、worker_exclusivity_verified。最终原Supervisor恢复Worker，旧Worker停止保留。DB/对象容器身份、挂载和权限保持；cron SHA256 **c71caad3ddc46bf13a725ddd15e53b82345208ead6deb044e13dca3559716f82**不变，原调度、自动清理和备份保留策略未变；只投影新源码/镜像/容器身份及对应既有pins，未改网络。

保护目录/data/pr178-staging-20261127内保留原失败、隔离证明及正式receipt；最终final-release-result.json状态STAGING_RELEASE_AND_ORIGINAL_WORKER_RECOVERY_VERIFIED，明确businessTestWrites=0、productionTouched=false。原始行导出、凭据及私有日志未加入Git。发布过程存在正常认证初始化/登录记账，不冒称数据库每一个认证元数据字节绝对不变。

### 实际只读验收

13:59及15:46正常既有管理员登录，七个真实GET均200：build-info、health（database ready）、permissions、6233详情、material-progress、material-history列表、价格历史offset0。HTTPS证书正常，无绕过告警。权限67项与部署前排序集合一致，hash01ef2d5904f5b137675e977d6a6feccae0ef189c0bdc86260592ca0795f818aa；订单主数据与部署前一致。

| 项目 | 真实结果 |
| --- | --- |
| 6233-937 | 54,000，SINGKA INTERNATIONAL PTE.LTD，2027-01-13，三色23,000/17,000/14,000，未写死 |
| 关注/交付 | 桌面单行，手机自然换行，原交付表与只读重新读取可用；移除冗余计划对照，未改规则 |
| 颜色 | 三色横向矩阵，XXS至XXL，14个未知格保持未知；三页签均实点 |
| 物料 | 15:46 sourceStatus ready，16自购需求（3面料/13辅料）、15项有采购记录、12项有入库记录；16项完成状态未知，两个率待核对、待采购待核对；已采购待入库逐需求缺口10项。不是15项已采购完成，不跨单位相加 |
| 来源时效 | 13:59 stale时旧数及缺口明确历史，不作当前判断；原Worker正常周期后15:46 ready，只读再次确认。未手动刷新来源或调度采集 |
| 物料跟进 | 正确订单关联，16自购/7厂供，采购18/入库23/出运17/出库17事件明细读取正常 |
| 维护 | 来源选择窗口、交期原2027-01-13/54000输入、计划重新读取均打开/读取后关闭，未选择提交、预览修改或保存 |
| 生产/关账/报价 | 排单原空组，关账12月及明细页正常，报价真实8/8条，未操作写入 |
| 价格历史 | 真实库所有订单历史0条，空态正确，无无效空分页；真实多页无法验收，不制造业务数据。51笔持久化历史两宽后页失败返回、末页回退属于隔离浏览器测试，已通过 |
| 响应式 | 实际桌面1440与手机390×844，无页面横向溢出；手机颜色矩阵可滚动，所有页签与展开入口可用，临时viewport已恢复 |

### 限制与未通过部分

1. **物料历史详情未通过**：列表12条可读，但最新2026-11-27T09:02:44.745Z及最旧2026-11-07T17:23:59.368Z单次详情实际503 `material_history_integrity_failed`；15:46再次点最新仍显示真实错误。没有用当前来源或Browser替代。server/ainuoke-source/history.ts及相关服务/数据库业务数据与220保持，说明本次UI没有改该完整性规则；但部署前没有实点详情成功/失败证据，不能断言线上旧版本已故障，更不能声称详细根因已定位。涉及保留的来源/存储边界，本轮停止扩大修复，不改其他PR、历史内容或完整性断言。
2. **成衣出货来源未接通**：实际503 garment_read_not_connected，摘要和历史入口明确未取得，不补0、不跨批次累计；未扩大来源接入范围。
3. 完整整单变更时间线API缺失，原有价格/来源历史与技术追溯分别保留；没有虚构完整业务审计。
4. 真实价格历史为空，实际多页验收不适用，以隔离回归补证而非冒称真实多页通过。线上全部角色未逐账号登录；权限不变依据代码/数据/API集合及原隔离七角色验证。

部署成功，**业务验收部分通过**，不称所有原有功能正常或用户已最终接受。Issue177保持开放，仅Status由In Progress改Staging，其余字段、视图、自动化不改；等待用户实际体验。Production、其他PR、schema和真实业务数据未修改。截图见[本次实际证据](../../release/evidence/order-workbench-staging-20261128/README.md)；部署前共享摘要[逐字归档](../completed/2026-11-28-pr178-before-deployment-closeout/CURRENT_STATE.md)。本阶段不新增业务/架构决定，不修改冻结业务规则。
