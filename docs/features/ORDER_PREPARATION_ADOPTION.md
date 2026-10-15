# 翻单准备的合同后采用

核实2026-10-15；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；本地feat/order-effective-attribution，依赖未合并G1–G3。GitHub是实时事实源，本文为阶段快照。随API/schema/权限/测试、main/PR或授权变化更新。

## 当前行为与安全边界

后台0023与既有Foundation页面接线均已本地完成：合同前可建立含可选精确Quote/Revision/PriceVersion的准备；可信合同SO认领后由owner/admin显式采用准备补充血统。准备不是SO/加工下单批次，不创建订单、不修改合同数量或执行流水、不采用价格。拟报价可以未确认，真正商业采用仍独立走Gate2。

原准备、采用receipt和拟报价sidecar不可变；手工改血统仅清当前准备pointer，历史不删。有效归属、防环、fresh权限/CAS/原请求幂等、SQLfence、暂停和原子审计均复用。processing标签须有真实消费及精确创建依据才视为加工；未知历史类型不回填。

页面已支持拟报价选择、原参考搜索、当前/历史采用、本人回执和未知请求核对。独立tab-scoped sessionStorage只存未核实Server命令，不保存价格/凭据，不读写Browser账本/Seed/IndexedDB；刷新不自动POST，损坏/未来版本保留。整标签页丢失不保证恢复，见DATA_LIFECYCLE。

后端ff89的22项、页面源码b63d6424/报告f96ce65c阶段的23后台/10客户端/10新浏览器和旧UI27等分别按冻结范围阅读；本轮71关键保护/类型通过，不冒称全部组重跑。页面/精确六宽度/七角色证据见[UI任务](../tasks/active/order-preparation-adoption-ui.md)；源代码preparation-adoption/client/outbox及既有ServerOrderPreparationCard。未真实读写、迁移或部署。

## 历次工程阶段记录

以下保留各阶段的日期、SHA、结果与限制；其中“待实现/下一步”只描述当时，不能覆盖顶部当前状态。原完整版本亦保留于[归档](../tasks/completed/2026-10-15-order-preparation-adoption-pre-final-overview.md)。

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。本地feat/order-effective-attribution，从3708d57c/clean继续；未远端交付/合并/部署。落实已批准D121，工程选择见D129，阶段证据见[任务](../tasks/active/order-preparation-adoption.md)。GitHub是实时事实源，随API/schema/权限/测试/Gate/main或授权变化更新。

## 已实现后台职责

准备是合同前意向，不是正式SO或加工批次。原quantity/deliveryDate/specificationChanges均保留，不因合同数量不同而冲突。可选拟报价上下文保存精确Quote/Revision/PriceVersion及观察版本，无CCT价格或确认值；经销类型、未删除、精确归属必须在创建事务核实，未确认报价可以保存意向。没有拟报价时保持缺省，不猜默认版本。后续报价修改、删除或版本移除只产生候选状态提示，不删准备历史、不改任何订单价格。

0014准备记录append-only继续；forward0023增加不可变拟报价sidecar和采用receipt、profile nullable preparation_id。旧准备/profile不回填；旧五字段请求hash/重试语义保持。每张合同仍由可信Source创建唯一SO；本命令从不调用SO创建/编号、订单数量/交期、Source绑定、采购或交付写入。准备作为参考关系可由多个不同合同SO显式采用，不以Quote或准备ID作为客户真实下单的全局唯一身份；当前同SO重复采用同准备阻断。真正价格采用仍走Gate2精确确认和不可变商业版本。

采用要求fresh order.view/order.lineage.edit/order.preparation.create，target是可信有效合同SO且已经认领；owner执行，管理员order.transfer可带原因代执行。加工批次SO或待分类记录不能用合同准备通道。全局血统锁、目标行锁/CAS及actor/request幂等，复用有效归属/原血统防环；原引用身份保留，不能自行或通过有效alias形成循环。采用只补reorder血统/原单/变化说明与当前准备引用，审计同事务。手工血统修改清除当前准备引用，旧receipt始终保留；负责人转交不清除。历史完成SO补参考关系不会修改冻结价格。

