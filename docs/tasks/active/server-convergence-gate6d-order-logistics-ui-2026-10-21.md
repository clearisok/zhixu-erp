# Gate6D：原物料与运输弹窗接入Server

2026-10-21，root唯一writer，既有reviewer只读。上一Goal turn是progress：订单集货仓后台/0038、真实合成PG/HTTP与历史保护、源码ffef和文档01eca完成；完整Server目标仍未完成。

## 基线

- 新分支codex/server-order-logistics-ui从本轮GitHub只读核实的main996dfedc12da3527343cd3ff2aa5eea35497e10e创建，明确FF到干净01eca83d794d62557e9f3ce579bdb71477c98f5a，无继承dirty/reset/rebase。
- [输入三摘要Git原文](../completed/2026-10-21-order-logistics-ui-inputs/01eca83d/)保留时点/hash/限制。后台[冻结工程记录](../completed/2026-10-21-order-logistics-context-engineering.md)不代替本页面验收。
- 当前Git写仍STOP_AUTH_OR_DIVERGENCE，664f实际非零原因未证实；只读main成功不证明恢复。不重推/换认证，不merge/close/deploy。

## 页面与命令契约

1. 复用原生产排单“物料与运输”按钮、Modal、集货仓选择、备注、预览/历史及Foundation样式；不新增菜单、扩大密度或重设计。订单详情和队列/订单池使用同一当前物理SO，不读取Browser repository或推断默认仓。
2. 使用0038唯一路径，严格验证当前读取、预览、成功/拒绝回执及25条锚定历史，金额/令牌/未知字段不进入显示。读取回执不拼成当前资料，成功后另读最新投影。
3. 原ProductionCommand前向增加set_order_tracking，保留schema1、原user/tab单槽namespace/旧计划执行字节。三类命令共用一条未决槽和session lease，原请求持久读回后才POST，不另建writer/恢复账本。
4. 换人/A→B→A、401、异步旧200/hash失配不能消费新槽、退出新会话或更新新视图。损坏/未来/未知/撤权原字节保留。只有同session明确GET=unknown后可人工重试同编号/全部原内容，绝不自动POST。
5. 仓使用既有六kind资源客户端显式搜索/分页；只有用户明确选择才有值。无记录显示未设置，已有停用引用仍可显示/保留或清空。保留输入并读最新版本后必须再预览，不静默改仓。
6. 仍为order.view+schedule.view读取、另schedule.edit写入，页面服从fresh canEdit/冻结资格。没有认领/商业采用、金额、物料日期或价格前置。

## 验证与排除

先客户端/原outbox/表单纯测试，后同一合成PG/HTTP及真实built Chromium：明确选择/空值/清空/停用/改名、历史锚定、CAS、丢回复核对、未知/权限撤回、旧缓存、共享槽、ABA、导航和六宽几何/像素。按V1逐路径登记现有交互的Server接线，保留原证据/PNG；能力状态如变化先新冻结分维度证据。

全类型/lint/相关SQL/API、前端和顺序Node构建、项目/发布基线及精确main守卫、独立复审后独立源码/事实commit。工程/远端/部署/人工接受分别记录。

本阶段不新增SQL/真实查询、ExpectedArrivalBatch/逐物料推荐算法、正式6086979采集或Server关账；Source交期不冒充预计到仓。保护3001/50426/59069/62426、旧卷/工作树/Browser；62426仍8175，不升级体验、不动真实账号/业务库、不安装依赖或共享配置、不调度/部署/退役。D1935/D1933单次许可已用完。

## 结果

客户端先红2pass/4fail（新方法尚未接线，589.0281ms），随后原计划/执行/单槽与跟进客户端共41/41（1165.8484ms）通过；纯Response合成不当作HTTP/页面验收。既有reviewer只读复审客户端无新增安全阻断，要求同步旧页面applied联合类型/文案，页面接线已纳入。
页面原组件接线完成，类型首次捕获泛型返回TS2352，改为已验证union实现/泛型重载后通过；没有unknown强转绕过。
原41客户端重验41/41（1585.0935ms）；新增同一客户端访问真实合成HTTP，连同原严格/后台/升级共24/24（33683.0579ms）。
独立复审发现两处P2：可选跟进挂起阻塞原计划、冻结后只读误显草稿。已改独立抽屉owner读取、只读展示保存事实并标草稿，原built fixture补对应挂起/旧401/503与冻结retain场景；尚待实际运行。
旧drawer401的commit→passive清理窗口进一步通过layout-committed实例owner与请求lease收紧，fixture在新Modal首次挂载的MutationObserver中释放旧401，不靠等清理之后再验证。最终类型exit0；全lint曾exit0，后续该小修仍在最终重验范围。
本阶段最终lint、实际built浏览器和最终门禁仍待，不冒称PASS。
源码checkpoint为2a0cec28a0ab736c6f7500bf512dd7260364c5cb，显式Server build20261021-171525/2026-10-21T17:15:25+08:00及顺序Node构建exit0，未部署。
首次built27pass/2fail（29含父项，64735.1027ms）：原26子场景及首次跟进已通过，下一场在异步仓目录尚未到达时直接读取不存在option.disabled，属于验收等待错误。补明确候选存在等待，不改应用或断言语义，原失败保留；继续同一应用build完整重验。
第二次built34pass/2fail（36含父项，109011.6345ms）：跟进并发/回执/冻结/可选GET/权限/ABA均已通过；历史锚点检查已通过，随后在新队列到达前提前取得undefined按钮标签并将其固定为click目标。失败现场稍后已显示真实SYN-PLAN-30行。补目标存在等待，不改应用/域规则；几何等后置项仍未运行，继续同一2a0应用重验。
最终第三次built37/37（36子项+父项，95398.3492ms），0失败/取消/跳过；应用仍2a0，测试相对checkpoint仅3处只读等待（两处失败修复+一处几何资料前置），没有删除/放宽原断言。共享六资源built回归23/23（37806.8778ms）。root与独立reviewer查看1440/390跟进表单/预览，reviewer另看历史；三P2实际用例通过，无剩余阻断。图片/geometry保存在outputs/production-planning-ui/2a0cec28a0ab736c6f7500bf512dd7260364c5cb-1792574544755/，没有覆盖旧图。
项目/发布回归及最终全lint运行中，终态及最后精确SHA门禁仍待收口，不借旧CI。
