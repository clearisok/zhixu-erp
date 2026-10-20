# Server 收敛 Gate 5：从订单上下文创建报价

## Baseline and authority

2026-10-20。唯一实现 owner 为 7bf3 主控，既有独立审查者只读。main 经 GitHub API 核实为 `996dfedc12da3527343cd3ff2aa5eea35497e10e`；开放 #120–127 仍为原 head、draft/open，没有合并或关闭。本阶段从该 main 创建 `codex/server-source-quote-create` 后显式 FF 到已验收依赖 `96e9d320ff6d0ad51254291cd3c35c2d32d6070f`，初始 index/worktree 干净；无继承用户 dirty。

Gate 4A/4B 的上述完整提交已通过既有工具一次 push 并独立核实 exact remote SHA。Source [39390380075](https://github.com/clearisok/zhixu-erp/actions/runs/39390380075)、Team [39390385593](https://github.com/clearisok/zhixu-erp/actions/runs/39390385593)、Baseline [39390391327](https://github.com/clearisok/zhixu-erp/actions/runs/39390391327) 全为 completed/success，head_sha 均精确 96e9d320；不重复推送或触发 CI。冻结工程证据见 `completed/2026-10-20-order-saved-sources-engineering.md`。Gate4C 写入未实现，不把只读闭环称为完整生产能力。原三份摘要逐字保留在 `completed/2026-10-20-gate5-inputs/readchain-96e9d320/`。

用户批准整体收敛 G5，持续工程交付授权见 git-delivery-resilience。新入口使用已批准的窄 V1：既有维护来源首次选择中的次级入口 → 既有新建页只读上下文 → 明确创建草稿 → 原 Editor。审查者已确认无新导航、交互模型或密度设计，不需要重复 UI 批准。普通报价列表 D-102 一键创建保持。

## Implementation boundaries

- 只允许未采用商业依据的可信合同订单进入此创建上下文。加工报价继续使用独立批次，不从已消费加工订单开放换绑。
- 服务端由 canonical SO UUID 读取当前可信合同身份、保存来源事实、生命周期和有效归属；URL、款号、InsideOrderNo、客户端指纹不是身份凭据。不做外部采集或默认资料名称匹配。
- 合同上下文明示并固定为经销报价，避免全局默认加工类型产生不能采用的草稿；其余制作默认和原 writer/编号/成本公式不改。只预填可信款号、精确数量和成衣交期，品牌/客户来源名称作为快照提示，不猜 master ID。
- 创建引用与商业采用分开：不可变引用、报价、审计和 committed receipt 同事务；不写 SO、CCT 或商业采用。报价可继续服务其他订单。
- 原默认创建 hash/source:null 兼容。上下文参与幂等，提交前重新验证上下文/权限/设置；迟到回复不得影响新身份。恢复 URL 保留请求和上下文，刷新/返回只查回执，不自动再次 POST。
- 新迁移只在一次性合成库演练；不改旧迁移，不回填，不更新 62426 或当前体验环境。不改 Browser repository/存储。

## Validation plan and current state

当前本地代码已接线，但未最终验收。最新17项 API/客户端通过13871ms，类型、Node编译与定向全路径lint通过；旧创建/新上下文的先前组合41项通过19704ms。首次新测试因误改已被0022保护的镜像身份、误判仅查看引用需要create权限、忽略故意注入的logger事件而失败；改为新无效初始关联、核实实际权限和准确计数，未停用触发器。独立复审发现首次来源409无终态回执、GET owner卸载竞态、0033 ledger遗漏及漂移测试时机问题，已修复并再验。第二阶段重新核对、源镜像共享锁持续至COMMIT、实际COMMIT丢回执及无SO/CCT写入有新断言。

实际构建/私有 Chromium、新UI脚本、最新全量与最终独立复审仍待；不得将脚本存在称为浏览器PASS。最终须覆盖入口、只读上下文、明确点击、刷新、返回、拒绝终态、未知结果、跨身份迟到、无权及历史只读，并执行相关API/数据库、项目、两种构建、116基线及精确源码守卫。

本阶段依赖仍未合并；仅交付验证引用，不创建重复累计业务 PR。用户明确批准依赖合并后，保留历史前向整合 main、重新核实增量再给唯一草稿 PR。无自动合并、关闭、正式部署、真实账号/业务库、新来源读取/绑定/调度、资产退役或共享 TLS 配置修改。
