# 当前状态：物料页紧凑改版本机验收中

2026-11-11。代码基线main/staging为6dc17c645215b3eb08e03624effdee2d182b3e1d，PR144已合并并部署。新任务仅批准本机第一阶段，分支feat/material-followup-dense，不push、不触发远端CI或部署，不改源协议/认证/调度/业务计算/schema。

6230-938／PI2610-181已在隔离本机副本通过现有历史接纳服务载入11月11日14:44真实资料（10自购/3厂供、4采购/2入库/2出运/2出库），保留原本机UUID，无新建订单、0源请求。原617本机库不写业务，staging只读，宁波采集照常。本机候选63054 loopback，原只读预览身份自动进入，不改权限；原63051保留。

统一紧凑分组表、六视图、原明细/核实/对账/到料入口、密度和列显示已接入。1920首屏同数据自购可见5→10条，1600为9条，1366为7条；表体13px，不同单位和历史状态仍如实保留。真实只读交互检查通过，旧分批到料隔离UI测试中的页面重读假设、旧错误文案和旧摘要入口需适配现有队列及历史保留语义，继续验收中，不能将失败描述成通过。

[基线及任务](tasks/active/material-dense-local-2026-11-11.md)、[具体设计授权](tasks/active/material-dense-approval-2026-11-11.md)、[模块](features/MATERIAL_FOLLOWUP_DENSE_VIEW.md)、[接力](AI_HANDOFF.md)。[任务前staging交付事实](tasks/completed/2026-11-11-before-dense-view/CURRENT_STATE.md)原日期/版本/数量/限制保留。当前尚未人工接受新布局，不能部署staging。
