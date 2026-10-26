# 当前main人工预计到仓后台整合

root唯一writer，既有独立审查者只读。

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T04:19:08.956Z独立API核实，开放PR为0；branch codex/material-arrivals-main-869e从该main创建，显式快进已审订单物流弹窗1b47fb2b646a5c1347a377cf44c9b5cff25db37e后普通合流原0039后台557ce07bb71195f1fef9cec9e10f3cf8b55b4add。全部非docs逐blob等于已验收源码c994eac8aee32f9e6877fa81e65a604376760519。

## 唯一owner与事实保护

人工ExpectedArrivalBatch/Allocation由server/material-arrivals独立拥有；来源快照、人工计划和实际入库分离。只取明确持久化Hub，Source供应交期不自动变成到仓日期。一项需求可分多批，部分未安排合法；正十进制逐需求比较，不跨单位总计，不自动补齐、换算或截断。稳定UUID保留完整业务身份，数量变化可唯一重识别；规格/颜色/单位、厂供、歧义或缺失均保留旧计划并提示核对。

非空计划需Hub，仓变更不会自动把旧日期改成新仓日期；每版冻结tracking/Hub/Source和需求证据。GET/preview不创建批次或注册需求；实际保存才持久化。缺来源只允许明确清空已有计划，不借历史快照新增分配。完成/取消/历史重复或身份不可信订单阻断新写，历史按物理SO保留。金额白名单、读order.view＋ainuoke.view＋style_progress.read/写再加edit保持，无负责人或商业金额前置。

复用原Source完整分页/精确合同/有效归属/时效及Material pipeline，caller事务内读取，不新增HTTP采集；锁序profile→物理SO与发布一致。所有持久化、历史、日志和回执同事务；提交结果未知只核原请求，不自动重发。0039只空表前向引入，不应用到现有目标，不seed/backfill或改0034–0038/Browser账本。

原容量P2红例compact7506/PG8726导致500已在c994修复为原SAVEPOINT中的统一8192字节预检；SQL预算不扩大，原红绿与PG7326正控记录保持。审计类型只增加action/entity联合，单路径V0没有视觉差异；原记录逐字归档。

## 合流与验证归属

当前依赖与原557ce共同祖先83a；直接普通合流保留所有N/B/L和11c6 witness。只新增两个原独立文档证据，没有新的同路径分叉，不另造mergeOf；全部原父对象/状态/runtime/截图不改。

原c994 canonical archive SHA256 3c45c607c83f1bb549f0ae446d346bf400b3c99b165c2588bf5dc96cd0e0d773、24文件218项相关测试（217通过/1既有Windows平台SKIP，0fail/cancel）、根811及类型/Node/load/lint实际记录已核对；proof 761267deb29796206de5492fa01bb79a417680b1原字节保持。跳过的是原Linux Source CLI集成场景，原guard和CLI blob不变，未验证路径不称通过，必要Linux CI仍是未来合并前置。原49aa9b发布134和557ce旧base守卫保留其日期及范围，不能覆盖该SKIP。本轮不重跑未变API、构建或浏览器；最终commit只新跑精确N源码守卫，正式PR仍须当前发布134和必要三CI。

准备时最终commit/新守卫/独立复审尚未完成；以outputs/material-arrivals-main-869e-20261026同HEAD终态为准，缺失不算PASS。原[后台任务](server-material-arrivals-current-2026-10-24.md)、[工程证明](../completed/2026-10-24-material-arrivals-current-engineering.md)及[契约](../../features/SERVER_MATERIAL_ARRIVALS.md)保留原日期/source/失败和平台限制。

## 交付与后续

H0d70精确交付授权保留，Execute/Push/新PR/Hosted仍0；普通PowerShell亦复现TLS失败，根因未确认，不重复未改变通道探测、不改共享代理/TLS/认证，不把H授权扩展到本分支。没有自动合并/关闭PR。

本阶段没有新凭据/真实Source/账号/业务库/对象/卷/备份操作，不替换3001/50426/59069/62426入口，不激活、调度、部署或退役。原1b47/7db/588d/81f和38580受保护镜像分支及旧结果保持；未使用继承的旧persistent演练驱动，未来镜像演练须复用38580已审归属保护harness。

完整G1–G8/R active。本切片无新页面/逐批物流闭环；下一步预计到仓UI，再0040/41出运观察和0042交期依赖。关账三问、目标切换、人验、真实Source额度/激活和退役授权仍独立。
