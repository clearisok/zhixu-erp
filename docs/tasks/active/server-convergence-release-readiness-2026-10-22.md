# Server 收敛：就绪审计与下一条可执行链路

2026-10-22，Asia/Shanghai。F=已验证事实，U=用户决定，R=建议，Q=尚未决定。
本次是只读就绪审计和工程接力，不是合并、环境切换或业务上线。root唯一writer，既有reviewer只读。

## 精确输入与审计边界

- F：GitHub main独立重读仍为`996dfedc12da3527343cd3ff2aa5eea35497e10e`。
- F：从该main建立`chore/server-convergence-release-readiness`，再仅FF干净输入
  `7d323de50d563a6ee7533d0584a2372dc55281e4`。无继承dirty，不改其他工作树。
- F：上一Goal轮次是progress：实际历史merge、原PR祖先核对、116项本地发布检查、
  精确远端7d及其发布CI39676484374均已完成。应用等价输入7ac的三CI也均成功。
  原推送非零/STOP回执与后续零推送exact核对分别保存，没有改写为推送exit0。
- F：本次新增证据只包括公开build元信息、监听/PID、指定容器的image/health/mount元数据、
  当前Git/源码/迁移文件和既有冻结报告。没有读取容器Env、密码、Source私密候选或业务表。
  ignored `outputs/server-release-readiness/`保存范围及原失败，不进入Git。
- F：旧三份状态摘要按原Git blob归档到
  `../completed/2026-10-22-release-readiness-inputs/7d323de5/`。
- U：3001保留；没有历史业务迁移需求不等于授权清库。Git安全恢复和CI有standing授权，
  GitHub合并/关闭、已有入口替换、真实账号/Source/业务库与退役不自动授权。

## 原五大目标的完成核对

| 原目标 | 已有证据 | 未达到的完整条件 | 判断 |
| --- | --- | --- | --- |
| G1 环境收敛 | Gate0依赖矩阵；Gate1独立持久化空目标；当前f469镜像8/8真实恢复演练；本次公开运行元数据 | 50426未切换、浏览器证书/人工体验未接受、旧入口未完成逐项退役授权 | 未完成，不能以镜像测试代替入口切换 |
| G2 正式Server化 | Quote/合同SO/加工批次/商业版本/角色用户日志；候选新增资源、排单、执行、物流、出货观察及受控主镜像刷新 | Server关账不存在；交付计划编辑链路不完整；新代码未合并部署；成衣正式采集/跨次事件尚未闭环 | 部分工程实现，不能称整体Server化 |
| G3 路由闪白 | Gate3真实构建、导航/刷新/前后退/延迟/失败/失效保护的冻结报告和对应代码 | 当前用户入口仍旧构建，未在目标入口人工接受 | 候选工程验收通过，部署/人工接受未达成 |
| G4 艾诺科到订单及执行 | 正式合同身份、颜色/分码、四流、保存的交期读取、受控绑定；0041离线预览/接纳回执；Server执行/物料跟进 | 新真实来源范围、成衣精确过滤、正式收集器/稳定事件；独立交付计划保存回执和编辑接线；关账 | 只读/若干执行切片已实现，完整业务链未完成 |
| G5 添加来源处创建报价 | `server/quotes/creation-order-context.ts`、既有Quote writer/编号/回执与隔离浏览器验收 | 未合并到main、未在最终入口部署并由用户验收 | 实现与隔离验收有证据，不能标为已上线 |

这里不以“测试绿”抬高merged/deployed/user-accepted/source-activated维度。
manifest的261条证据、55项能力及原状态保持不变，审计不改标签或截图哈希。

## 领域所有权仍需分别核对

| 领域 | 当前可信owner / 证据 | 当前边界 |
| --- | --- | --- |
| 身份、角色、用户、日志 | Node session/RBAC/PostgreSQL；0031/0032及#121–123 | 已有候选工程和CI，不等于真实账号已改；管理能力受保护 |
| Quote、确认依据、附件 | 既有Server Quote/CCT与订单不可变商业版本；S3附件；#120汇总修复 | 不回退Browser，金额权限分离；历史CNY/USD工价不改标签 |
| 合同SO/加工SO | 可信合同接纳 / 经正式消费验证的加工批次，原身份及创建历史 | 无认领/负责人/独立翻单/公开归一写入口；报价不是下单唯一身份 |
| 颜色、分码、物料、交付计划 | 保存的Server来源与独立DeliveryPlan；0041受控刷新 | 手工计划永久所有权与Source镜像分离；现有保存命令没有精确原请求回执 |
| 资源、排单、完成、物料物流 | 0034–0039的Server事务、版本、审计；原执行方及实际完成事实 | 与客户需求/商业价/出货独立；旧Browser兼容代码不是Server fallback |
| 成衣出货 | 0040不可变观察及只读页面；D152 Num/outdate | 观察不是跨次出货总账；新真实过滤、行身份/取消冲销、正式采集尚未验证 |
| 关账、收入、银行实付、利润 | 当前关账仍`browserLocalDataStore`，Server路由明确不开放 | 不从6086941申请金额或6086979出货直接确认收入/实付/关账；不能复制旧RMB命名聚合 |

