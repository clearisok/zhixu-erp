# Server人工预计到仓批次

2026-10-24；D054/D065–069/D147当前后台受控前移候选，精确源码和本轮实际验收见[阶段任务](../tasks/active/server-material-arrivals-current-2026-10-24.md)；原cbfd结果不作新验收。
继承D054、D065–069；不改变Browser模型、身份、存储或原唯一物流算法。
目前Source交期没有已证明的到Hub地点语义，因此仅作只读对照；本切片没有自动Source批次或恢复来源写入。
页面和逐批物流接线是后续独立阶段，后台通过不代表可邀请用户体验完整物流。

## 一个owner，三种事实

`server/material-arrivals`拥有人工ExpectedArrivalBatch/Allocation，0039为空表前向扩展，不seed/backfill。
来源仍由既有ainuoke-source拥有；仅从已接纳本机快照读取，经同一完整分页/精确合同/归属/时效校验与Material pipeline。
Source供应交期、人工预计到已明确SupplyHub的日期、Inbound等实际事件分别保存。没有事件绑定、猜配、换算、
自动补齐、Actual覆盖、排单/执行/价格/出货/关账修改，也不从Browser补数据。

一个Canonical组可有多批；每批多个Allocation，一项需求可跨批。输入数量是正十进制文本，累计按精确数值
比较，不浮点求和、不跨单位总计，部分未安排合法。没有有效需求/已知单位就不能新增分配。人工确认厂供同样排除。
所有新批次明确为manual；清空是独立的空版本，不生成Source计划，不删除历史。

## 稳定需求与变化处理

旧MaterialDemand行hash包含数量。本owner不改该hash，而是为SO内完整规范化业务变体生成稳定UUID，
注册完整身份和SHA256，hash不是唯一身份证据。变体包括合同/类型/编码/名称/物料颜色/规格/门幅/克重/成衣颜色集合；
数量、日期、计量单位、提供方式和事件不进入长期身份。当前多条需求落入同一变体时标歧义，不合并或猜选。
Canonical只按既有合同/类型/名称分组，另核完整分组身份证据，短hash碰撞不成为合并依据。

GET/preview不注册需求、不生成batch。首次实际保存才登记所用UUID。每次计划变更版本保存当代原demandId、
长期UUID、完整身份、精确容量、单位和Source run/content/link证据；注册身份不可修改/删除。
数量变化唯一匹配时UUID不变；手工分配不变，增量仍未安排，减少到超配时提示而不截断。
规格/颜色等身份变化、消失、厂供、未知单位或多候选均保留旧计划，停止其当前物流适用性，等待显式核对。
同ID单位变化不能复用旧数字重新保存；先显式移除该需求旧分配，再按新单位明确填写，不自动换算。

## Hub与历史

只读取已持久化OrderExecutionTracking.supplyHubId，不猜默认仓。非空计划必须已有Hub。
每版冻结当时tracking ID/version及Hub的ID/名称/启用状态/版本快照，不读取排单备注或仓库备注；
订单改仓/清空后，旧日期不自动变成新仓日期，读取提示hub_changed。
用户须明确预览并采用新Hub的计划。新备注/主数据更名不重写旧版本或回执。
原物理SO、plan UUID、创建历史、完整逐次版本和发生时证据保留；不向有效归属自动搬计划。

## 命令与权限

读：order.view + ainuoke.view + style_progress.read；写另需style_progress.edit，不追加权限或金额授权。
服务端fresh身份/角色验证；不接受客户端actor、单位/容量、来源run、Hub或价格。
合同可信身份/有效SO、未完成/取消是新写前置；历史和已完成订单仍可读。加工单没有伪物料来源。

Preview绑定actor、完整意图、来源generation/内容、当前需求容量、订单/有效归属、tracking和plan版本。
提交同事务重新读取。锁序为有效归属fence→fresh actor/角色→actor-request→Source profile共享锁→物理SO组，
与采集的profile→SO顺序一致。不会在写事务里另开Pool reader或提前COMMIT。
实际持久化、不可变版本、OperationLog和回执同事务；已知404/409/422回滚应用后保存rejected，提交前可确认的SQL/审计错误整体回滚；连接或COMMIT结果未知时保留原请求并核对回执，不能据异常声称已经回滚。
同号异内容409；重复相同命令返回发生时结果，不因当前Source/Hub/生命周期变化重造。
回执按原用户/权限查询known/pending/unknown，未知不证明失败，不自动重发。
Source不可用只允许明确清空已有计划，空版本引用历史证据，不用旧来源新增Allocation。

新DTO/历史/审计只含白名单非金额事实，不展开带采购价格的MaterialProgressView。
审计使用既有OperationLog，批次日期、颜色/规格、数量和单位转业务摘要；完整结构在本owner的不可变历史。
归一盘点登记所有直接SO引用和完整关联命令指纹，半套schema拒绝；不打开归一UI/执行。

## API与容量

前缀`/api/v1/material-arrivals`，仅session，同源/CSRF保护、1MiB正文/响应上限；没有Browser回退。

| 方法/路径 | 行为 |
| --- | --- |
| GET /orders/:orderId | 来源候选、保存计划、当时Hub与当前tracking、精确异常；不写数据 |
| POST /preview | 完整replace_arrival_plan意图，当前前后差异及指纹 |
| POST /commands | 同一意图/requestId/previewHash，整个Canonical计划一笔事务 |
| GET /commands/:requestId | 原回执，无Source读取前置 |
| GET /orders/:orderId/materials/:canonicalKey/history | offset/asOfVersion，25条完整事件，锚点固定 |

每组最多100批/200个Allocation；不截断，不自动拆事务。需求数量文本最多128字符。
完整保存数据经JSON与PG实际字节双重限制，单版32KiB以内；规范命令在事务前限60000字节，回执库保留64KiB命令容量，
即使大意图在领域校验被拒绝也可保存原请求及核对结果；超限明确拒绝，历史响应不截字段。
需求身份同时保留紧凑JSON8000字节及PG实际jsonb::text8192字节预算；整体data预算另为24576。
写入前在同一事务统一预检各身份，超界沿原422 rejected回执，不扩大SQL限制。
旧schema只禁新能力，原物料和排单/跟进仍按原实现工作；启动仍verify-only，不自动升级现有数据库。

所有验收使用随机一次性合成PG和loopback，保护3001/50426/59069/62426、既有卷、账号、Browser和Source额度。
没有部署、绑定、激活、调度、真实来源读取或关账授权。

当前仅前移bb0ee176→cbfd的20个代码/SQL路径，输入blob与当前候选完全一致，README/package及单条既有CI调用按当前基线手工对齐。旧0034–0038、前端路由/导航/像素和权限目录不改；后台通过不代表页面、物流建议或人工接受。
