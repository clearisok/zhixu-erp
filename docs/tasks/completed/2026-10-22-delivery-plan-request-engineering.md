# DeliveryPlan请求身份与原结果核对：后台工程证据

## 精确范围

2026-10-22，`feat/server-delivery-plan-receipts`；原干净输入
`d59a05e0e7fe5540322485c39a6756a9ba81ab6f`，本次应用与测试源码
**`12cfaf18867fea94f6733389851191afc29f31a4`**。main经独立只读再次核实为
`996dfedc12da3527343cd3ff2aa5eea35497e10e`。root唯一writer，既有
server_convergence_review只读复审，无继承dirty。完整Server收敛Goal仍active。

此证据只覆盖已批准D-147中的交付计划可靠命令切片。D-100的永久人工计划所有权、
Source日期/数量独立、默认行ID/null/系统0、人工正数及原SO归属不变。没有新UI、
价格/CCT、生产、收集器、关账或来源激活。

## 实际实现

- 原PATCH及`{deliveryPlanSet}`成功响应保留；可选显式UUID与旧body确定性身份进入
  同一actor-scoped不可变ledger，规范命令在首await前完整复制，含原SO/expectedVersion/
  所有数组。显式和legacy key分namespace，不以随机server ID处理旧请求。
- 同请求返回原完整结果（含生成的计划ID和当时Source对照），不重复计划或审计；
  不同请求仍竞争集合CAS。改用相同请求ID提交另一SO或内容明确409。
- POST原命令receipt只读，fresh view/edit、Origin/header及无query selector保护。
  状态unknown可以与原COMMIT竞争，不证明失败、不自动重发；历史结果不重新执行
  当前CAS/Source/alias资格。未记录请求不以unknown证明订单存在。
- 原有效归属共享fence→fresh user/roles/grants→actor/request→prior→原SO/集合锁。
  历史alias只能回读既有结果，不能接新交期；不追随sourceOwner把计划搬到其他SO。
- 计划、可信原审计、成功回执同事务。只有本writer固定CAS/row/alias409与容量422
  保存终态拒绝。真实SQL/审计/连接/lock_timeout失败全部回滚，不改写为业务拒绝。
- 完整结果包括所有作废历史，100只是单次影响行限制。紧凑JSON和实际PG jsonb text
  各限16MiB，固定HTTP外层另不足1KiB；超限SAVEPOINT撤销业务/审计后保留小422。
  命令64KiB。不是截取前100行或通过放宽限制获得PASS。
- 0042只增加初始空技术表、原SO/audit FK、唯一约束与UPDATE/DELETE禁止。新SO外键
  进入现有完整引用指纹。旧schema无不带回执的写旁路，旧迁移文件均未改。

代码：`server/sales-orders/delivery-plan-{model,request,service}.ts`、`server/app.ts`、
`normalization-preview.ts`、`database/migrations/0042_delivery_plan_request_receipts.sql`。
原API/domain/source writer和repository继续复用，没有另造业务交期模型。

## 实际验收

所有数据库/HTTP故障注入只用本阶段自建的一次性PG16（随机名称/tmpfs/loopback）及
合成账号/订单，清理仅由既有fixture处理自身容器。未操作旧PG、业务账号或Browser。

| 检查 | 已确认结果与范围 |
| --- | --- |
| `test:delivery-plans` | 42/42；新旧协议、原C4.3、unit，含三种原root锁顺序 |
| 最后receipt专组 | 19/19；包含最后POST权限/query保护与旧image/新schema反向校验 |
| `test:bound-order-refresh` | 18/18；人工计划与原Source owner保护，0040前缀继续前向升级 |
| `test:order-effective-attribution` | 45/45；现有身份、历史Source、SQL fences及消费者 |
| `test:order-normalization` | 40/40；只读引用盘点与API保护 |
| `test:order-normalization-execution` | 33/33；完整字节指纹、执行恢复与预算，未真实执行归一 |
| `test:postgres` | 270/270，282579.4606ms；既有完整基础/报价/权限/附件/API回归 |
| TypeScript/ESLint/构建 | typecheck、全lint、Server build、前端build通过 |
| 全项目重跑 | 927/927，197456.008ms；首次899/910通过、11个文档漂移失败保留 |

关键故障验收使用真实数据库事务：COMMIT实际成功后让客户端抛错，再从原请求取回
唯一结果；角色/用户锁等待后撤权；原SO真实5秒lock_timeout且无拒绝回执；成功回执
含252行计划/历史；10000行作废历史分别触发“compact仍小于上限、PG实际字节超限”
及“compact本身超限”，两者都保留完整旧计划并回滚新审计。

已验证0041→0042前后所有旧public表逐行JSON字节不变、旧ledger原行不变、新表0行；
启动verify-only在待迁移时失败，缺表writer/lookup失败而不写旧路径；升级后旧迁移
目录也明确失败，不能承诺直接切回旧image。原0008→0009空集合/原字节证据仍在，
随后显式前向到当前schema才测新writer。

首次新测试的合成role.name撞唯一约束已改为独立合成名；HTTP缺单测试误用已消费
requestId，正确先409身份冲突，改用新ID才验证404，未为测试改弱规则。首轮全项目
910项899通过/11失败，均为D154新文档未前向绑定的同一冻结漂移；原日志保留，追加
`decisions-delivery-plan-receipts-20261022`后再重跑，不改旧261条证据或测试断言。

## 复审、交付与运行边界

只读review已核对固定d59→12cf完整范围，未发现P1/P2；已查阅receipt19/PG270/
归一40/33日志，未冒称reviewer亲自运行。原261证据/55能力/历史截图和部署事实保留；
本报告及D154以新冻结记录前向绑定，最终发布/远端/CI结果另在当前任务和接力中记录。

本文件不是GitHub送达、合并、部署或人工接受证明。没有新UI旅程/像素验收。旧入口
50426/59069/62326/62426、旧库/对象/secret卷、原账号、3001及18443/18444未改。
f469候选镜像不含本次0042，不能给它贴12cf身份或称新体验已运行。

无真实艾诺科请求、凭据或私密候选读取、来源绑定/调度、真实业务库迁移/写入、PR
合并/关闭、旧路径退役。Num/outdate沿D152；原真实额度与关账待答不默认。新用户
可用的交期编辑UI、多交期风险、正式出货/关账仍须各自Gate；不能以本切片代替全闭环。
