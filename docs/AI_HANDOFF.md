# 当前接力：Gate3加工下单批次

2026-10-14；分支 feat/processing-order-batches，初始HEAD 2c6c2315d4b295dba2c6f73f651255f775790b99；工作树初始clean，基于本地Gate2，未称最新远端main。最近核实main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5。

当前完成严格命令模型、9项负向/正向测试和Server构建；尚未数据库/服务/HTTP/UI，Gate3未完成。具体设计、风险与下一验收见 [加工批次任务](tasks/active/processing-order-batches.md)。下一步0016和逐批消费事务，双入口必须共用服务；同报价允许多批，批次唯一消费，不依赖Quote全局防重。G1认领目前仅合同、列表投影依赖来源镜像，两处须明确接入可信加工业务。

Gate1最新def98f275c2ef61712008891ab1c60d308981bb7、Gate2最新2c6c2315d4b295dba2c6f73f651255f775790b99保留各自工作树；本地测试/复审见 [Gate2历史接力](tasks/completed/2026-10-14-gate2-final-handoff.md)。无远端交付/CI/新PR结论。

NETWORK_DEGRADED保持，本轮不自动执行恢复命令。用户询问删除网络规则但明确先不删，规则未改。node_modules junction指向既有共享依赖，不删除目标。只允许合成/随机tmpfs测试；不碰真实数据、账号、宁波/18443/18444，不部署或自动合并。持续Goal含G0–G5，不把本checkpoint当完整交付。


后续checkpoint：0016_processing_order_batches.sql已实现四表及状态/身份/不可变/唯一消费约束，随机tmpfsPG 7/7通过；消费指纹要求与确认一致。命令模型9项，test:processing-batches共16/16、Server构建和定向lint PASS。服务尚未实现，当前并发测试仅证明绑定约束，下一步建SO+商业采用+消费须同一事务。勿把预建合成SO测试当无孤立订单的服务验收。全PG迁移清单预期待同步；未推送、无PR，网络规则保持。


事务阶段完成：processing-batch-service提供登记/预览/确认/取消/逐批消费；fresh DB独立权限、每批事务、重试回执、重取报价指纹、SO+商业版本+消费+审计原子提交。复用Gate2抽取的appendCommercialVersion。加工24/24、Gate2商业29/29、Server构建/定向lint PASS。下一步候选/HTTP、processing可信认领及订单投影、两个UI入口。注意取消有两条日志待收敛、迁移/权限数量全回归待同步、UI影响声明待补；不要称Gate3或全Goal完成。真实数据/账号/部署均未碰。


HTTP阶段：批次GET/POST、consume与preview/confirm/cancel已接可信session、mutation boundary、no-store和严格参数；候选每次扫描20条、过滤来源失效，用nextOffset/hasMore续页。processing消费证据校验后允许身份认领，不造艾诺科关联。加工27/27、身份15/15、Server构建/定向lint PASS；身份首次14/15仅0016清单缺失，精确补齐后通过。CCT/PG/Quote API迁移清单也已更新但全回归未跑。下一步订单读取加工快照、客户端及两页面入口、UI影响记录/浏览器；取消双日志仍待收敛。没有推送/PR/真实写入。


2026-10-14读取投影checkpoint：正式订单repository从可信已消费加工批次读取客户、业务款号、数量、下单/交期，支持搜索和交期排序；合同号/InsideOrderNo仍null，没有来源颜色即空数组。Foundation来源读取保持独立SQL，不依赖0016。此处沿用既有API日期字段承载业务日期，UI必须按businessType显示“下单日期/交期”，不能将加工称为艾诺科合同。UI两入口及认领按钮仍待。

加工28/28、身份15/15、Server构建和定向lint通过。Source首次5通过/1失败，原因是旧迁移数量断言12；换成明确版本[1..12,14,15,16]后20通过/1个Linux-only跳过，无失败。不能把Windows跳过称Linux已验收。取消日志收敛为一次业务审计并保留原因，有精确数量测试。未远端交付、未部署、未真实写入。
