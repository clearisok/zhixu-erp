# 款式物料跟进高密度本机改版

2026-11-11用户完整任务已读取，明确授权第一阶段本机UI/UX改版、真实数据演示和回归；禁止本次staging/production部署、远端CI/CD、后端协议/业务计算/表结构/认证/调度修改。用户给出具体四行布局、六视图、抽屉、密度和桌面尺寸要求，并指示基线后直接实施，不为普通视觉细节反复确认。此为V2具体本机设计批准，人工演示接受尚未发生。

基线main经GitHub只读API核实6dc17c645215b3eb08e03624effdee2d182b3e1d；独立feat/material-followup-dense，工作树material-dense-local/zhixu-ainuoke-api，初始干净。依赖lock与已有已安装目录SHA256一致，仅本地junction复用，不安装新依赖。新阶段不push，避免触发远端CI；原staging采集和后台不动。

## 改版前功能基线（代码盘点完成，实施前冻结）

Route app/order-center/style-progress/detail/page.tsx，ServerStyleProgressDetailPage→useOrderMaterial→ReadOnlyMaterialControlTower。正式UUID参数由orderMaterialNavigation校验，返回订单详情；Server模式/RBAC门禁不变。数据为MaterialProgressView/ProgressRow原业务投影，不做新计算。自购/厂供/unknown分别materialSupplyScope分类；数量/差额复用materialBusinessFacts，流水复用materialEventKey稳定身份，混单位/共享分配/规格问题仍待核实。物料排序复用orderMaterialGroups（面料优先、面料需求显示分数、辅料关键词优先、来源稳定顺序），不修改设置。

|功能|当前入口和行为|API|改版后入口|回归方法|
|---|---|---|---|---|
|订单身份/深链接/返回|UUID详情、款号/合同、返回订单详情，非法参数/缺权限提示|auth/me、permissions；material-progress|紧凑订单栏，原AppShell返回|真实合同/UUID、非法参数/401/403|
|读取/来源新鲜度|读取正式快照；ready/stale/source_failed及空来源分别提示；30秒/聚焦只读重取|GET sales-orders/:id/material-progress|紧凑来源行与详情|前后响应hash、旧来源及失败提示|
|自购需求全部字段|物料/颜色/规格/门幅/克重/需求/单位/采购/缺口/入库/待入库/出运/出库/状态|同上|总览统一表格，列可恢复|逐需求ID比较、数值/单位不变|
|厂供及unknown供料|独立表、厂供不参与自购差额，unknown独立|同上|独立厂供视图，unknown仍独立保留|按scope和需求ID核对|
|六项统计|2需求项数+4节点稳定明细笔数，可点四流概览|同上|横向统计+六视图快捷切换|businessTransactionCounts前后相等|
|物料分组/单组收放/全收放|原canonicalKey保持，面辅料分类|无新增|统一表group表头，保留全收放|分组key/行数/顺序|
|物料搜索|名称/编码/颜色/规格/供料方式/采购单号/供应商，NFKC规范化|本地filterProgressRows|工具栏，原范围不缩小|中英/供应商/颜色/编码样本|
|辅料排序设置|settings.edit才显示；进入进度设置orderId深链接；配置失败保留来源顺序提示|GET/PUT material-progress-settings|订单栏原按钮/原设置页|角色按钮/返回/关键词顺序，真实不写|
|采购明细|单据/供应商/采购日/交期/量/单位/单价/币种/规格/颜色/身份与问题|material-progress已含|采购视图/原抽屉|节点ID去重及所有字段|
|入库明细|批次单/日期/量/单位/多余仓独立，不能计入已入库|同上|入库视图/原抽屉|批次ID/多余仓提示|
|出运明细|出运单/日/数量/单位/运输方式/关联|同上|出运视图/原抽屉|节点ID/方式|
|出库明细|出库单/日期/量/单位/业务类型/关联|同上|出库视图/原抽屉|节点ID/类型|
|明细关联/未汇总记录|稳定各流ID去重，共享待分配/未关联原因，来源依据折叠|同上|四流原EventTable原逻辑|关联ID/问题文案原样保留|
|需求来源与核实项|需求ID/来源码/量/单位/门幅/克重/问题、原始source时间|同上|顶栏入口及逐行详情|Verification原组件、无敏感原文|
|对账/货款申请|合同范围只读，未关联说明、金额权限、分页/逐行字段、聚焦/失效重取|GET sales-orders/:id/payment-requests|保留原抽屉对账页签|组件/权限/空/过期/分页|
|分批到料/只读计划|既有controller权限、到料modal、集货仓/需求分配/推荐运输/来源交期/排单版本|GET/POST material-arrivals（order、preview、commands）|组头/抽屉到料页签调用原slot|真实只读打开；写流程仅隔离fixture|
|计划历史/孤立计划|历史抽屉/上一页下一页最新，旧canonical计划仍显示|material-arrivals history|原Workspace外壳完整保留|历史/孤立/缺上下文|
|到料编辑保护|增加/删批/清空/旧分配移除，预览→保存，未知核对/同请求重送/导航未存提醒|原material-arrivals命令/回执|原modal/处理器完全不改|既有隔离UI测试+集成|
|刷新来源|sync+import才显示，原请求ID持久/合并/回执轮询/未知核对/同请求重送；无权限仅刷新页面|POST ainuoke/catalog/sync-order；GET sync/:id、sync-status|订单栏原ServerContractRefresh|隔离fixture真实点击；本机真实账号不提权/不采源|
|加载/错误/合成提示|skeleton、读取失败、auth/权限、synthetic提示|既有hook|保留现有门禁/提示|UI注入对应隔离响应|
|抽屉键盘/焦点|原Drawer overlay生命周期、Esc/背景/关闭、tablist左右键Home/End|无|原Drawer+扩展信息页签|键盘/焦点返回/滚动|

