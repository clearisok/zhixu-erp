# 当前状态：6087051合同物料行本地接线

2026-11-06；分支 `feat/ainuoke-it-material-details`，继承干净提交970801b1ea2828d4f260c694ef2e43fcc8f8789b。核实过的main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea；本轮未刷新远端，NETWORK_DEGRADED不反复上传。

按D182新增可选6087051 Server读取，排除顶部业务合计，按需求/流水ID去重，并从独立采购/入库表精确匹配单位；未知保持待核对。复用原来源存储、订单物料管线和合同资料/正式订单页面，没有新价格系统或schema迁移。私密配置不选择新模式时仍读6087050，旧数据和Browser导入不变。

本地88项领域回归、23项Server协议检查、2项SDK至一次性库/HTTP集成通过；Python固定目录10项与新采集4项通过，首次全量191项的1处旧目录预期失败已修正。类型、受影响lint、Server编译、构建和浏览器已运行；最终源码、视觉复验及发布基线结果以[任务记录](tasks/active/ainuoke-it-material-2026-11-06.md)收口为准，不借用旧CI。

本轮0真实登录/0报表，无部署、无真实数据库操作。既有608历史及240/243第二轮和剩余3张保持；staging最后已知5af85cd6、3正式单、持续来源暂停，本轮未重新核对运行状态。登录诊断此前单次成功但历史拒绝根因仍未明，不再次探测。

[模块](features/AINUOKE_IT_MATERIAL_SOURCE.md)；[接力](AI_HANDOFF.md)；[上阶段原记录](tasks/completed/2026-11-06-before-it-material/CURRENT_STATE.md)。下一步是候选交付及固定真实样本核验，不能将本地通过当作6087051已上线。
