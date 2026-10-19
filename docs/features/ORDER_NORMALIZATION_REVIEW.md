2026-10-17 当前规则以 [订单业务来源](ORDER_BUSINESS_SOURCE.md) / D-144 为准：取消负责人、认领、合同前准备及公开归一操作；旧记录保留。合同后维护来自报价或来自翻单，加工独立入口保持。以下旧日期内容为历史实现与证据。

# 订单归一独立复核工作区

核实2026-10-15；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；本地feat/order-effective-attribution，依赖未合并G1–G3。GitHub是实时事实源，本文为阶段快照。随API/schema/权限/测试、main/PR或授权变化更新。

## 当前行为与安全边界

管理员完整组预览/发布、生产与财务岗位工作区、独立签名/撤销/历史分页及现有页面接线均已本地完成。发布不是批准；旧approve不是当前可执行许可。请求每次核对fresh真实role绑定和权限，签名绑定精确case/version、方案、完整证据和授权tuple，撤权再授不复活旧签名；生产/财务不能由同一人或执行者代签。

未知覆盖、证据变化、过期许可、暂停等原因继续在界面显示，真实执行默认缺Adapter/permit而关闭；未新增执行按钮、真实角色授权或部署。财务自由说明按现有金额/成本权限投影，不因复核身份扩权。未知响应保留原请求，不自动产生新proof/签名。

原21工作区/30执行/45归属及岗位UI11、客户端4的冻结证据仍按其日期/源码阅读；本轮整合71关键测试与类型通过，不冒称所有旧组本次重跑。代码normalization-review-workspace/service与现有Server案件UI；[UI任务及精确证据](../tasks/active/order-normalization-review-ui.md)。

## 历次工程阶段记录

以下保留各阶段的日期、SHA、结果与限制；其中“待实现/下一步”只描述当时，不能覆盖顶部当前状态。原完整版本亦保留于[归档](../tasks/completed/2026-10-15-order-normalization-review-pre-final-overview.md)。

核实2026-10-15；GitHub API main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；本地feat/order-effective-attribution，起点9ca0c021546526cef0a21d1b29a06e5e47ed59c3/clean。未远端交付/合并/部署。落实用户D121归一/独立复核计划；GitHub为实时工程事实源，本文随API/权限/指纹/验收变化更新。

## 当前职责

复用0019不可变proof与review表，不新增schema、真实角色或来源许可。管理员先读取完整当前组、预览精确方案，再发布供生产/财务选择的proof。发布只保存proof及审计，既不是批准，也不执行归一。已经执行、withdrawn或case版本过时默认不在待办；includeHistory可读原历史。未接真实冻结Adapter或私有许可时执行仍关闭，数据覆盖unknown不当0，不把requiredReviews空数组误称无需复核。

系统管理员+fresh order.view可发布；生产/财务可信预设role绑定+fresh order.view可读取/签相应类型。仅role名称或缓存permissions不能授权；管理者/报价/物控/跟单没有工作区。签名继续按已批准规则绑定精确case/version、target/proposal/evidence及授权tuple；撤权再授旧签名不复活，两种复核独立账号，执行者不能代签。没有因参与复核增加CCT金额权限。

## API

- GET /api/v1/order-normalization-workspace/access：当前可信岗位能力；无order.view拒绝，普通有order.view但非受信岗位返回available=false。
- GET /api/v1/order-normalization-cases/:id/proposal-context：仅管理员，读取case当前完整组（2–100原SO）/version，不能只用原case pair省略已归一成员；不自动决定新root。
- POST /api/v1/order-normalization-cases/:id/attribution-preview：复用原完整有界指纹预览；HTTP仅proposal。
- POST /api/v1/order-normalization-cases/:id/review-proposals：仅管理员，精确proposal+expectedEvidenceHash；内容键(case/version/target/proposal/evidence)+事务锁幂等，一proof一发布审计。已有发布重试返回旧历史回执；来源已变时新发布拒绝，旧回执不自动变成新批准。
- GET /api/v1/order-normalization-workspace/proposals：search<=200、cursor同proof UUID keyset、includeHistory；每页20。
- GET /api/v1/order-normalization-workspace/proposals/:proofId：原proof/方案、允许字段的证据摘要、最新各类签名及fresh授权状态、当前证据是否吻合、执行具体关闭原因。
- GET /api/v1/order-normalization-workspace/proposals/:proofId/reviews：每页20，sequence十进制字符串keyset，不用JS Number丢精度；cursor必须属于同proof。
- POST /api/v1/order-normalization-cases/:id/reviews：复用原requestId/expectedEvidenceHash/proposal/type/decision/reason签名命令。approve完整且当前，reject亦需精确当前证据；重试不产生重复签名。

