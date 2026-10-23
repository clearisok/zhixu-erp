# Gate6B Server排单页面工程证据

记录日期2026-10-21（Asia/Shanghai）；root唯一writer，既有reviewer只读独立复审。
输入为干净codex/server-production-planning / 6524c7d0b24f60e96c0abb39be4fa3e194ed7b4a；
main经独立GitHub API核实996dfedc12da3527343cd3ff2aa5eea35497e10e。输入三摘要按Git blob逐字归档
`2026-10-20-gate6-inputs/planning-ui-6524c7d0/`，未覆盖更早证据。

本记录的最终应用/验收源为 **919643d8cde2b0ec22987631e685e6a661829881**。
本文件冻结及清单绑定使用后续真实commit；不编造自指SHA。尚未交付本批最终head或运行其新CI，
这些结果由[Gate6任务](../active/server-convergence-gate6-2026-10-20.md)前向记录，不能从旧绿灯推定。
6524的Source39446392644/Team39446399962/Baseline39446406949已全success，但属于旧读取层，不借作本页结果。

## 实现与边界

- authority wrapper在挂载前选择Server，不调用Browser排单/订单/资料/款式进度repository；原namespace和数据不改。
- 原排单路由/菜单仅在orderRead=snapshot且order.view + schedule.view下开放；默认关闭、其他旧路由仍关闭。
- 组MasterDetail/队列、全局分页订单池、同单内部/外发抽屉、精确字符串表单、预览与历史复用已有Foundation布局/样式。
- 新执行方/日期明确选择，当前重复颜色不以首行冒充合计，零剩余不一键清成零；实际完成/物流不显示假零或无风险。
- 提交前缓存原actor/tab命令；完整session lease与同步busy fence防双击及A→B→A迟到响应。先GET核对，
  仅当前session对相同缓存查到unknown后才允许独立人工重试原requestId/intent/previewHash，不自动POST或换编号。
- fresh权限、订单/Assignment/组CAS和完整预览指纹保持。已验证回执才确认移除原缓存；损坏/不符/网络失败保留证据。
- SAVEPOINT内预期领域404/409/422先回滚再持久rejected；清空成功SO桥接。SQL/审计/连接异常仍整体回滚、未知。
  客户端校验请求、hash、replayed与HTTP状态，裸422不能清缓存。无新schema、业务公式、金额或角色grant。
- 使用protected router防具体查看订单按钮绕过离开保护；取消/重排在等待预览时禁用输入；历史翻页合并各页采用资源摘要。

## 实际执行结果与来源

| 检查 | 实际结果 | 源/说明 |
| --- | --- | --- |
| 客户端/表单＋Quote authority单元 | 40/40，1008.0729ms | 464927f9的同一函数字节；含默认关闭、snapshot开启及未开放路由负控 |
| 原order-read回归兼容 | 2/2，479.6947ms | 125789aa5d5d011d468f4b7bd00e74c23232cbe9，保留默认关闭负控，不修改业务代码 |
| 资源、计划契约/PG/API/升级、客户端/表单/authority定向组合 | 126/126，57485.9596ms | 6baca85d04f6b4ca61c5a68bef899865ed51d6d4 |
| 首轮实际PG/API容量修复 | 33/33，20664.3349ms | 预览后跨SO499→500、唯一拒绝回执、0新计划/版本/成功bridge、改组后新预览成功 |
| built排单＋既有资料＋导航组合 | 49/49，84532.6526ms | 精确6baca构建；17排单＋14资料＋18导航，无真实账号/业务库 |
| 最新排单built与防重叠几何 | 17/17，32133.1662ms | 精确919643，16业务场景＋父测试；修复后source不是旧49来源 |
| 项目完整回归 | 927/927，255258.9075ms | 6baca函数源＋125789测试兼容；发生在最后3行Server限定CSS修复前 |
| 发布基线回归 | 116/116，253470.1828ms | 同上；新证据绑定后最终清单/守卫另行核实 |
| PostgreSQL完整回归 | 261/261，268996.2674ms | 同上；没有把旧261当本次执行 |
| 全量TS、lint | PASS | 919643最终源；日志分别为ui-types-919643d8、ui-lint-919643d8 |
| Server frontend build、三build-info与实际Node app导入 | PASS | 919643；先frontend完成再Node compile/import，未并行清理dist |

