# 当前main订单集货仓后台整合

root唯一writer，既有独立审查者只读。

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T03:50:09.022Z独立API核实，开放PR为0；branch codex/order-tracking-main-869e从该main创建，显式快进已审物流依赖588d29fe56fc9d1aaa79c3c631a97aac108ee777后，普通合流原订单集货仓4a20952607d4bccdcf37118ed16aad1067efbe03。全部非docs逐blob等于原已验收源码45f30070abeb1d70211eb10eab7841be10e8f894。

## 已确认职责

只保存物理SO明确选择的SupplyHub和备注，无记录保持null，不猜唯一仓/首项/路线。共享production命令、锁序、fresh授权、原actor/requestId及事务审计；跟踪版本独立，不推进SO、计划、执行或价格。新选仓须启用，已引用停用仓可查/清空/改备注；保留发生时完整仓快照和不可变历史。完成/取消、历史重复或来源不可信的订单禁止新写，历史按原物理身份仍可读。未知提交结果先核原请求，不宣称已回滚，不自动POST。

0038只新增空head/history和命令action，0034–0037保持原字节，不seed/backfill或导入Browser数据。读取order.view＋schedule.view，预览/提交再需schedule.edit，不新增角色grant、负责人或金额前置。旧计划与完成能力不依赖新schema；新能力缺schema503。原精确分页、历史锚点、容量保护和SQL触发器保持。客户端及物料运输弹窗仍是后续切片，不把后台可用冒称用户闭环。

## 历史和验证

原物流4f3是新旧两侧共同祖先；采用已审588d作为依赖后直接合流4a209。既有N/B/L和生产11c6 witness已覆盖所有继承同路径文档，不新建冗余决定记录。只引入两个原新路径文档证据，保持全部父对象、能力状态、runtime、原截图和UI影响记录。

原45f canonical archive SHA256 06fe016c029a6cecd1ce3e1c4a5e86ab82a5fd509bd22f567798e8b157b403ce、379相关API/升级、根811、类型/Node/import/lint实际成功记录已核对；精确proof f676b85dd644ffb6ab1877b414e6bb05223671fe保留。前端仍等于07d，只在未变范围复用其构建及原43浏览器，不冒称本切片新UI验收。原fd36ef发布134及4a209旧base守卫保留2026-10-24日期，本轮仅在最终commit新跑精确N源码守卫；正式PR仍须当前发布134和必要三CI。

准备时最终commit/新守卫/独立复审尚未完成。实际终态以outputs/order-tracking-main-869e-20261026同HEAD回执为准，缺失不算PASS。只读预核曾把实际17个非docs路径误写为16，已在任何tracked修改前按实际diff修正，原helper失败回执保留；不是产品测试失败。原[任务](server-order-tracking-current-2026-10-24.md)和[证明](../completed/2026-10-24-order-tracking-current-engineering.md)原日期/source/限制不改。

## 交付和后续

H0d70精确交付授权保留，Execute/Push/新PR/Hosted均0；普通PowerShell同样TLS失败，根因未明，不重复未改变通道探测或修改共享代理/TLS/认证。未将H指定范围扩展到本分支，没有自动合并或关闭PR。

本阶段无客户端/布局改动，不应用0038到现有环境，不改真实账号/业务库、Browser、3001/50426/59069/62426、对象/卷/备份；没有新凭据/Source读取、绑定、激活、调度、部署、目标切换或退役。原588d物流、81f执行及38580隔离镜像候选和所有旧ref/结果保持。

完整G1–G8/R active；随后0039到仓、物流弹窗、0040/41出运观察及0042交期仍按依赖处理。关账三问、真实Source额度/激活、人验、目标切换与退役授权不擅定。
