# Server交期维护界面与原请求恢复

## 范围和所有权

2026-10-24，D083/D100/D147/D154/D156；复用[0042后台契约](SERVER_DELIVERY_PLAN_REQUESTS.md)，后台3e869及da5b订单持久化文档保持冻结原文。当前只受控前移已明确批准的标题小按钮和Foundation弹窗，不改变合同交期、订单数量、生产或商业事实，不新增路由、Source读取或旧数据迁移。当前工程结果见下方独立冻结证据；发布与最后守卫仍后置，不借原2a测试。

订单详情中“维护来源”与“维护交期”独立维护各自owner，合并导航、退出和未保存保护。只有当前session的order.view/order.edit及有效订单能维护；已完成/取消订单沿既有交期后台规则，不扩大其他业务权限。加工单显示无艾诺科合同对照，不伪造来源日期。保存后重读当前详情和已展开计划披露，历史回执不冒充当前集合。

## 编辑、预览和确认

现有Modal内显示来源合同交期和有效计划；新增、修改日期/数量、显式作废、保留作废历史和稳定行身份。未改变的系统默认0/null不强制转换成人工正数，遗漏行不等于作废；实际差异才进入命令。人工数量为精确正十进制字符串，用整数十进制运算比较；差额只提示、不分配、不截断、不修改来源数量。过长汇总不可安全显示时明确不可用，不冒称0或浮点总数。

编辑→变更预览→确认保存；弹窗880px范围和局部表格样式，手机按日期/数量/操作行呈现。标题双维护入口手机独立一行，保留原来源操作，320 fine-pointer及coarse-pointer均可达；长数量换行，正文单滚动，固定页尾。共享Modal新增可选closeDisabled，默认调用者行为保持；提交或未核对原请求期间不能通过按钮、遮罩或Escape绕过锁定。嵌套确认关闭后仅在同owner且最上层的维护框恢复焦点。

## 单一原请求和故障恢复

GET/PATCH及只读POST receipt均使用既有Server客户端；严格shape、原SO/UUID/CAS/完整意图，禁止query selector、金额或Source私密字段混入。一次同步锁避免双击；layout/session/epoch/sequence及abort保护换单、A→B→A和迟到200/401。abort不证明服务端回滚。

sessionStorage键zhixu.server.delivery-plan.pending.v1.<publicUserUUID>只保留本actor/tab一条schemaVersion1、userId、savedAt及原命令（原SO、requestId、expectedVersion、upserts、voidIds），上限64KiB；无凭据、令牌、金额、服务端快照或Browser业务集合。先完整写入再读回精确比对才发送。损坏、未来schema、不同owner/请求或存储不可用均保留并阻断，不覆盖/清槽。刷新仅恢复核对入口，不自动PATCH；关闭标签页或人工清理可失去技术槽，不影响服务端历史。

发送失败/超时/回执不符保持unknown，不清槽、不自动重发。精确unknown只开放二次人工确认；重发前再次比对完整原槽，同UUID/CAS/body，一次确认最多发送一次，发送即撤销旧许可。再次unknown须重新核对。只有已验证的applied/rejected终态才清除同一原槽，再读当前集合；CAS冲突显示未保存，明确重读和重新核对，不静默rebase。原请求恢复不创建新业务身份。

## 验收与安全边界

本轮driver明确完整ExpectedSource、before精确922静态和after本轮自有构建，driver/rendered身份分记；只运行自有合成PG、loopback和私有Chromium，确认退出后才删本轮profile，退出不明保留。真实CDP touch独立于Emulation+DOM click。测试覆盖八宽九模式双入口、默认0/null、64位数、预览/取消/作废、重复点击、lost reply/unknown/原意图重试、存储故障、CAS、迟到401、七角色及原Quote/P6/共享Modal相关回归；结果和截图按本轮实际SHA冻结。

不修改Browser namespace/IndexedDB/Seed/备份或已有体验环境，不安装依赖，不读真实凭据/Source、不绑定/激活/调度或部署。coverage、0043和关账待决口径不随此UI导入。NETWORK_DEGRADED时不逐阶段重推或触发CI；最终累计PR前仍需两条发布检查及必要合并检查。

## 当前隔离工程证据

2026-10-24产品56b/最终driver0e12：57相关、811根、类型NodeLint、双构建产物及before3/after14/Quote9/P6 14/物料17分阶段联合57浏览器通过。两轮触摸失败及回归前置缺env失败原件保留，只补受影响范围；不把联合写成一轮全绿。23PNG/4JSON、10图实际查看、八宽九模式和390真实CDP touch。详见[本轮证明](../tasks/completed/2026-10-24-delivery-plan-ui-current-engineering.md)。新发布134、精确main守卫和最终独立复审后置，不称HostedCI/合并/部署/人工接受。