全部session authority；NoAuth503，GET no-store/strict query；写入保留Origin/X-Zhixu-Request和bounded body。HTTP不能传actor、counts、evidence、coverage、permit或开启执行。server/index没有新增许可/Adapter加载方式；现有execute默认503，没有顺带打开环境或生产route。

## 证据与读取保护

完整Server声明引用仍逐有界行hash，不截断第一100行。原流程曾把全库currentIdentities/lineage加入lineageHash，导致无关新SO使所有待签proof失效。现仅把拟有效roots可达的引用链/缺失叶profile/相关原与有效身份及epoch纳入该部分指纹；目标原组所有引用与外部完整冻结库存仍独立覆盖。无关新订单/无关血统不失效；相关叶边或归属变化/新循环仍阻断。旧原proof不改，新算法下旧hash必须重取证据/复核，不自动回填。

proof jsonb会重排key；读取按已声明v1键序恢复原内容再验证evidenceHash/tuple，拒绝损坏而不展示假证据。16MiB proof读取预算、100成员、5000引用摘要及原100000row/32MiB约束；不输出raw/CCT价格/外部业务facts。财务复核说明须现有售价/工价/测算成本查看权限，不因本人作者绕过撤权；他人的说明也按该边界投影，生产本人操作说明可查看。签名人以不可变public ID追踪，显示名是当前账号名；原签名审计名称仍由审计保存，不假称当前名是签名时名。

详情重新采集当前精确证据，变化时旧proof仅历史显示，不能批准/拒绝；withdrawn/已执行/新caseVersion也明确失效。签名current状态按fresh绑定/permission tuple，旧“approve”不等于现在可执行。许可缺失/过期/不匹配、暂停、签名不足/授权变化/同账号、相关证据变动均有独立reason。状态响应不是执行令牌，必须由写命令再次完整校验；backup/restore SHA引用也不能证明实际备份恢复已成功。

时钟必须finite；NaN不能让冻结来源或<=1h许可验证跳过。没有实际真实时钟、模式或配置修改。

## 工程状态

21工作区（含七角色、并发、失效、权限/金额、分页/旧回执、损坏/时钟/HTTP）、执行30、归属45、全PG261、源码824通过；最终无缓存类型/完整lint/Server编译通过。数据库均一次性合成PG，无真实凭据/Source/账号或业务数据操作。浏览器还未接这组工作区API，本阶段没有新UI或截图，不冒称整个G4/Goal已完成。当前继续proposal/reviewer界面及默认关闭执行原因展示，再全G4/计划查漏/G5。


## 2026-10-15 岗位界面接线

现有Server订单中心/案件Modal已本地接线独立方案发布与岗位复核。管理员明确完整组归属/恢复摘要；fresh生产与财务选择精确proof，独立签名及历史分页；未知覆盖、证据变化、撤权与执行缺许可明确阻断。丢失响应保留原请求，不重复proof/签名；纯读取关闭可取消。执行按钮未开放、无真实Adapter/许可加载。客户端4、候选浏览器11、源码824、类型/lint及静态构建通过；精确源码/截图/门禁收口另见[UI阶段](../tasks/active/order-normalization-review-ui.md)，不是人工验收或部署。