代码证据：`features/quote-center/authority/quote-authority.ts`的Server路由白名单不含
`/closing-center`；`features/closing-center/repository/closing-repository.ts`仍是Browser owner。
`server/sales-orders/color-commercial.ts`保留工价的真实CNY或USD，旧
`features/closing-center/service/closing-service.ts`含原币与RMB命名结果，不能机械移为新Server公式。
命令恢复用的本地技术回执与UI偏好不构成Browser业务owner；不得为“去localStorage”破坏这些保护。

## 当前运行依赖：新观察与旧记录分开

公开构建读取在`2026-10-21T21:18:58Z`，容器元数据补充在`21:22:01Z`；均只读。
最初通用模板不能读取四个缺少可选Health字段的容器；原失败保留，改为可选键读取后取得元数据。
没有把缺少healthcheck写成healthy，也没有为核验启动/停止服务。

| 对象 | F：本次新观察 | 保护与结论 |
| --- | --- | --- |
| 3001 | 127.0.0.1监听、PID26680仍为Node；本次公开build解析未成功 | 不等于停机；Gate0的e3e8历史身份不冒充新核验，永久保留 |
| 50426 | PID33856；公开构建4978e431aad73915864ed2735913dcf091d77bf5、system-settings-copy-20261019 | 对应既有PG fixture数据目录为tmpfs；launcher源码仍使用MemoryAttachmentStorage并在stop时停DB，不能升格为持久化目标；没有重新读取业务行数 |
| 59069 | PID43468；5052439a965dc3dc34b174df68e2d30c1b5f524f | 对应旧PG fixture数据目录为tmpfs，仍保护，不重置 |
| 62326 | 333d7cb2854bc761c28b46e66b8dfc525cb16f90 | app仍依赖live-readiness的ignored构建目录；数据/附件分别有独立volume，保留旧Source样本与恢复依赖 |
| 62316对应PG | 仍running，命名持久化数据volume；app未因此启动 | 不把停止的app或未挂载volume当可删除数据 |
| 62426 Gate1 | app公开构建仍8175f6280d54b6d4af28cb2ebe6d86741b906b9d；五个指定服务均healthy；data/objects为owned named volumes | 仍是旧Gate1目标；app容器公开端点核对不等于本次HTTPS gateway/浏览器信任验收；运维bind仍指向immutable tools-d084a586 |
| 当前候选image | ee7095b4d404c2bd2a1b62402e941f21cff86266817f4e2168d467dccf837f1d、source f4692eea92556ca02fcc068c03940fd2982a4d10 | 当前磁盘image ID再次匹配；先前自有演练项目已清理，不表示已有一个供用户使用的当前候选实例 |
| Legacy数据库 | preparesystem命名volume仍被运行中的容器使用 | 无新业务查询，不清理或导入 |
| 62200/62310/18443/18444、native PG5432、其他volumes/Browser | 本次未重新读取其数据、账号、浏览器store或完整停止资产 | 继续按Gate0保护；旧数量和停止状态仅是原观察时点，不能据此自动退役 |
| Git工作树 | 当前清单31棵，包含后来新增的git-delivery-preflight工作树 | Git祖先不证明ignored输出/依赖可删；本次不检查或修改其他工作树dirty内容 |

本次没有fresh DB行数、账号/密码、私密配置或Browser数据核验。
新观察不推翻Gate0原数据计数，也不把用户“不需要迁移”解释为已有记录可以清空。

## 合并与入口切换的可执行顺序

F：main仍996；开放草稿#120–127均保持原head、CLEAN和各自三项成功检查。
7d验证图已包含八个原head，但main尚未包含这些新head。
#121→#122→#123的实际原始祖先关系允许#123覆盖前两份历史；不因此自动关闭它们。

R：先让#126的证据汇合能力及#127的安全传输核验进入经用户批准的基础合并顺序，再处理
#120、#123、#124、#125的真实最终merge tree。每次以当时main做前向整合，保留原commit，
冲突只按各自已批准规则解决并重验；今天的CLEAN不证明下一次合并后仍无冲突。
状态文档/manifest已有真实四/五路径冲突历史，不能直接选某一方覆盖。
之后再让Gate3–7的独立功能提交逐阶段进入PR；不把验证分支包装成重复的累计业务PR。
这是建议顺序，不是GitHub执行授权，也不是对未来merge tree的预验收。

