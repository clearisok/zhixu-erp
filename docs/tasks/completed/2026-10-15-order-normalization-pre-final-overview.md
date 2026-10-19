# 历史重复订单复核与归一

核实日期2026-10-15；最近核实main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5。本地feat/order-effective-attribution依赖未合并G1–G3/案件预览；当前已实现Server完整有界证据、独立复核及默认关闭的执行/纠正服务。历史Source/UI及真实覆盖/授权仍未完成。GitHub是实时事实源，本文随schema/API/验收/发布变化更新。

## 已批准规则

订单归一优先保护有真实执行流水的SO；两边有执行或冻结关账须独立核对。原UUID、订单号、创建来源、来源绑定和每项原流水保留。不能自动搬移/相加生产、采购、出运或关账。具体真实案件执行须另行授权；计划批准不扩大真实数据库或部署权限。规则D121，完整范围见订单身份实施计划。

## 当前实现

0017新增一对规范化SO的唯一案件及append-only事件。opened、review_note、withdrawn、reopened记录原因、服务端快照、actor/request、version。不能编辑/删除历史；withdrawn只允许explicit reopen，不取消订单。schema没有有效SO字段或executed状态。

POST /api/v1/order-normalization-preview只读有限引用，POST/GET /api/v1/order-normalization-cases开案/查询，GET /:id历史及POST /:id/events追加记录。所有接口可信session；实际DB授权为active受信系统管理员+order.view；写入持有授权锁，重试仍核查fresh grants。查询参数、命令字段和体积严格限制，无客户端evidence、effectiveOrderId或execute标记。

开案重采集并比对已看过摘要；变化409。actor/request/payload幂等；同pair只有一案；独立expectedVersion保护追加。案件/事件/审计同事务，失败全部回滚；最多三次局部DB并发重试，最终409。订单、Source及生产流水不在这些命令的写集。

现有订单中心管理员入口复用Foundation。可搜索分页选两单、查看有限引用、记录理由及历史。未知保存保留原请求，确定失败才释放。普通角色隐藏入口，API权限不依赖隐藏。

## 证据范围与限制

RR事务中枚举已知Server外键及固定表引用，返回准确计数和每类前100稳定ID、truncated，并独立保存有限的来源合同身份与基本业务事实；不读取原始metadata或商业金额。预览v2兼容展示历史v1记录，新字段缺失时不补造。Server的Source快照、交付计划和商业版本不证明生产执行。直接FK catalog不覆盖间接关系、JSON、Browser或其他环境；新增未知FK保守显示未归类。生产/财务覆盖目前unavailable/null，预览assessment为coverage_incomplete。

reviewHash覆盖返回的有限订单/合同事实及引用计数/ID，明确hashScope，不涵盖全部行内容和截断尾部，也不是执行令牌。案件快照是当时的观察；后续变动通过新事件记录，不改旧快照。未来执行必须有完整引用/版本指纹、有效归属所有消费者的统一解析、生产/财务审批及备份/纠正方案。

## 验收与下一步

合同事实补充后定向服务/schema/HTTP/纯评估37/37通过。此前最终源码824、全PG261、基线78、浏览器5、完整lint/类型/构建通过；新事实对照的e07c33c7精确构建/浏览器5项通过，本机1440/390截图查看。最终证据见[冻结结果](../tasks/active/evidence/order-normalization/gate4-preview-results.md)，案件/预览阶段工程通过，整个Gate4执行/纠正未完成。远端交付、合并、部署、真实迁移、人工验收均未完成。具体失败与修复时点见docs/tasks/active/order-normalization-preview.md。

下一工程阶段：有效归属与恢复执行独立分支；不能把本预览能力当作已经解决历史重复订单。真实执行前按案件给出所有SO/引用/限制/备份及纠正方法，仍须用户具体授权。


## 有效归属后续阶段的本地事实（2026-10-15）

独立feat/order-effective-attribution从预览afb71f92继续；0018基础账本/完整组约束与Source目标/generation适配已有本地合成验证，尚无公共执行、审批或完整引用授权能力。当前普通订单列表、详情及其他新业务写入仍待接线，不能宣称全系统已统一归属。原案件/预览验收hash保持不变，阶段记录见[有效归属任务](../tasks/active/order-effective-attribution.md)。


### 后续订单消费者本地接线（2026-10-15）