## API

- POST /api/v1/order-preparations：原五字段兼容，增加可选proposedCommercialSource（null或精确三ID）。有拟报价需quote.view；旧回执可以在来源后来改变/删除后恢复，不冒称意向已确认。
- GET /api/v1/sales-orders/:id/preparation-candidates：search<=200/referenceOrderId/offset<=100000，20一页，返回原订单号/需求数量/交期/变化/创建者/已被几张SO参考以及允许字段的拟报价状态。不是自动匹配或推荐批准。quote.view撤销时隐藏上下文ID，查询也不能以隐藏Quote ID进行存在性探测。
- GET /api/v1/sales-orders/:id/preparation-adoptions：当前独立身份/准备引用及不可变采用历史，20一页。
- POST 同路径：requestId/preparationId/expectedVersion/reason，仅精确字段；不接受actor、商业金额、合同数量或creationSource。
- GET /api/v1/order-preparation-adoption-receipts/:requestId：仅本人请求回执。回执含appliedIdentityVersion/currentStateIncluded=false，不冒称历史回执是当前血统；需另读当前状态。

新API只session authority，GET no-store/严格query；写入Origin/X-Zhixu-Request/8KiB上限。fresh权限与schema检查；HTTP新采用遵守进程/DB暂停，旧回执GET继续可读；内部精确重试只恢复已提交receipt。SQL采用/当前pointer、不可变记录、alias owner与pause均有约束；audit失败回滚。DB owner/关闭trigger不属于此普通DML保护承诺。

## 归一和历史安全

新采用表的目标/原参考SO进入完整引用白名单。拟报价sidecar按准备原参考和采用目标纳入有界逐行hash，原准备/拟报价INSERT持归属fence到COMMIT，不在归一核对期间插入看不见的关联。新schema/声明引用形状改变会让旧proof需重新取证/发布/复核；不改旧proof/hash、签名或任一原流水。未知历史类型没有回填。

查漏实证发现identity facade原先仅凭processing标签认定加工，而列表已检查合法批次；无消费历史标签曾通过商业preview。现facade与列表一致：consumed批次、creation_source=quote和精确来源三ID吻合才为processing；否则unclassified并拒绝新商业采用。原标签、历史价格和创建来源保留，合法加工SO及其历史采用不受重新定价。

## 工程状态和边界

后端ff89f884冻结证据：22定向回归（误通过红测先复现）、完整PG261、归属45、相关64、根824、原UI14、类型/lint/编译/构建与基线78通过，源码门禁25能力PASS。详见[后端结果](../tasks/active/evidence/order-preparation-adoption/backend-results.md)。现有认领/加工UI会回归，但新准备选择/拟报价保存/采用入口尚待下一阶段接现有Foundation；不能把后台API等同于完整用户流程。Source CI已加入此前缺少的G4保护与本模块测试，远端CI未运行。

无真实账号、业务DB、Source/范围窗口、宁波或18443/18444操作。0023仅一次性PG演练，不承诺直接换旧镜像可回退；真实迁移/案件/部署仍需具体授权。整个Goal未完成。

## 现有页面后续阶段（2026-10-15）

本地从2e037dc3接入可选拟报价选择、原单准备v2页、可信合同认领后显式采用、当前关联/不可变历史和本人创建回执。缺拟报价与撤权受限分别显示；查询拟报价名称受quote.view保护。独立sessionStorage只保存未核实命令，原key/Browser数据不改，刷新不自动写入；具体边界见DATA_LIFECYCLE D130。候选及精确验收分开记录于[页面任务](../tasks/active/order-preparation-adoption-ui.md)，原ff89后台证据不修改。
