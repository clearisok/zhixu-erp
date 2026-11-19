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
