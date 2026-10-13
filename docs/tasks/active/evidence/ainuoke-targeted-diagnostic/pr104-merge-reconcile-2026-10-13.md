# PR #104 合并后，PR #105 基线与受控新增合同决定

核实日期：2026-10-13。GitHub main：`09f4447ab43e87798e1a5647f5ed02346ceef7ef`。PR #104 head `b43b78bee72a496219bd4872245ad28109f421c4` 在三个自动 CI 均成功、用户明确授权后，以 merge commit `09f4447ab43e87798e1a5647f5ed02346ceef7ef` 合并。#105 已改以 main 为 base，仍为 Draft；本文件在 #105 后续基线复审前记录，不能冒充 #105 的 CI 结论。PR #106 仍 Draft，依赖 #105，不自动合并。

用户同时明确决定：首轮上线前支持**受控接纳新增艾诺科合同**。当前实现仅对已绑定订单持续刷新四流；没有新增合同自动建单，也不自动更新已有订单主信息/颜色。此决定是未来独立工程 Gate 的验收范围，不代表已实现，也不授权对真实 DB 首绑、增量写入或部署。候选机制应以完整 Discovery、稳定 BillNo/source identity、权限/空白及消失保护、可审查 preview、明确确认和幂等写入为前提；具体实现和测试待下一 PR 设计。

2026-10-13 宁波只读预检：`weaveops` 仅见旧 `zhixu-prod` 与 `zhixu-staging` Compose；staging 镜像标签 `zhixu-server:staging-7cd43b614280`、本机端口 3002、独立 DB 卷 `zhixu-staging_postgres_data`。本机与公网 staging `/api/v1/health` 均返回 200/database ready，宁波到已批准艾诺科 HTTP origin 的无凭据 HEAD 返回 200。此结果不证明候选已部署、来源凭据可用、迁移账本、域名 Origin 映射或持续采集。以默认 `postgres` 角色只读列库失败（角色不存在），没有查询业务表或更改 DB。

本证据随 PR、main SHA、用户决定、运行镜像、DB/Source 启用状态改变时更新；旧记录按日期保留。真实合同号、物料、凭据和本机私有报告不进入 Git。
