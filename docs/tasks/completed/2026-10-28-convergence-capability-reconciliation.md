# Server收敛能力账本：合并事实与当前数据owner核对

2026-10-28；`feat/closing-support-interfaces`，clean阶段起点 `9baa7a5d011a1ca93a7ceec9c99174a6c7554a0c`。本片只核对并前向校准能力元数据，不修改应用、SQL、权限、UI、运行环境、账号或业务数据。原592条证据和旧状态可从该Git提交恢复，不重写原证据或日期。

## 一、远端和Git证据

本轮通过既有GitHub连接器各一次只读GET重新核实：main仍为 `6479a713e2b80228f008049519ebbd50d10601a8`；PR131 open/draft、未合并，head为 `4584deb786e0dd2fada0d998a16d166b00ccaadc`，base为同一main。mergeable只表示预览可合并，不是合并批准。API读取成功不证明Git上传通道恢复；没有fetch、push、PR写入或新CI。

旧manifest有52项 `merged=false`：逐项执行原实现SHA对上述main的 `git merge-base --is-ancestor`，50项退出0。排除仍标 `implemented=no` 的历史intake规划项，**49项可以校正“原实现历史已合入”维度**。其余只有 `server-closing-commands` 与 `order-usd-labor-adoption` 的实现来源未进入main，继续保持false。每项原实现完整SHA、旧scope/合并声明、实际命令/退出码，以及17条当前代码路径的Git blob对照均在[机器回执](2026-10-28-convergence-capability-reconciliation/receipt.json)。该回执同时保存旧manifest完整Git身份及两个财务能力的原记录。

这里的true严格表示**历史实现提交已包含在当前main**，不证明当前入口仍开放、实现未被替代、业务测试全绿、已经部署、真实Source激活或用户业务接受。未实现规划项不能因其文档提交成为main祖先就被标为已实现/已合并。合并维度的source绑定实际main；原implemented/isolatedTest/人工/Source/环境日期与证据分别保留。

### 退役能力不能因merged校正而复活

六项为历史身份/认领、准备采用或归一切片：`order-identity-contract-claim`、`order-normalization-case-review`、`normalization-review-workspace-backend`、`normalization-independent-review-ui`、`order-preparation-adoption-backend`、`order-preparation-adoption-ui`。其原代码历史合入，但不成为当前用户流程。

实码 `server/app.ts:691–702` 在旧handler前对identity/preparation-adoption mutation、order-preparations创建、normalization case/workspace mutation及旧commercial-versions写入进行可信身份/边界校验后返回410；order-claimants不论method均410。历史记录与既有允许的历史GET仍受原权限/路由约束，不能概括为所有GET保留。只读POST normalization-preview不在本片“已删除”的断言内。`server/sales-orders/color-commercial.ts` 同样拒绝新的reorder来源。D144/D145仍为现行来源规则，没有恢复负责人、认领、合同前翻单准备或独立翻单入口。

## 二、当前Server数据owner和交付范围

以下是针对原G2所需的入口/owner核对，代码blob见同一回执。它不是重跑全部历史测试或重新逐行审计整个仓库；对应运行工程继续使用各自精确source的原证明。

| 业务链 | 当前Server owner及入口 | 合并与验证边界 |
|---|---|---|
| 登录、角色、用户、日志 | PostgreSQL `app_users`/session/RBAC/OperationLog；`server/auth/team-access-routes.ts`、`managed-role-routes.ts`，正式角色/用户页面 | 两个route文件与main逐blob相同；原#123合并事实保留。真实账号未修改，不把合成账号验证当成团队上线 |
| 报价、版本、成本与附件 | `server/quotes/repository.ts`、可信Quote服务及S3附件；`production-quote-pages.tsx`按Server authority选择正式client | repository与main逐blob相同。金额独立授权与报价公式沿原实现；工价采用追加见下行，不把当前Quote改价写回旧订单 |
| 订单身份与报价关联 | 正式 `sales_orders`、独立商业版本、`server-sales-order-read-repository.ts`；可信合同或加工批次创建，来源维护采用Quote | 正式read repository与main逐blob相同；旧准备/认领写路径退役。订单默认归月属于PR131追加，不能把整个当前app.ts视为main同字节 |
| 合同、颜色、物料及货款 | 可信来源profile/target及不可变镜像/快照；`server/index.ts`注入persisted material/payment/garment reader，物料计划有独立Server owner | index与main逐blob相同；Source读取事实与人工到仓计划分离。新空目标无Source，旧样本不证明新目标激活；Num/rknum/num_dyc/OutStoreNum等原口径保持 |
| 交期与生产执行 | `delivery-plan-repository.ts`、`production-scheduling/repository.ts`；Server生产authority page | 三文件与main逐blob相同，默认Source计划、人工交期、排单和实际完成仍独立。原G6权限/CAS/回执/有产出归属规则不变 |
| 成衣出货观察 | 0040–0044快照、原collector/target/operator及订单只读UI；数量Num、业务日期outdate | 对应历史实现已在main；合成与既有固定样本证据不等于真实持续激活，更不等于收入、付款或关账 |
| 关账调整与实际采用USD工价 | `server/closing/routes.ts`及月份/财务服务；`closing-authority-page.tsx`，报价中心 `labor-adoption-routes.ts`/`quote-order-labor-dialog.tsx` | 这些新路径尚不在main，属于PR131。产品a198已有真实18项UI及9项完整恢复证据，未因此合并、部署或取得完整人工业务接受 |