普通Server列表默认有效SO，includeHistorical=true可读全部原身份；原详情不自动跳转，新attribution/sourceOwnerOrderId明确区分。可信合同事实可投影到复核后有效根，原创建历史与Source link不改，原商业采用/交付计划不搬移或相加。当前认领、血统、商业采用、交付计划和生命周期新写在同一共享归属锁下保护；历史别名409。旧成功商业请求可返回原历史回执，不追加金额。来源owner更新保留历史别名旧计划，当前根比较可信来源事实与自身计划。

归属30项、联合来源/消费者/交付37项、全PG261及依赖回归通过；具体候选时点/失败和限制见有效归属任务。只有内部合成fixture能创建归属映射，公共执行/审批/完整引用仍未实现。历史Source查询与案件选单/历史UI下一阶段；本能力不能当完整归一上线。


## 受控执行服务的当前本地边界（2026-10-15）

0019新增目标identity、immutable proof/review及审批授权指纹。有限旧preview与完整execution evidence区分；后者按全部有界已声明引用行及持lease的可信Adapter指纹计算，未知引用/外部覆盖/超限阻断。未自动覆盖任意JSON或所有外部数据。原有限preview hash不能执行。

新接口POST /cases/:id/attribution-preview、POST/GET /cases/:id/reviews、POST /cases/:id/execute及GET /order-attribution-receipts/:requestId，cases实际前缀/api/v1/order-normalization-cases，receipt实际路径为/api/v1/order-attribution-receipts/:requestId。所有归一HTTP路由session-only，默认启动没有permit/真实Adapter；请求体不能注入enabled/verified/backup/actor/permissions。

仅私有配置的单case/目标/方案/证据/恢复引用/时限许可可执行；配置引用不等于已经验证真实备份。独立生产/财务角色复核及撤销再授失效，管理员执行不代签；原身份/流水不移动或合计。原请求回执、完整组纠正、变更后重审和事务审计回滚已合成验证。29执行、34Case/session、30消费者、261PG等结果详见任务。真实归一未发生，外部Adapter仍default unavailable，历史Source与复核/历史UI待交付，不能宣称整个G4完成。


## SQL防绕过的当前边界（2026-10-15）

0020仅前向新增普通DML保护，未真实应用。历史重复SO不能接收新的生命周期、计划、认领/血统、商业采用、加工消费或新Source绑定写入；所有原身份/历史引用保留，参考准备记录仍合法。Source原owner观察继续更新，但原别名计划不变。Source run/snapshot不可改删，新快照要求有效根/可信合同/精确epoch，过期run不可重新发布为当前。

归属write epoch避免等待锁后的RR旧快照绕过；后补绑定/镜像也校验合同唯一和加工独立性。具体已声明表及SQL负向场景见迁移与effective-attribution-write-guards.integration.test.ts。该保护不宣称任意外部写入、禁用触发器或所有旧二进制兼容；运行态关闭策略和真实回退仍待。15项新增/45项联合本地合成验证，不等于main、部署或人工验收。


2026-10-15后续：新命令暂停/具体兼容回退本地落实0021及Server policy，实证与限制见[ORDER_COMMAND_CONTROL](ORDER_COMMAND_CONTROL.md)。默认无真实归一许可保持，历史Source/复核UI仍待；不视为整个G4交付或真实恢复通过。


### 2026-10-15 历史来源查询的后续本地事实

0022及独立material-history只读API记录新采集scope/link/order version，并按原捕获SO保存/查询历史；当前root不会吸收或合计旧SO快照。旧NULL保持未知，采集时Discovery决定历史款号/InsideOrderNo。历史数据不作当前或当年齐套判断，权限/fixed profile/哈希/分页/字节校验保持；当前reader也校验新上下文。绑定/mirror已知合同身份不可DELETE/改写，非身份观察和颜色切片仍可刷新。没有真实迁移、来源读取、绑定、激活或部署；浏览器历史UI及整个G4待后续。详细API/限制/证据见[历史来源模块](ORDER_SOURCE_HISTORY.md)。


### 2026-10-15 独立复核工作区的后续本地事实

管理员发布精确不可变方案、岗位cap/inbox/context/当前签名及历史分页API已补，复用0019，不新增schema。相关血统链指纹消除无关新SO导致重签，相关引用/身份变化仍阻断；旧proof保留并须新证据重新采用。时钟/财务说明权限及历史发布回执保护已通过21定向回归；没有实际Source、数据库或环境写入。UI仍待接线，详见[独立复核模块](ORDER_NORMALIZATION_REVIEW.md)。