R：新入口使用新项目、新private root、新数据库/对象/secret volumes，不复用50426临时库或
62426已初始化库；不迁入旧演示业务。候选当前40个迁移文件、最大0041（无0013），main/Gate1
原基础为29个。`server/index.ts`先`verifyMigrationsCurrent`再监听；普通start/restart不迁移。
因此不能只换镜像、复用旧库并宣称升级成功，也不能用现有`init`对非空库碰运气。

真正获准切换时，依次完成：

1. 固定已评审/获准合并的源码、image ID、buildId/time与不可变ops；若源码与f469不同，重新构建和相应验收，不给旧image重贴新源码身份。
2. 用既有`new-local-target.ps1`及`trial.mjs check/prepare-local/init/objects-init/start`在全新目标初始化，明确新技术管理员与Origin/TLS；不启动真实Source或持续调度。
3. 验证准确schema、空业务边界、DB/S3/session、原子备份及独立恢复；旧环境的数据/账号/附件另行保护，不靠“没有迁移需求”替代保护。
4. 在独立预览入口完成真实浏览器路由、六类角色、报价/加工/订单/交付/排单/完成/物流及允许范围内Source演练。CLI的CA验证不等于浏览器信任或用户接受。
5. 取得对50426目标/停机窗口的具体批准，保持localhost/127.0.0.1、HTTP/HTTPS、Cookie和Origin明确；只切准确入口，不顺带停止3001或清理其他资产。
6. 回读新入口build/镜像/卷/权限；失败保留现场，回到被保留的旧入口。应用切回不等于可把旧image接到新schema；有新业务写入后不得自动恢复旧dump覆盖它。
7. 替代能力获接受后，再逐项提出退役清单、完整备份、依赖解除与删除范围，另获授权。不存在当前可自动执行的全局prune/reset/down-volumes步骤。

本次未执行以上任何初始化、切换或备份操作。f469至7d仅文档及持久化测试helper不同，
应用/ops运行文件仍一致；这证明候选内容关系，不抬高merged或运行实例状态。

## 不依赖待决项的下一条实际工程

F：独立review找到DeliveryPlan真实缺口。现有命令只有expectedVersion/upserts/voidIds，
服务保存后直接返回，未保存requestId/原请求精确回执；前台主要是lazy GET。
CAS会拒绝旧版本重放，但无法在提交回复丢失后区分“本请求成功”和“他人修改”。
依据：`server/sales-orders/delivery-plan-model.ts`、`delivery-plan-service.ts`、
`features/order-center/components/server-saved-order-sources.tsx`；D100和BUSINESS_RULES的
独立交期计划、永久人工所有权、数量分离规则已批准，不需要新增业务定义。

R：下一独立工程先补既有writer的可核对请求/回执，不另造交期模型：

- 精确请求身份与内容一致性、事务/CAS/审计、fresh权限及有效订单冻结；重复同请求返回原结果，换内容拒绝。
- 提交成功但回复丢失时按原请求核对；核对权限不能因历史成功绕过，不能自动重试未知提交。
- 保留手工计划永久所有权、撤销/系统派生零量/数量差异和Source刷新保护；人工输入仍须正数，不修改Source、价格、订单身份或生产流水。
- 先审实际旧PATCH/API调用与测试再定兼容策略，不臆断旧调用可删；新迁移仅前向、隔离升级，不修改旧SQL。
- 定向SQL/API/并发/失回执/权限/金额负向验收与独立review后，才考虑既有折叠区的编辑接线及其精确UI批准范围。

这是一条当前可执行的实质工程，完整Goal不能仅因出货/关账待答就被标为blocked。

F：另外一个后续工程缺口是Server多交期风险投影。当前
`server/production-scheduling/read-model.ts`与Server排单页的warnings主要覆盖overassigned；
repository已经读取deliveryPlans，客户端也保留，但多交期`projectDeliveryRisk`仍只在Browser service。
BUSINESS_RULES已确认累计交期需求与预计/实际供给的比较、无交期不造风险，因此可在可靠交付计划之后
继续非金额只读投影/原异常视图接线。必须保留D151取消记录已有产出、原owner、exact decimal和null，
不直接复制旧Browser active-only/浮点模型。本次未实施或声称风险闭环已完成。

## 仍待原问题答复，不替用户默认

- Q：固定C1/C0/C1精确合同过滤核验的新增真实额度；旧D1933/D1935额度已消耗。
  此额度即使批准，也不自动授权正式绑定/target激活、持续采集或业务DB写入。
- Q：加工服务产值是否计入成衣销售产值；已采用CNY工价怎样进入USD关账；完成更正对关账stale的处理。
- U：Num/outdate已经确认，不重问、不改为其他日期或物料字段。
- Q：具体GitHub合并/关闭、50426入口切换、真实账号、旧资产退役分别需要对应批准。

本阶段只形成就绪审计，不新增能力/业务规则、不执行新业务测试或部署。
精确文档checkpoint、源守卫、范围/归档核对与独立review另记；不得把旧业务/镜像/CI结果说成本次重跑。
