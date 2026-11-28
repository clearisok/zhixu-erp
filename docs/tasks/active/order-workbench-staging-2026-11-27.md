# PR178 修复、合并及 Staging 授权执行

用户在本聊天明确批准：修复PR178必要CI/Review问题、仅合并PR178到main、部署Staging并只读验收；不再重复请求上述批准。Codex转录用户决定，不冒充用户GitHub评论。不得部署Production、合并其他PR、改数据库/业务数据/Worker调度/清理/备份保留/网络；备份门禁失败、无法保留现有功能、需破坏数据库或修改其他PR时停止相关操作。

## 修复阶段 baseline

2026-11-27，feat/order-workbench，HEAD415a99c22007c668950edf6d861842e806fc73c2，dirty为空。已fetch main10b9a7d827e1c09f152ead58c21f26712d49a619及原PR分支，远端一致。source失败，team-access/baseline成功。仅一条未解决Review P2（PRRT_kwDOUKkHu868uXeS）：价格后续页失败时CSS按“没有table”隐藏上一页。没有其他阻断Review。Production workflow仅workflow_dispatch，普通合并不会触发生产部署。

source诊断经Codex CI provider取得实际head/check/annotations；job日志接口多次返回HTTP502，未回退CLI或假称取得完整日志。用户提供的1280/390超时和503 garment_read_not_connected、409 sync_catalog_not_ready作为待核事实；实际driver仍直接等待已折叠的“来源读取”。修复将逐宽度真实展开/读取/核对现有物料API/收起，保留原数据与布局断言，不提高超时或屏蔽HTTP/业务错误。503/409不能凭日志出现即判根因，完整本地/Hosted复核后追加结果。

价格修复只让成功加载的空第一页标记data-history-empty，按该标记隐藏空分页；失败页/非第一页保留原返回操作。新增真实51笔隔离调价历史、桌面/手机后页网络失败→上一页恢复→末页→上一页验证，保留未知请求/价格规则。

## Staging 保全方案（尚未执行部署）

实际公网build及Docker确认220ec86cb6cfa695c83ea474247bb01150075131 / staging-i174-220ec86c，project zhixu-quote-trial-i174-v2b，app image sha256:c0d84053c1dc89a2ce862c4da534e5f1e94d262923de6f933e84e8afeb193b61。源码包含PR176（Draft）及PR172/173，0061–0067已部署存储格式；当前Worker weaveops-catalog-sync-220ec86c运行，旧“Worker OFF”文档不能冒充当前事实。正式配置根/data/issue174-phase3-20261126b，原DB/对象/卷必须保持。

不能直接部署main旧后端。main只正常merge PR178；在独立部署集成工作树/分支，以实际220完整源码及新main合并提交形成候选，保留现有功能及0061–0067精确字节，解决仅工作台UI/测试/文档的交集；不更新176/172/173分支，不把其他PR合进main。若必须修改其他PR或无法证明保全即停止部署。

候选通过现有工程/发布及隔离兼容门禁后，读取实际Supervisor/policy状态，依原正式配对备份、完整性/恢复/正向cleanup/服务恢复门禁及trial.mjs流程发布。应用/网关镜像更新与原版本绑定按原机制，原业务库/对象/卷及调度/保留/清理开关不改。若正常流程不能在此边界内进行即报告，不绕过。部署前后比较关键业务只读摘要、迁移账本/权限及原其他模块；最终公网HTTPS、版本、DB健康、6233、历史与桌面/手机只读验收，不真实保存/采集。

本文件为恢复点，实际测试/合并/备份/部署/验收结果按阶段追加，不预写PASS。

8e1a修复已精确送达。Typecheck、完整Lint和Server前端Build通过；本地连续来源三宽测试通过，新51笔真实历史失败页回退桌面/手机测试通过。另两条既有价格UI测试暴露首次SSR按钮在React接管前点击被忽略：body停留订单总览、没有真实页签选中。driver改为有界等待实际aria-selected并在未选中时点击原按钮，保留原金额/颜色断言与20秒超时，无业务改动。
实际paired-backup check返回EXACT_TARGET_VERIFIED。误用仅适用于已安静Worker的supervisor backup-check在当前RUNNING上被拒绝SUPERVISOR_REQUIRES_REVIEW；代码明确backup_worker_not_quiet，本次没有执行备份或改变状态，不能称备份执行失败或通过。后续仅原正式受锁停稳/备份路径，无绕过。

## 必要修复工程结果

