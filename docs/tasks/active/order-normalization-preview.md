# Gate 4 历史订单归一：只读证据阶段

核实2026-10-14。最近核实main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；GitHub本轮未刷新。分支 `feat/order-normalization-preview`，父提交 `39c9f7b607eabed5d72845d3a30b7fc766a6ee9d`，起始工作树干净。父提交包括本地未合并G1/G2/G3，不是main已交付能力。网络规则保持不变。

## 已确认代码事实

|引用|证据|归一预览含义|
|---|---|---|
|原订单引用|0002 sales_orders.source_order_id|不可变创建历史，不能改成新主单伪造历史|
|合同来源绑定及镜像|0002 sales_order_source_links、ainuoke_sales_order_contract_mirrors、color_mirrors|来源身份与原绑定保留；不能把多个可信合同自动当重复|
|交付计划|0009 sales_order_delivery_plan_sets / plans|客户交付需求；不等于生产执行。保留作废行及来源/人工所有权|
|物料采集快照|0012 ainuoke_material_source_snapshots|来源观察，不是织序生产流水；不能按快照条数判断执行量|
|旧共享CCT关系|0004 confirmed_commercial_terms_sales_orders|历史引用，不读取当前价冒称当年价格|
|认领/血统/准备|0014 profiles.reference_order_id、preparations.reference_order_id|保留原参考链，归一不能产生循环或覆盖创建历史|
|独立商业版本|0015 versions / heads|不可变订单价格历史，不能合并或重算|
|加工批次|0016 batches.reference_order_id / consumptions|独立客户下单身份；同报价不代表重复|
|生产/关账|features/production-scheduling/model/production-scheduling.ts、features/closing-center/model/closing.ts|存在Browser订单引用，未形成完整Server执行/关账覆盖。Server无行不能声称全系统无流水|

## 本次实现

`server/sales-orders/normalization-assessment.ts` 是内部纯评估函数，未接HTTP、数据库或UI。证据覆盖显式 verified / unavailable；未知count必须null，不能以0替代。缺执行/财务覆盖、未知引用阻止候选推荐。双边执行、冻结/已完成、加工批次、取消订单分别要求人工业务/财务处理。仅完整证据下可推荐保留单边执行单，或无执行时唯一可信合同单；所有结果 executionAuthorized=false，不构成执行授权。

纯函数不证明实际数据库覆盖完整，也不接受用户HTTP直接提交的覆盖声明。下一步由服务端只读采集器在同一事务快照读取引用与catalog，给出可追溯行身份、完整性和未知项；不能将外部/Browser未查状态改为已验证。之后完成管理员权限API、合成PG引用完整性/权限/一致性测试与案件预览。归一执行、有效归属解析及纠正仍为后续独立工程，尚未实现。

## 验证

8项纯评估回归通过，定向ESLint通过；覆盖缺证据、来源/计划不冒充执行、单/双边执行、冻结完成、合法加工重单、未知引用、非法数量及自配对。未操作真实DB；未运行迁移；未声明PG/API/浏览器验收或完整Gate4通过。发布门禁及完整交付待后续阶段，不创建PR。

更新时机：采集范围、引用schema、权限、案件执行、main或工程验收变化时。所有真实案件执行必须另行给出目标、引用、备份、限制及纠正方案并取得授权。

类型验证补充：首次 npm run typecheck 仅因新工作树 tsconfig.tsbuildinfo 写入权限EPERM失败；随后 tsc --noEmit --incremental false 完整类型检查退出0。未修改共享目录权限或依赖。核心checkpoint dd4c327f97ddb98880b813348081cf30564b86f1。

## 只读采集器 checkpoint

normalization-preview.ts 使用 REPEATABLE READ READ ONLY 事务，固定表/列查询；每类引用返回准确count、最多100个稳定ID及truncated标记，不返回商业金额或真实原始快照。catalog检查直接指向sales_orders的外键，新未知关系保守报告，即使尚无行也不假定安全。该catalog不是全系统间接/JSON/Browser引用穷举。

权限从当前数据库核查active用户、public ID、受信role-server-admin成员关系及order.view；不使用legacy role字符串或客户端缓存权限。尚未接HTTP，调用方必须提供既有可信session身份。

reviewHash仅覆盖身份、计数及前100引用ID等返回信息，明确hashScope；不证明被截断引用或行内容未变，绝不是执行预览令牌。正式执行阶段需完整引用/版本指纹、并发复核及独立批准，不能复用本摘要直接执行。

一次性合成PG 7项通过：legacy管理员伪授权、空引用仍未知、无业务写入、稳定摘要、新未知FK、来源订单引用变化、非法/缺失订单、fresh撤权。此前纯评估8项保留。未读取真实数据库、未迁移真实schema；HTTP/浏览器/完整Gate4仍待后续。

最终复验：合成PG与纯评估合计15/15通过，定向ESLint通过，tsc --noEmit --incremental false通过。首次严格类型发现inventory隐式any及ES目标不支持BigInt字面量，已显式声明类型并使用BigInt(100)，复验通过。

## 只读HTTP入口 checkpoint

POST /api/v1/order-normalization-preview 仅接受 {orderIds:[uuid,uuid]}，不接受execute、覆盖声明、query selectors或其他字段。要求可信session、既有Origin/X-Zhixu-Request保护、2KiB请求上限，返回no-store。服务端再次核查受信管理员和order.view，客户端不能声明证据完整或执行归一。没有mutation endpoint或真实归一操作。

合成PG/HTTP8项通过；新增HTTP场景验证未登录401、非法参数400、跨站403、不支持方法405、过大413及管理员撤权403。首次登录403来自测试客户端漏带既有X-Zhixu-Request头，修复测试后通过，未降低保护。定向lint通过。新增 npm run test:order-normalization 运行本Gate评估及PG/HTTP测试；完整发布检查、CI及UI案件预览尚待收口。