6baca→919643的实际Git diff仅Server限定CSS、两个验收文件和阶段记录；
`server/production-scheduling`、`features/production-scheduling/server`、quote authority与AppShell应用字节完全相同。
不因CSS修复借用旧像素结果；最新17在919643重跑。新manifest/文档增量的最终项目/基线与guard结果在active任务前向记录，
不改本冻结记录以冒称此前已执行。没有忽略skip/cancel；以上通过项均0 failure/skip/cancel。

## 浏览器事实和可复验材料

`server/integration/production-scheduling-ui.integration.test.mjs`通过真实built路由、可信session/API和一次性PostgreSQL，
不伪造Server DTO；私有Chromium profile只由本测试创建、使用和清理。覆盖：
空库不Seed且不初始化任何Browser业务localStorage/IndexedDB；分页/空格且搜索/执行方分页；精确40.125和ceil21；
重复颜色待核对；并发CAS保留输入；外发固定日期与停用主数据仍采用旧事实；多订单重排保护固定日期；
丢回执/摘要不符；缓存后未发送/迟到原请求/数据库pending/明确unknown人工重试；具体订单跳转强保护与损坏缓存；
只读/拒绝角色无金额；POST和GET回执200/401跨A→B→A不清缓存/不登出新用户；取消等待输入禁用；
52→53追加后历史翻页仍固定52并保留旧组名；撤销全部写权限/恢复；零剩余保护。

1920、1536 DPR1.25、1440、1280、900、390实际窗口均检查document宽度、弹窗与输入边界；
最新还断言搜索与视图控件矩形不重叠。root直接查看919643的390队列/表单及1536截图，未冒称用户人工接受。
材料在本机ignored路径`outputs/production-planning-ui/919643d8cde2b0ec22987631e685e6a661829881-1792513138892/`；
原历史PNG/ID/批准记录不覆盖，本记录不是自动截图基线更新。选定文件SHA256：

| 文件 | SHA256 |
| --- | --- |
| queue-390.png | 3f3ef5a7b4ede82d6b6772153fa869443385fc48efa6ac2f58c2954baf2399e8 |
| form-390.png | b840aca19bc6168938ac92bce44e401e399f76cfc00a1b92c0e84d1146e226e1 |
| queue-1536.png | ec680f87366d7acc29a9115ac434b352f0c633ad8b495e572e1b20018eda3d36 |
| anchored-history.png | f5451fe639ba6bd03e104c9fb6a7f7b7828e964367c010d426b584d6a7236ede |

## 中途失败、复审与限制

首个TS检查一处state可空、首个lint测试unused警告已修。首次1bf built窄屏隐藏Master后空状态不可见，
b915补详情EmptyState。随后脚本未等待表单、延迟已卸载视图的ABA请求、保留edit却误期GET403分别修正测试前置，
未放松产品保护；原失败日志/资料保留。cc8移动视图按钮被通用Toolbar隐藏，464限定Server恢复；
46f9/6baca几何虽通过，root像素检查仍发现390搜索挤压，919643限定分行并加实际非重叠断言。

独立只读复审指出并确认修复：具体Button导航绕过、预览输入竞态、容量422缺持久拒绝、回滚后JS成功orderIds残留；
还修复原snapshot开启仍断言排单关闭的旧测试。reviewer未运行测试/DB/网络，实测结果由root完成。
旧Quote长验收45通过/44失败/2取消及31未启动是另一个历史缺口，未被本批数据抹去。

无实际完成、成衣出货、Server关账或完整ERP闭环；未来CNY销售/USD工价不换汇、不改历史。
未合并/关闭#120–127、未建重复累计业务PR、未部署/升级62426（仍Gate1源8175），
3001/50426/59069、旧卷/工作树/Browser资料保持。没有真实账号/业务库或新增艾诺科读取、绑定、激活、调度/退役。