8e1a7e8258c9a278fca917c7478499aeb20c1926 包含价格分页UI修复和来源driver；12239a5d741e0475374fd4d321d6961fffd04d70 仅补价格driver真实页签选中。两次均官方git-delivery一次push且EXACT_HEAD_VERIFIED，无共享配置修改。Typecheck、完整Lint、Server前端Build（8e1a产品源码）通过，12239 driver单文件Lint通过；产品源码8e1a与12239一致，无需为测试等待再次改产品。隔离Linux实际Git对象副本：root1033/1033、release182/182、main10b9精确10路径守卫通过（8e1a）。12239 driver配8e1a同产品构建，三套实际Chromium35/35：continuous来源三宽、sale-adjustment含真实51笔失败后页回退两宽、workbench未知值/历史/权限/移动端全部通过；没有提高超时、删除断言或屏蔽HTTP失败。第一次32/35失败中包含父测试失败及两个SSR点击时机缺陷，完整旧结果保留，不冒称第一次通过。

Review P2 PRRT_kwDOUKkHu868uXeS已回复验证证据并解决；暂未发现其他未解决线程。GitHub最新HEAD的完整三项CI仍需最终成功才能merge。Issue177已回链新用户授权、修复与Staging保全方案，Project依原选项只将Status调In Progress，其余配置保留。

Staging 2026-11-27 23:32只读公网核实：HTTPS正常，build-info/health/permissions/6233详情/物料/物料历史/价格历史API全部200，正常现有管理员登录，无权限或凭据更改。物料来源stale：自购16（面料3、辅料13）、有采购记录15、有入库记录12；采购及入库完成16项均未知，比例null，旧待入库10项只可作为历史，不可伪报当前齐套率。原页截图保留本机outputs/order-workbench/staging-20261127/before-desktop.jpg，私密原始API不提交。业务写入0；来源刷新和订单维护均未提交。原crontab SHA256 c71caad3ddc46bf13a725ddd15e53b82345208ead6deb044e13dca3559716f82。

下一Gate：最终HEAD精确发布守卫与Hosted CI→仅merge178→实际220与新main独立集成→保全/备份/恢复门禁→Staging发布与只读验收。不能把本段工程PASS当成合并、部署或最终用户验收。

## 2026-11-28 目录过期来源 driver / CI预算 checkpoint

最终36ce已核实远端，team-access及baseline SUCCESS；source运行46025943527/job140597380243在2026-11-27T15:57:39Z FAILURE。已通过CI provider核实并由GitHub connector读取完整日志：continuous三宽原缺陷已通过；后续catalog子测试仍等待已由P4移除的旧常驻“这不表示没有采购”，实际body已有上次来源标记、真实1/1/1项数及两个待核对率。本轮保留原无旧summary断言，新增HTTP200/stale、真实采购事件存在、五指标精确1/1/待核对/1/待核对、当前待处理不得出现数字，finally恢复fixture时间偏移；本地完整catalog八子测试及父测试通过。未改产品文案来适配旧断言、未改数据规则、未延长任何单项等待。

实际Hosted SQL/API阶段15:34:06–15:53:20共19分14秒，UI阶段直到目录失败已4分7秒，仍有多套必选UI及Python未执行。整job上限25→35分钟，以容纳完整既有套件；没有删除步骤、过滤错误或降低每项断言/超时。后续剩余13套主线UI正在本地现有8e1a同产品真实构建上完整运行，结果单独记录，不预写PASS。

独立Staging预候选F7b1201d530d3e9cdf7a01932ec023e8218e482d 已完成具体错误反馈/alert/时区time/ISO/只读重读与无Browser回退边界保全：typecheck/完整lint PASS、前后端离线image5591d1f7/opacd28e87构建PASS，受影响compact+workbench两套25/25 PASS；其他五套H1来源/交付/物料/历史/价格51/51 PASS（不同checkpoint精确区分，不冒称F7重跑76项）。root1035/release182/47路径guard为H1结果。尚未创建实际main集成，仍无线上服务、数据库或Worker更改。

网络：36ce正式脚本最终DELIVERED_VERIFIED，但只读Git预检发生不确定传输，工具明确NETWORK_DEGRADED；其后GH API规则读取一次EOF亦已停止该通道读取。依AGENTS 131/136，不再在后续Gate自动push同通道或自动执行恢复命令。新checkpoint仅本地；需要用户执行工具给出的官方精确HEAD恢复命令并告知通道状态，不能将本地新代码写成远端已交付。GitHub connector只读main仍10b9、branch protection disabled、PR178唯一Review线程已解决；没有因CI失败合并或绕过门禁。