发现并保留需求清单外能力：对账/货款申请、多余仓独立数量、unknown供料、孤立已保存到料计划、历史分页、未知命令恢复、未保存导航保护、权限变化及历史来源语义。

## 已批准布局实施

订单行（款号/合同，原设置/刷新，来源核实）→横向6统计及紧凑来源提示→搜索/原状态筛选/面辅料筛选/全收放/密度/列显示→6视图→单一统一表格group行。默认自购，厂供独立视图，unknown保留独立分区。四流复用EventTable，不改关联/去重。抽屉增加物料需求/到料页签，原采购/收发/核实/对账不删；原到料slot、modal、controller原样复用。紧凑36px行、标准46px，界面偏好只保存密度/列名，无业务数据。1920/1600/1366同数据前后截图。

本机617张是真实历史接入库，源采集syncEnabled=false；当前原演示63051启动复用既有只读预览身份，0源登录。演示候选复用同一createApp/reader/loopback demo factory和现有身份，不改权限/密码，不运行迁移、不启动source worker，真实业务写拒绝。staging只是用户给出的定位链接，不在本次写入范围。

## 实施及初轮证据

原本机样本源时间2026-11-08 01:26仅4自购/3厂供，不能凑10。staging只读HTTP确认最新14:44真实来源10自购/3厂供；只读hydrateContractEvidence导出，原本机617库完整pg_dump恢复新本机副本zhixu_ui_dense_20261111，不改原库/线上数据。仅副本经既有importVerifiedMaterialArchive接纳PI2610-181，created=false，原本机UUID aa46192f-23b0-4fd9-9a37-55acc7703783，run78c2c95b-852e-43a1-808c-2ba8cd1dd42d，0源请求，不改源时间。副本全部617订单保留。

同一份10自购/3厂供真实数据，before-current与after1920/1600/1366截图已保存受保护本机目录。首屏自购可见5→10、4→9、2→7；13px正文，1920无横向溢出，1600/1366可局部横向滚动、名称固定。真实交互初轮六视图10/3/4/2/2/2、原行字段完全一致、分组/搜索/类型/列恢复/密度重载/详情8页签/只读到料/核实/刷新页面均通过，0业务POST/0源请求。新版输入状态未核实数据不填零。

隔离UI回归保留首轮失败：旧到料测试把“刷新来源”当本地GET重读，实际fixture没有目录，真实回执sync_catalog_not_ready；新增独立断言真实队列命令，context重读改为原focus入口。旧错误文案未渲染，改按当前原Alert标题断言。来源失败保留历史时旧孤立摘要可能在focus后回到正常分组，测试通过同canonical入口打开保存计划；日期直接检查input.value，不依赖移到抽屉的旧内嵌文字。首轮UI静态测试缺PermissionProvider也如实保留，修复后4显示用例与7业务事实用例通过。

catalog-ui正向刷新还发现实际UI回执退化：新标题在Tower内随model reload卸载，成功回执被销毁。已将原PageHeader/ServerContractRefresh保持在MaterialBody稳定位置，Tower仅通过UI ref打开原来源核实抽屉；不改刷新服务/队列/回执逻辑。此修复待最终静态构建和两套隔离UI重验，不把此前失败称通过。