### Server选择与浏览器存储的区别

- `features/quote-center/authority/quote-authority.ts` 对正式Server路由做白名单和order-read gate；当前文件有PR131的关账增量，不能把本地完整白名单冒称main原样。
- `production-scheduling-authority-page.tsx` 和新的 `closing-authority-page.tsx` 在挂载前选择Server或Browser组件；Server分支不因请求失败改挂Browser组件。订单read repository只委托正式client，没有在该实现中捕获失败后调用旧Browser仓储。
- AppShell在Server身份下不挂旧GlobalSearchPalette；Server报价列表的localStorage仅保存个人列布局，sessionStorage原请求用于显式恢复。这些不是第二份报价、生产或关账账本，不能仅见到storage字样就判为业务双写。
- 当前Server UI没有开放旧模板维护、数据管理、个人艾诺科账号等白名单外辅助入口；全局搜索也未接为Server业务搜索。它们不得被标为“Server已全部完成”，也不因收敛任务而擅自新增需求。3001及其Browser数据、Legacy `/api/quotes` 与新Node `/api/v1/quotes` 继续分开保护。

本片静态入口核对不扩大为所有导入代码的运行证明；原真实构建、权限/并发/错误/导航测试仍按已有冻结证据分别判断。

## 三、关账和工价能力的前向scope

两个能力保持未合并，只把当前实现与隔离验证的scope/source前向更新到实际已存在的D169–D177实现，避免“只有手工新增/没有UI”的旧阶段叙述充当现状。

- 关账owner：SO按成衣交期默认归月，部分/整单守恒调月、来源数量复核、执行方匹配/无产出恢复、明确财务同步和原确认/锁定/重开；全年同范围展示成衣销售CNY与加工USD。订单、排单、产出、Source和价格事实仍独立，已锁定快照不静默重算。不能再经新手工allocation写入数量，也不新增汇率。
- 工价owner：报价中心对单订单显式采用已确认USD版本，保存独立商业版本与work provenance；保持原售价/产品/批次和冻结快照。没有自由填工价、自动换汇、任意USD→USD调价或订单中心金额写入口。
- 产品源码为 `a198d1829675092006708727624ee867be0e7b60`；实际18项UI驱动冻结checkpoint为 `35bf9de650d34219b4e1838b768129ce9aa59d4c`，raw与Git LF规范化hash分开，见[最终业务证明](2026-10-28-closing-support-final-validation.md)。
- 完整恢复harness来源为 `24f44284e94a0dbfda40dfc23915f0be665ea139`，运行同产品镜像 `sha256:90e36de7c3d61ca137b2d5a4227e848b83ed57579bd146ce25501dbc6fe35f4f`，9/9与TAP离线校正边界见[持久化证明](2026-10-28-closing-support-persistent-runtime.md)。不是本片新运行的9项或18项，更不是当前Hosted全绿/用户人工接受。

旧D163/D164证据和两个cap原记录全部保留；其原assessedAt阶段的测试、人工、Source及18443/18444环境声明不改成今日运行观察。此处不引入第二套价格、日志或能力状态格式。

## 四、剩余Gate和安全边界

| Gate | 当前证据和未完条件 |
|---|---|
| G1运行收敛 | 新65139持久空候选的精确镜像/恢复/重启通过；50426尚未切换，3001和所有旧资产保留。候选就绪不等于正式入口完成 |
| G2整合与Server owner | 原#120/#123/#125/#129/#130合并事实及当前代码分开；本片校正历史merged元数据，PR131仍待本地修复交付/必要CI及明确合并批准 |
| G3路由 | 已合并导航修复及原真实构建/浏览器证据继续有效，不在本片重跑或把静态allowlist当浏览器验收 |
| G4/G5合同链/创建报价 | 主实现历史已进入main，正式上下文Quote草稿复用原writer和幂等；新空目标未绑定真实Source，不从旧演示推导激活 |
| G6/G7生产/成衣 | Server实现与原合成工程/有界样本分开；正式目标账号、真实Source范围、操作与业务接受仍独立 |
| G8关账/工价 | a198工程和镜像恢复已验证，PR131首次CI失败对应两测试本地47/47修正未送达；不重复触发旧CI或把本地通过算远端通过 |
| R旧运行资产退役 | 必须先接受替代目标、解除具体依赖并给出授权；没有删除/停止旧服务、卷、工作树、refs或Browser数据 |

完整Goal继续active。当前外部Git传输仍降级，API读成功不解除写通道停止；本片不重推、不改代理/认证/证书，不执行真实Source、部署、账号或业务库操作。

该证明先独立commit冻结；后继manifest只追加这个新document证据、校正上述49项merged及两个当前scope，不删除原592条证据，不改变其他能力状态维度。实际元数据差异和最终守卫结果在当前接力单独收口，不由本文件预报。
