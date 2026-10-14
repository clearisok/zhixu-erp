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

## 案件schema checkpoint

0017_order_normalization_cases.sql新增案件与append-only事件，未修改既有迁移。规范化UUID对唯一，同一对订单共用案件；原SO外键RESTRICT。事件版本由案件行锁串行验证，opened/review_note/withdrawn/reopened保留完整顺序，撤回不是删除，也不代表订单取消。禁止executed/merged状态，当前schema完全不改变有效订单归属。事件actor/request唯一为后续幂等服务预留；仅schema不声明已实现命令幂等、审计事务或UI。

固定引用清单新增案件的两端SO引用。实际执行仍须完整引用核验和单独授权；案件快照由后续服务端采集，不接受客户端声称执行/关账覆盖完整。

仅一次性合成PG升级验证，归一测试合计22/22通过，含schema6项、预览/HTTP8项、纯评估8项；定向lint检查随阶段运行。未执行真实迁移/账号变更；全项目PG和发布基线将在独立Gate收口时运行。下一步案件创建/追加/查询服务及事务审计、请求幂等和并发回归。

## 案件服务与事务审计 checkpoint（2026-10-14）

服务端已实现openNormalizationCase、appendNormalizationCaseEvent、readNormalizationCase和listNormalizationCases。POST /api/v1/order-normalization-cases开案，POST /:id/events追加复核/撤回/重开，GET列表及/:id查询，history每页20。查询参数严格限定、拒绝重复key和伪执行字段。POST仅可信session、既有Origin/请求头保护及8KiB边界。

开案必须提交已看过的有限引用摘要hash；服务端重采集并比较，差异409。案件存在时返回明确409，查询历史案件后继续复核，不重复开案。相同actor/request及相同payload重试返回原case/event/version；不同payload409。规范化pair唯一，两操作人开同pair最多一案。追加使用expectedVersion，withdrawn只能reopened，所有变更保留旧事件。客户端不能提交evidence或effectiveOrderId。

案件、首条/追加事件及OperationLog同事务提交；审计失败整体回滚。RR事务保证证据快照一致，局部锁保护授权和案件；40001/23505仅限最多三次事务重试，最终并发冲突409，不无限等待。重复成功请求仍重新核查active管理员与order.view，不因receipt绕过撤权。没有归一执行、订单重定向、Source重绑、数量迁移或财务改价。

实际验证：test:order-normalization合计36/36通过，包括案件服务14项、schema6项、预览/HTTP8项、纯评估8项；完整类型检查和定向lint通过。首次测试文件异步回调语法错误已修复，未发生DB业务执行。36是含顶层fixture在内的Node测试计数；不等同36个独立业务场景。UI/全源码/全PG/发布门禁/远端CI尚未本阶段验收。

下一步复用Foundation实现管理员案件对照/记录界面及合成浏览器验收，随后收口Gate4预览PR；有效归属执行和纠正能力按原批准计划独立交付，不能因预览工程通过扩大真实操作权限。

## 管理员案件界面与浏览器 checkpoint

既有Server订单中心增加“重复订单复核”，复用Foundation Modal；入口提示使用order.view/user_permissions.manage，实际API仍以受信role-server-admin和fresh order.view为准。搜索/分页选择两单，可查看引用计数/有限ID、带原因开案、记录/撤回/重开及历史。普通物控角色无入口。没有新route或归一执行按钮；unknown生产/财务覆盖明确说明，不把引用快照当执行事实。

保存结果不确定时保留原path/payload/requestId，锁定编辑和关闭，允许原请求重试；确定4xx释放，证据变化则清除旧预览提示重读。修改引用后旧摘要开案409，无部分案件。页面只使用Server API，没有Browser业务存储或fallback变更。

当前合成浏览器5/5通过（4业务子场景+1fixture）：原SO不变、开案/复核/撤回/重开、成功响应丢失重试单一事件、证据变化拒绝并重新预览、390px历史及非管理员隐藏。首次2子场景通过/2失败与后续3/1失败均记录：自动化未等tab渲染并把fieldset禁用误当button自身disabled，修复等待/:disabled选择器后通过，产品未放宽保护。

显式Server构建通过；1440px与390px本机截图已查看，无横向溢出。截图位于Git忽略outputs/normalization-ui，不替换已批准历史截图哈希，不代表人工业务验收。此次构建来自760cb02c父提交+已保护的本阶段UI差异；最终发布证据须重新绑定已提交源码。CI已接测试脚本，但远端未交付，未执行GitHub CI。

发布门禁首次FAIL：D124前向新增后当前DECISION_LOG与decisions-processing-g3旧冻结文本不同，命中EVIDENCE_WORKTREE_DRIFT；完整源码及基线测试中的相同漂移断言失败，不是业务测试故障。新增decisions-order-normalization-g4指向4bcd1bad的Git blob并supersedes旧ID，未覆盖任何旧hash/文档/截图。继续复验。

失败复验补充：完整PG首次238/243通过、5失败计数（包含父fixture），均为精确迁移列表缺0017。更新CCT/Quote/PG/身份四处显式列表后，相关完整子测试50/50通过，未改业务断言或发布SQL。前向决策证据修复后，完整源码824/824、基线78/78通过。完整PG及最终UI并发冲突负向场景继续复验；UI当前源码保留normalization_concurrency_conflict下未知原请求，避免误发新记录。

可用性复审补充：预览v2加入已持久化合同号/业务款号/工厂款号/客户/数量/交期/来源状态及来源ID/hash/读取时间，不含source_metadata、原始报文或商业价格。摘要覆盖这些新增合同事实，仍不是执行token；旧v1案件缺新字段时继续展示原引用证据，不填造新事实。新增合成回归证明合同身份精确、原始metadata不泄露、仅业务款号变化也改变摘要；定向37/37通过。最终完整PG261/261已通过（合同事实补充前；新只读字段另有37定向），源码824/基线78及全lint/类型/Server构建已通过。补充后的精确UI构建与浏览器继续收口。

最后候选e07c33c7：合同事实构建和浏览器5/5通过，含桌面字段对照/手机展开截图已查看。冻结结果及复审位于evidence/order-normalization/。案件/预览阶段LOCAL ENGINEERING PASS，整个Gate4执行/纠正尚未完成；REMOTE PENDING、无人工作业或真实部署。新能力按本结果冻结后登记。

最终能力/证据收口：f36307cf冻结报告已按Git blob哈希登记，第19能力仅案件复核阶段。工作树源码门禁PASS及新增能力后基线78/78通过。全部旧证据/截图/镜像metadata保持；最后精确HEAD以提交后门禁核实。远端PR与CI仍未交付，不自动执行网络恢复命令。
