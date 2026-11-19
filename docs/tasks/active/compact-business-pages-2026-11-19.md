# 2026-11-19 紧凑业务页面 UI v1：用户授权与实施契约

Refs [Issue155](https://github.com/clearisok/zhixu-erp/issues/155)。Codex转录本聊天用户明确请求，日期2026-11-19（Asia/Shanghai）；用户提供四张红/蓝/黄/绿/黑框截图，具体布局本身即获批准的对照，不需额外设计审批。

允许范围：报价列表移除重复英文/大标题/计数说明；更多、新建报价移到现有顶栏右侧。订单列表移除横向导航/重复标题/技术来源栏，保留真实数据源与权限；全部合同/历史查阅、导入加工移顶栏。订单列表/款式进度/风险预警整合左侧二级菜单并保留路由/当前状态。正式详情工厂款号为主、SO/BillNo为辅整合订单概况头部，状态保留；维护来源/交期移顶栏；全部原模块保持。

成衣计算价与客户真实确认价分成独立列；前者黑色醒目，无确认状态；后者金额/灰色状态上下两行，未确认金额为横杠，多真实价格使用原范围并可查看价格方案。仅复用businessValues的garmentPrice、confirmedGarment和confirmationStatus，不以计算价填确认价，不改确认判定、CCT/PV解析、金额/币种算法、历史数据或业务模型。未知关联仍明确显示，不能归类为未确认。

默认布局及此前原版组合偏好的价格组升级为独立两列；已有独立字段视图、隐藏/拖动/手动宽度和权限继续保护。UI偏好如需增加新确认字段仅做向前幂等转换，不写Browser业务库/换key/Seed/清空。窄屏优先可读和表内滚动，不能压坏所有字段。

共享顶栏actions复用现有AppShell和持续Server壳，内容用真实React portal保持页面owner、权限和弹窗状态，路由/身份更换卸载，不能把页面回调变成陈旧壳缓存。其他页面无actions时保持原样。左侧菜单复用现有订单导航与安全导航守卫。

验收：四个指定桌面尺寸1366×768/1440×900/1920×1080/2560×1440、多个缩放；真实浏览器前后图/几何、导航/刷新/直接路由/权限/按钮弹窗/筛选排序分页/报价历史/未确认部分全部及多价。隔离数据明确合成，不向Staging写示例价格或历史。单元、typecheck、lint、build、基线及相关浏览器回归。

交付授权：独立分支、push、Draft PR；完成验证后使用已有正式安全机制部署未合并候选至Staging，核实SHA/服务/备份/卷及回滚。若正式机制不支持未合并分支，则报告具体阻塞，不合并/绕过。Staging部署后停止等待用户人工验收；未批准合并本PR或其他PR/Production/破坏数据。此任务不影响已有同步安全门禁，部署需确认唯一Worker与版本绑定，不能照搬旧备份PASS。

基线：GitHub连接器独立核实main4a8c9bc24b00983d0d79150349adeed5a333a237，本地对象存在。起始worktree clean de6f36b7d62d51c79a94a2859eedd45e6d20fa7a（此前操作记录分支，完整保留）；新分支feat/compact-business-pages从main4a创建。开放PR136只有Git工具无UI重叠。fetch被现有127.0.0.1代理拒绝→NETWORK_DEGRADED，未改全局配置；工程与远端交付分别核实，缺交付不能冒称PR/部署。

状态：实施中，尚未测试/创建PR/部署，不预写PASS。初始业务检查：server/quotes/business-source.ts复用resolveConfirmationSource读取当前CCT或PV确认快照，businessValues已分离真实确认价；订单维护组件与原权限/导航守卫保持。无需SQL/schema/业务数据迁移。

首批实现：AppShell页面owner portal承载主按钮；正式列表/详情冗余hero移除、工厂款/SO/BillNo放概况；确认价格字段默认/旧组合偏好向前幂等接入。原服务器readBusinessSources/businessValues未改变。17项定向价格/偏好/权限/原投影测试通过，首次15→16默认列断言已按新增字段更新。typecheck已通过第一版；root/lint仍运行，最终精确代码另核实，不预写PASS。

发现真实既有能力限制：正式Server allowlist不包含款式进度列表/风险预警；这两个旧页面读Browser本地Repository，不能直接启用混用数据。已向用户说明并询问是否保留原禁用边界或先不部署另定范围，其他实现/隔离验证继续。不会通过改allowlist绕过。

## v2：用户明确废止款式进度列表与风险预警（2026-11-19）

Codex转录本聊天追加决定：用户确认这两个功能以后不再需要；订单中心只保留订单列表，原三Tab迁移二级菜单要求作废。删除两功能入口和不再需要的路由/页面展示，不做PostgreSQL/API接入。数据库历史/表/共享接口未经另批不得删除。继续其余UI与Staging候选部署，未授权合并/Production。

依赖审计：两个根列表路由仅分别导入StyleProgressPage和StyleRiskPage，均未在Server allowlist内；可清理其路由、专用页面函数及列表导入弹窗/补日志私有辅助。OrderCenterNavigation仅提供三Tab，已删除组件及全部引用，撤销此前新加左侧子菜单。不能删除整个style-progress-pages模块：其StyleProgressDetailPage、LegacyStyleProgressDetailPage、OrderStyleProgressSummary仍被订单详情、全局搜索与生产排单复用。保留/order-center/style-progress/detail、MaterialControlTower、所有来源/物料服务、DB/迁移/Repository/数据和共享接口，仅将其返回链接改为订单列表，防止死链。不再保留空Tab容器。数据库零结构/数据变更。

补充回归覆盖：废弃根路由无入口，直接访问不读Browser；共享物料详情仍能访问，原生产/物料计算回归保持。权限和保存保护不变。

247bb83e真实生产构建+新隔离PostgreSQL+独有Chromium八项通过（60.744秒主体，74.720秒总计）：四尺寸×三页12组合、75/125/150%等效CSS viewport/DPR×三页9组合，无文档/工作区横向溢出、顶栏按钮完整且无重复hero；真实持久合成确认三态/多价范围及详情链接；菜单/设置/独立与组合列视图；实际新建草稿跳详情且旧顶栏动作卸载；报价分页、订单分页/排序；合同切换、加工导入、来源/交期弹窗与刷新；废弃根路由不展示旧页、共用物料详情保留；受限会话不显示价格。截图/几何JSON在本机脱敏artifact目录，非真实客户业务数据。

只读Linux full npm test在247bb83e为1025/1026；唯一失败是历史production-scheduling测试读取已删除导航文件，现已改成断言废弃导航不存在、共享详情存在；定向25/25通过。Windows早期full根测试因旧两文案断言失败及baseline子进程长时间运行而主动结束，仅停本任务本机child4636，不触及Worker/用户浏览器；不计PASS。第一版typecheck/lint/前后端build通过；v2最终仍需精确HEAD验证。

查看真实1366截图后只将同CNY多价格显示压缩为“¥91.25–108.75”（原business值/数值/详情/完整tooltip仍不变），自动确认列最小138、款号自动下限144，手工列宽不改；17项专项再次通过。正在从旧正式镜像独立提取公开静态构建4a以同合成数据做前后几何/截图对照，不读旧镜像秘密或真实数据库。

c8e82b11全量npm test已在Linux只读networknone完成exit0（106.547秒），产品输入与后续仅测试/文档修订分开记录。此前before对照主场景21组合全部完成并保存results/截图，但Windows Chrome关闭超过旧6.5秒预算，主测试失败且资源未进入后续finally；只保留观察证据，不称该wrapper通过。已将本任务浏览器清理改为有限10秒+10秒，并用嵌套finally保证fixture关闭；精准核实并清理自己创建的tmpfs PG a81e8dbdd429…及已结束本任务child28464，不碰其他本地容器。新c8前端构建后完整真实浏览器八项exit0（79.315秒），所有新PG/Chrome自动清理，修正价格区间已实机验证。追加实际客户端导航/搜索/筛选验证，不改变产品代码。

预部署复核发现既有CI连续同步浏览器回归仍查找已删除的独立h1，并断言概况不含SO/BillNo（ainuoke-continuous-ui:90–97）。这与用户明确的新布局相反，已仅更新该UI回归：概况内工厂款/正式编号/合同号真实匹配、头部内边距包含关系、无冗余hero；共享物料详情断言不变，并保留其六宽度含390移动回归。不是恢复旧UI或改变业务断言。CI原source仍进行中，必要测试修订将正常推送后由原CI运行，不绕过检查。

既有连续同步UI在新概况身份/六宽度检查中进一步复现“返回订单列表仍等旧h1”定位超时，其余七角色/物料四流、登录/脏保护、1440/1280/390布局均继续通过；已将返回定位改现有顶栏标题。交期维护回归也仍从旧PageHeader找操作组，改为现有topbar下标题；全部原可点击/权限/触控/业务不写断言保留。概况工厂款使用语义h1且保持21px原观感，兼容共用旧回归的标题滚动定位；新增顶栏触控44px下限，桌面保持40px。此为共享组件必要回归修正，未扩展业务。

70be构建的紧凑UI八个子场景、连续同步十四个子场景全部断言通过，但Windows Chromium退出未确认导致主测试非0，不冒称整套PASS。交期回归真实390宽发现旧grid使操作仍与标题同排，原flex-wrap不生效；修正仅有actions的tablet/mobile顶栏grid跨行与自动高度，保留44px触控目标。废弃根路由回归按明确取消契约断言404，其他未启用路由保持原阻断。需新构建验证。

5396846c已DELIVERED_VERIFIED，typecheck/lint/Server build退出0，GitHub team-access（含全量npm test及Browser/Server构建）和baseline通过；交期维护实机14/14完整通过，含320/390触控及权限/未知回执，清理PASS。紧凑UI八子场景再次通过但Windows Chrome退出仍超时，不称整套通过；将新紧凑回归纳入既有team-access私有Linux Chromium，正常CI验证，未删检查。
部署前03:02Z当前4a Worker因catalog_identity_or_scope_changed停止，SQL enabled=true/paused_reason非空，Supervisor正确RECOVERY_BLOCKED；这发生于本次UI切版前，无本次运行修改。保留暂停，UI发布不清该来源故障、不启动Worker或采集真实接口。需要按保留暂停正式机制部署，工程与来源健康分别汇报。

a44455d3最新team-access CI完整PASS（含新增Linux Chromium9/9与清理）、baselinePASS。source CI已通过全部SQL/会话/权限及前段UI，在material-history-ui:56因等待被批准删除的hero说明“含历史记录”失败；实际历史SO及历史重复行均已显示。仅改断言为真实订单范围select.value=history，原历史身份/只读/事件/撤权/无写入检查全保留，需定向和新HEAD CI。产品源码与a444/5396仍完全相同，不能说a444三CI全过。旧版本受控备份仍进行，不切版。

## 90de候选正式切版检查点（2026-11-19）

三项Actions全部SUCCESS，最新候选全量1026、发布基线182、紧凑Linux Chromium9均通过。物料历史旧hero断言修后9/9；CI未执行后段四套浏览器独立43/43通过，之后90 source CI完整通过，未跳过任何步骤。

正式发布已按原trial/Compose机制完成，仅3无状态容器重建；原4卷、database/objects、旧镜像及52文件回滚资产保全，23人工表/3账号权限/630订单身份零差异。公网build90，正常会话真实浏览器12组合、7现存服务器报价、维护和更多功能及正常logout PASS，0业务写入/0来源刷新。首次私有QA脚本误用“更多”而非“更多报价操作”超时，修真实定位器后完整退出0；不是产品失败或伪造通过。对照截图报价表上移86.9px、订单204.9px，保持品牌与可读性。

旧版配对备份20261119T032302Z-a97b1f27于03:37:40.328352Z成功恢复服务，独立56文件/3419126506字节dump/11对象/143表哈希通过。新版本90配对备份已启动，终态尚未验收。切版前已有的catalog_identity_or_scope_changed安全暂停和原B4故障保留，0Worker，不宣称自动同步恢复。待新备份及最终只读健康检查后交付，禁止合并/Production。
