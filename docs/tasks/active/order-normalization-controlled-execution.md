# 历史订单归一：具体案件授权与工程执行边界

核实2026-10-15；最近核实main064e3afaf7d08b3cb62907d4402f97d9c292f1e5，本轮未刷新。代码位于feat/order-effective-attribution，未远端送达、合并、部署或真实迁移。本文不是生产执行授权。随schema、API、覆盖、许可、验收及main变化更新。

## 工程入口

现有案件保留原一对SO及不可改写历史。完整归属方案必须包括当前组所有原UUID；新有效根自指，不能链式重定向。POST /api/v1/order-normalization-cases/:id/attribution-preview传proposal，只采集；POST /:id/reviews记录独立生产/财务决定；POST /:id/execute默认503，私有精确许可才可能执行。GET /api/v1/order-attribution-receipts/:requestId用于未知提交结果只读核实，不以换requestId重试。

默认server/index不加载permit或生产/财务覆盖Adapter；没有生产环境变量可以顺手启用。HTTP不能提供verified、备份路径、权限、原始覆盖、enabled或actor。所有归一HTTP接口要求session；NoAuth模拟身份不是审批人。内部服务Caller仍必须提供可信身份，不能用于把Browser mock当Server业务。

## 真实案件前必须提交的具体范围

- 环境与数据库目标fingerprint、最近main/实际运行SHA、案件ID/当前version。
- 每个原SO编号/UUID/不可变创建来源、当前有效归属，以及拟变更后的完整逐SO对应表。
- 已声明Server引用的全部有界行指纹、unknown FK清单；未知引用或超限不得略过。
- 生产/采购/出运及财务冻结的权威数据域、原身份映射、当前完整记录和冻结读取lease；Source观察和客户交付计划不能直接冒充织序已执行生产。
- 原流水逐项保留及后续执行归属方案；双边执行/冻结状态由独立生产/财务负责人核对。
- 可核实备份的SHA、恢复演练SHA、恢复后的保留数据与应用/Source兼容性证据，及明确recoveryPlanHash。
- 有限单case/单目标/单proposal/evidence许可、最多1小时到期；谁批准实际写入，何时批准。

当前没有上述真实清单/Adapter/备份恢复验收/许可，不运行真实execute。服务只检查受信配置引用绑定，不能证明一串backupSha确实存在或已成功恢复。合成测试的模拟许可不得拿到真实环境。真实启用路径及受保护配置加载须另行交付、复审和具体授权，不直接编辑生产index或把测试fixture当操作脚本。

## 独立复核和交易边界

按实际引用要求生产复核；冻结/关账或completed记录另需财务复核。预设受信岗位+fresh order.view，不能伪造legacy角色。两类复核不同账号，执行者不能代签；撤权再授旧签名不恢复，需重新签。签名绑case/version、目标、完整证据和方案；最新reject有效。

外部冻结lease先于DB归属锁，联合Source写入方必须遵守同一锁序。执行独占归属锁，相关Case/准备/加工/计划/商业/Source命令持共享锁；现有声明引用行读锁防止内容并发改变。外部源须持lease至COMMIT并末端重验。实际写集只有归属ledger、members、heads、proof及append-only审计；不搬移/相加原SO、价格、生产、采购、出运、计划或关账数据。

审计/末端源复核失败全部rollback。提交响应丢失先查询原receipt；原request/原payload返回同change。非确定结果不制造第二操作。无执行时优先可信合同SO；仅一边执行保留执行SO；双边须明确复核的继续执行方案，仍保留双方历史，不把两边生产量相加。

## 纠正与回退

纠正是新的完整组方案、证据、复核与有限许可，不删除旧记录。归一后新流水/来源或权限变化要求重取证据和签名，不能无限撤销。原UUID、创建历史、绑定、冻结价格和旧执行引用始终可追溯。

应用回退先关闭新创建/商业采用/归一能力，保留已产生身份和版本。禁止把旧镜像直接覆盖当作已验证回退；旧代码可能不了解有效归属或价格快照。当前已实测冻结prefix12 Source及prefix9交付工具的本地兼容，但没有证明所有旧二进制在新schema上安全。数据库 alias写保护与新命令暂停已分别本地落实0020/0021；原main Server的实际启动校验拒绝新schema，兼容前向bundle的暂停查询已演练。具体边界见[暂停与回退](../../features/ORDER_COMMAND_CONTROL.md)；真实目标、完整恢复演练及旧Docker/Browser兼容仍不能用API测试替代。

## 当前验收和剩余

完整执行29项、Case/session34项、消费者30项、全PG261项等详见order-effective-attribution任务。包括真实第121行内容变化、失去角色再授、NoAuth禁止、审计末端失败、COMMIT丢失、双边/冻结、新流水纠正、完整三成员、血统环、lease持到COMMIT。全部一次性PG/合成资料，无真实业务操作。

历史Source查询、普通历史状态/案件历史选单、生产财务复核UI/禁用执行提示及完整Gate4交付仍未完成。原批准计划的准备记录采纳、历史待分类写入hold、Quote修订清确认和G5也需按真实代码查漏。不能把此阶段通过改写为整个Goal完成。


2026-10-15后续：原身份/history UI已有精确合成证据；独立复核后台发布/岗位待办/当前签名及历史分页已实现，相关指纹不再受无关订单增长影响。仍没有真实Adapter/permit加载、恢复或归一授权；岗位工作区UI继续，旧本文阶段时点不改写。恢复入口[独立复核模块](../../features/ORDER_NORMALIZATION_REVIEW.md)。
