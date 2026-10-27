# Gate8G1：订单创建归月及原子调月后端

2026-10-27；branch `feat/order-closing-month-plan`，clean起点/直接父`a98fa0cf8511e04b99d0aba943b799a0cecce8d0`。本轮GitHub只读再次核实main `869ee84dd0b31de6161011e4aa560678b244a64d`；无fetch，本地origin/main仍9d65。原Git/ref STOP根因未明，未作远端写入或再次试推。

用户明确修订：两项产值、创建时按交期默认归月、部分/整单调月、生产状态/全年汇总作为参考；随后确认加工包括内制与外发，筛选同步作用于明细和汇总。D169替代旧目标中的手工新增/三桶展示；公式、精确价格源、USD资格、期间冻结与历史保护保持。[独立契约](../../features/SERVER_CLOSING_MONTH_PLAN.md)。

本片只做0047四张空表、原SO创建事务内初始化、未定价数量分月及内部preview/execute/receipt。新合同和加工批次共用初始化；没有独立创建SO入口，也不要求已有报价金额或税率。缺交期、已冻结默认月、颜色不完整均保留待分配，不猜测。金额/年度投影、执行方对账、与0045财务冻结的消费关联、旧写入口收紧、HTTP/UI尚后续。

复审发现五项实现P2：初始化期间竞态、完整结果超PG容量、遗漏0047引用登记、加工CCT/生产/SO三方锁环，以及初始化收窄旧Source精度。分别用所有创建入口前置共享锁、完整结果422/回执、完整schema/所有版本与拒绝命令盘点、真实三方屏障、保留原numeric的quantity_state修复。独立静态复审已关闭实现P2；另拦住三个独立冻结根文档的直接修订，已精确撤回本片前言并恢复原blob，只用D169/新契约承载前向目标。旧业务与失败证据均保留。

分源本地检查：早期47/47；增加锁序与精度正控后一轮49/51，精度校验遗漏已修。完整关账首轮121/124（一个旧迁移断言、两项Windows Docker spawn UNKNOWN，含teardown）；只对两个受影响文件修后29/29。订单六文件首轮93/95（同一旧USD迁移断言及父项），严格清单统一复用手工登记fixture，两个适配文件34/34。两个加工入口真实PG三方屏障均通过。811项目检查通过，另两组发布测试只在最终门禁运行一次，不与前述重复累计。

工作区根typecheck因既存ignored冲突TS样本失败，未删样本/放宽tsconfig；首次owned副本类型发现三处测试未处理unverified分支，修后3104文件规范副本根类型与Server构建通过。仅最终两个测试清单适配后再核类型，不重复未变Server构建；相关15文件lint通过。一次PowerShell启动报OutOfMemory，Windows Docker启动/收尾失败原因疑似资源压力但未证明；独立Node/Docker只读对照通过后仅补验失败组，不无限重试。明确识别本任务临时PG后完成其清理，不动旧容器/卷。精确提交、最终质量与发布门禁另冻证据，不预报。

未改UI文件/页面能力状态/真实来源/账号及现有库；合成一次性PG通过原fixture创建清理。不借Gate8F原恢复/811/144结果充当本片验收。相关测试并入原`test:closing-backend`命令，复用既有CI job，不新增push/PR触发器或付费run。

旧状态及原草图逐字保留于[input-state](../completed/2026-10-27-closing-month-plan-input-state/README.md)。修订草图是交互原型，不是页面批准；见[新草图](server-closing-ui-proposal-2026-10-27.md)。目标Goal仍active，后续正式UI与远端交付分别收口。

源码S已冻结为0969d74c5d5f6dabbd2d095c42824f80be090ab7。最后规范副本类型通过，914类型输入与S文本核对、751非integration类型输入与原Server构建副本字节核对均一致；全部旧SQL与三个冻结根文档保持原blob。独立窄审0P1/P2；新清单530→532且旧记录/68能力/其他字段不变。[分源工程证明](../completed/2026-10-27-order-closing-month-plan-engineering.md)承接本阶段，最终元数据HEAD守卫与发布测试按本机final.json核对，不借旧结果。
