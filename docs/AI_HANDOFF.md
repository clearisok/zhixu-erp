# 接力：Issue159订单删除候选开发

2026-11-20；核实main基线636a5ad0d2d1acbe6b2705696e782dea12ee9f00，分支feat/ainuoke-source-deleted，自clean main新建，不包含旧分支运维checkpoint。PR158已合并/Staging636a继续运行；之前两轮257+257通过的运维记录保留在旧分支32293c35，不把本候选冒作部署。

用户明确要求「订单删除」生命周期/红色异常/停止已删除来源自动任务/重新出现恢复/历史保全；仅代码、本地实机演示、测试、独立PR，不合并、不部署、不写真实状态。Issue159已有用户决定v1转录，Project In Progress。0060前向新增状态与不可变事件，不把旧invisible直接当deleted。只有新鲜、未复用断点的完整认证双遍目录确认，匹配仅BillNo/id额外核验；旧完整出现证据需同账号/报表/范围。原Price隔离/租约/30分钟/unknown保护不改。

隔离PG状态/升级10/10；typecheck、lint、完整目录/根测试/build与真实浏览器仍以任务后续收口为准，不能提前写PASS。产品代码进展见[当前任务](tasks/active/ainuoke-source-deleted-2026-11-20.md)。真实两单只读取证visible=false、draft、数量10000/8000、同账号13/13目录，无真实转换。

Windowsfetch代理失败进入NETWORK_DEGRADED，API精确main与本地对象已核实，可做独立本地阶段。远端代码交付待单独核实，不重复同失败通道push，不伪称PR已创建。旧历史状态[归档](tasks/completed/2026-11-20-before-source-deleted/CURRENT_STATE.md)。

检查点二：106/106目录/Price回归、旧alerts1/1、Source20/1skip、前后端build、实际Chromium1/1四桌面/两角色/刷新/颜色尺寸列宽通过。演示只用合成SDK+PG，未写真实状态。演示夹具的2单绑定/row_scope/可见DOM/清理问题均修正，原安全边界不放宽。新UI测试与夹具收口本checkpoint；Root首轮冻结未对齐和Linux依赖挂载失败均保留，重跑仍待结果。宁波通道恢复连通但尚未push，勿提前宣称PR送达。

检查点三：真实隔离PG新增非空报价成本12.5、删除订单生产累计10.125，全部非目录/同步控制业务表逐行hash保全，单独场景PASS，全套新场景复验中。显式Server/snapshot/session DEV/fbd9ec31构建再做浏览器PASS；demo拒绝错误build并2h清理。Root1025/1026的唯一Q5故障是Win esbuild平台误用，同版Linux0.25.12进程级路径后定向3/3，整套最终仍待，不放宽业务保护。

代码2fb03344全root1026/1026，含非空历史10/10，typecheck/lint通过；正确同版Linux esbuild运行，没有改锁文件。CI新增两行永久执行test:source-deleted/test:source-deleted-ui，无部署/权限变更。基线独立复验因共享日志I/O改容器内部文件，仍等结果；勿误标PASS。
