# Gate4 原订单历史Source：冻结工程证据

核实2026-10-15；GitHub API main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；本地feat/order-effective-attribution，从b497578752472decffba0b44f6404b4f5cf41f6a/clean继续。源码/本文checkpoint完整SHA由release manifest绑定，不伪造自引用SHA。GitHub是实时事实源，本文是本次阶段快照；后续实现/验收变化另出证据，不覆盖旧历史。

## 已确认实现

0022在新run记录完整order_scope及新material snapshot的精确source_link_id/captured_order_version；旧上下文NULL不回填。新增采集在同一事务验证原合同source owner、当前target、order version和归属epoch。相同旧payload升级后须有一次新context发布，后续幂等原run返回。当前reader独立校验scope/hash/link/epoch，不以历史API代替当前generation。

已知Source binding/mirror合同身份不可DELETE/改写；款号/InsideOrderNo等非身份镜像观察和当前颜色切片仍允许原来源刷新。原SO UUID/编号/creation source、source link、价格、交付计划及各执行记录不移动或合计。

历史API固定Server Source profile、session authority及每次fresh ain.view/order.view/style_progress.read；RR readonly事务。按原捕获SO/run分页/读取，不自动改向有效root；另返回当前有效归属供导航。32MiB/400pages/100000rows完整Discovery/6087050/时间/hash/合同/query/context检查，错误/部分schema失败关闭。无网络、凭据、CCT或业务写入。

响应明确historical_only/currentStatusApplicable=false；独立子schema/sourceStatus historical。数量和四类事件保留，全部状态null，不能假称当时或当前齐套；按当前parser展示旧source，旧缺context明确unknown。未映射私密raw注记在合成fixture注入后不返回，未知量/单位原语义保留。

## 已取得明确结果

- test:material-history：17/17；旧NULL、升级重放、新context、原目标、纠正、来源观察、身份不可删改、稳定keyset/cursor串单、driver损坏、future/partial schema、fresh权限/profile/session/default disconnected、原始私密注记不返回和逐表无写。
- test:order-effective-attribution：45/45。
- test:order-identity：15/15；0022仅隔离升级，旧业务/账号/权限/ledger保持。
- test:ainuoke-server-source：20PASS/1Windows skip；test:ainuoke-continuous：43PASS/1Windows skip。
- test:postgres：261/261，明确exit0。所有DB为一次性合成PG。
- npm test：824/824；无缓存类型、定向/完整lint、Server build明确exit0。
- 真实账号/业务DB/Source/部署零操作；没有新UI文件或浏览器像素验收。本阶段不改变既有13路径UI证据。

## 失败、修复与门禁边界

初始历史16项13PASS/3FAIL是fixture只改未采购首行价格，实际采购事件不变；改所有行并补升级重放后17/17。初始归属45项43PASS/2FAIL因新增NULL列参与旧整行比较；分开比较既有字段/显式旧NULL验收。一次测试SQL的TS引号解析错误为30PASS/1文件FAIL，修正后45/45。没有放宽身份/数量/单位/权限。

第一次发布基线回归被EVIDENCE_WORKTREE_DRIFT decisions-order-command-control-g4阻断，原因新增D127改变当前决策文件。按制度新增committed blob的前向supersedes证据，不替换旧ID/hash/截图；绑定后的最终源码门禁/基线结果另在active任务收口。本冻结报告不把绑定前失败改写为PASS。

## 分维度状态及后续

implemented=yes，仅Server原目标历史查询/上下文/历史身份保护；isolatedTest=passed-historical，仅上述合成测试；merged=false、REMOTE PENDING，没有新PR/CI；humanAcceptance=not-run；sourceActivation=not-applicable（查询未激活真实来源）；18443/18444=not-deployed，旧runtime source/image identity保留未重查。

用户批准D121历史保护及本计划工程；未授权真实迁移、归一、扩大Source范围或部署。浏览器历史入口/普通历史提示/案件历史选单、生产财务复核/默认关闭执行、完整G4及全计划查漏/G5继续，不能把本阶段称完整归一/真实打通完成。
