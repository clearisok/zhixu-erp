# 宁波 Server 体验与艾诺科闭环：发布准备

2026-10-28，基线 main `6479a713e2b80228f008049519ebbd50d10601a8`；当前产品 `a198d1829675092006708727624ee867be0e7b60`，累计交付 PR131。此文是当前准备清单，不是部署、真实来源采集或调度授权。原[10月14日方案](../../ops/ningbo-rollout-plan.md)及[Gate0完整目标](server-convergence-gate0-2026-10-20.md)保留历史；旧六固定角色、未开放生产/关账和旧 schema 数量不能继续作为当前候选配置。

## 本次只读现场事实

通过既有 `weaveops` SSH 别名、BatchMode、严格已知主机校验进行只读观察；没有 sudo、凭据读取、数据库查询、安装、构建、容器启停或配置写入。

- Linux x86_64，Docker 29.8.1；根盘剩余194G、可用内存约13.2GiB，未做压测。
- 旧 `zhixu-prod` 与 `zhixu-staging` 各两服务健康，应用分别仅监听127.0.0.1:3000/3002。不能重用其数据库、卷或环境文件初始化新版本。
- `https://staging.weaveops.top/build-info.json` 当前200；其 buildId、gitCommit 与宁波127.0.0.1:3002精确一致，均为旧 `7cd43b6142800bb61827410395c4a2d7a9856bc5`。这关闭了旧报告中“公网是否可达/是否指向该旧应用”的特定未知；不证明新版本已部署，也不证明全部Access/WAF策略正确。
- 旧staging镜像 `sha256:b8559139d6ac7ae464c6970a0e93a1773f73d3cfd6526b1b98443337702f6578`，unless-stopped；没有附件挂载/显式附件storage配置，也没有当前Source配置键。不是本轮Server候选。
- 宁波已有Node v22.22.1、Git2.53.0、Compose5.5.1，无需先安装运行时。`/home/jackson/weaveops-staging-preview`当前不存在且父目录可写，可作为待批准的新目标；不复用旧目录。3003当前未监听仅是观察，不保留端口。未创建目录或安装依赖，源码operator的锁定依赖与私密忽略目录仍待准备。

## 唯一链路与实际缺口

| 业务 | 已有唯一实现/证据 | 发布前要完成的核对 |
| --- | --- | --- |
| 合同→SO→颜色尺码 | `server/ainuoke-source/{binding,additions}.ts`、正式source link/mapper；稳定颜色身份 | 精确新目标上首绑/新增的预览、确认、唯一SO；只接受合同身份，不用款号匹配 |
| 旧合同主信息/颜色变化 | `bound-order-refresh.ts`和离线operator；原Discovery/6087105证据 | 明确预览/采用新证据；不把物料scheduler当主信息自动刷新；手工交期、价格、排单和历史保持 |
| 采购/入库/物料出运/出库 | `captureSource`→原Material Pipeline→持久快照→只读页面；`cli.ts`的execute/schedule | 精确已绑定范围、完整分页、单位/unknown、连续刷新及过期/故障恢复；不能把历史样本当当前持续运行 |
| 6086941货款申请 | 独立payment targets、operator、snapshot reader和页面 | 保留采购/出运/报关/开票各数量与金额；申请不等于银行实付；独立目标/过滤证明/采集授权，不随物料自动启用 |
| 6086979成衣出货 | garment target/control/operator、不可变观察及页面，Num/outdate | 仅可信合同精确过滤；当前worker两遍完整首页，上限100行，超限拒绝而非截断；不跨快照累加，不替代生产完成或收入 |
| 交期→生产→关账 | 原DeliveryPlan、Server计划/实际、月份计划/来源复核/执行匹配/财务快照 | 实际产出保留原执行方；新量不静默摊月；CNY销售/USD加工、显式税率、确认/锁定/恢复及分角色读写 |

已有a198完整非空恢复9/9以及本机合成界面证明继续有效。当前65139是 `snapshot/local-empty` 空候选；这些证明不能替代“精确发布目标上的真实首绑→续刷→页面/单位/数量人工核对”。来源未启用、陈旧、缺数量、缺单位或暂未出货都必须保留真实空/未知状态，不能为演示补造业务事实。

本地新增[同单据跨域验收](../completed/2026-10-28-ainuoke-same-order-closure.md)：两合同正式首绑，同一主SO贯穿四流、6086941、6086979、Quote采用、手工交期、生产和锁定关账。20件完成、7件成衣出运、100件月份计划相互独立；合同增至120件不改原身份/稳定颜色或已冻结执行金额。最终8/8；仅合成worker/自有一次性PG，不能据此核销真实续刷前置。

**Linux运行方式已实测**：使用已缓存精确90e镜像、无网络/挂载/凭据、只读rootfs和非root用户的一次临时容器，Node v22.23.3、Python3.14.10可用，Git/tsx不可用。payment/garment compiled入口的help成功，但使用不存在的合成receipt路径时分别先拒绝payment_operator_committed_clean_worktree_required、garment_operator_committed_clean_worktree_required。未触碰私密文件、数据库或上游。这证明应用镜像不能充当源码operator，不是Linux生产采集正控；按第4步复用同SHA的干净源码工具目录，无需放宽原件保护或把Git加入应用镜像。

**待实测的时效风险**：`scheduler.ts`在整轮成功后默认等待300000ms；`source-adapter.ts`按每页fetchedAt判断600000ms等已配置上限，而不是只按发布时刻。若较早页距本轮结束超过300秒，五分钟等待就可能在下一轮开始前触及十分钟上限，下一轮采集和发布还会增加等待。历史2026-10-13全量物料阶段414954ms仅是风险线索，非本轮页龄测量或当前已发生故障。有限代表合同验收应记录每页最早时间、两轮成功发布间隔和页面陈旧/恢复状态，不靠延长TTL或改采集时间伪造持续展示；全量扩展另据实际预算决定。

## 收敛后的执行顺序

1. **代码收口**：当前PR修Hosted暴露的旧验收与状态说明，增加接入现有source CI的同单据跨域回归，不加新ERP功能。沿订单月份计划采用财务快照验证CNY阻断、USD零价和真实非空锁定快照；登录按当前order-read门控验证匿名访问。集中一次上传、一次必要CI、精确复审，之后请求合并；已有传输降级时不在后继Gate撞同一失败通道。
2. **冻结候选**：获准合并后，从精确main构建一次Linux Server镜像。保存source/image/build-info/完整迁移checksum；显式server、session、writable、snapshot。旧Legacy deploy-production workflow不使用。
3. **准备可审阅目标**：新Compose project、独立空业务DB/持久卷、独立附件存储namespace、受保护新管理员、loopback入口；旧3000/3002/域名路由先保持。应用Origin固定为最终HTTPS域名，cookie、反代及对象TLS实际核对。具体端口、目录、镜像和秘密文件路径冻结后再请求实际部署批准。
4. **验证操作者运行方式**：复用现有CLI，不另建collector。物料CLI可在正式Server镜像运行；主信息刷新/payment/garment operator要求干净源码checkout和Git原件校验，不能把无Git/tsx的运行镜像冒称可直接执行。准备与应用同SHA的固定工具目录与锁定依赖，仅有界连接新目标；私密job/报告和凭据分离。先合成验证其Linux入口，不读取真实凭据或调用上游。
5. **真实来源最小验收单**：准备精确目标、账号指纹、合同SO清单、请求上限/时间/窗口和停止方式供批准。优先复用已核实的两合同PI2608-257/PI2609-039作为四流/申请代表；成衣使用D1933既有证明能唯一定位的合同，未唯一定位不猜。某合同没有申请或出货是合法状态，不要求每单强行具备所有流水。旧真实许可已消耗，不重读全量558合同来替代此验收。
6. **一次采集再续刷**：获具体授权后先受控首绑/一次采集并核对UI；再另列有限续刷窗口验证新代际、重启、停止、故障及陈旧恢复。新合同仍人工预览接纳；payment/garment不暗中加入四流调度。用户接受后才提出持续调度方案。
7. **正式提醒**：D105的真实四流持续展示前置保持；先在精确本机候选完成获准的有限续刷和业务核对，再提出宁波晋升。必要CI/复审通过、具体可部署候选与隔离/备份/回退可审阅后，提醒用户批准staging体验部署；宁波新目标的Source初始化/额度另列具体执行项，不跨目标复用本机许可。空系统可用和真实来源闭环分别验收，不把“能打开页面”描述成整个Goal完成。

## 回退与保护

仅针对新候选关闭写入/停止已批准采集、保留新DB/对象与全部回执；旧环境保留。新版本已有写入时，不能用切回旧空账本代替数据恢复，也不承诺旧镜像兼容新schema。备份必须包含数据库与对象，并在新独立目标实际恢复；历史9/9不替代最终main候选验证。未知COMMIT核对原请求，不换UUID重采。真实凭据/原文不进入聊天、Git或Actions；不自动合并、部署、迁移旧库或退役资产。

## 本机离线交付准备（663后继片）

从干净 `663be51fc4bb41868b2bd96d31d4ed3a2a83a258` 制作一次完整历史Git bundle，并从该bundle实际离线clone，精确HEAD相同、3303个tracked文件、工作区干净。没有远端Git请求或上传。文件位于 `D:/zhixu-server-convergence/ningbo-release-review-663be51f/source-663be51f.bundle`，169327926字节，SHA256 `51ec79e45181bb0b58b1d4b4124e9822811a86e34ac8a0f2ed1b44e2fd00259e`；`git bundle verify`确认完整历史且无外部prerequisite。这是可保留原始提交的离线源码交付备份，不是最终main发布镜像或新的部署批准，也未传到宁波。

同目录 `source-review.json` 冻结51项SQL及21项ops文件的SHA256/长度、工程镜像90e/a198身份、具体待审目标和未通过的发布Gate；其SHA256 `381decb8842b47dc39969b80e777deca16e8d8115a889ede285fe1a603dd90fe`。状态固定 `LOCAL_SOURCE_REVIEW_ONLY_NOT_DEPLOYABLE`；不含凭据、数据库备份、node_modules或未提交工作树。这里的“Git完整历史”只指该分支祖先，不冒称所有本机其他分支均已备份。新提交/合并后必须冻结对应新SHA，不把663源码包标成新main。

本片一次只读SSH补齐source host条件：Linux/x64、Node22.22.1、Python3.14.4、npm9.2.0、GNU tar1.35；原Git2.53.0/Compose5.5.1观察保留。不安装依赖或修改服务器；已具备运行时不等于同SHA锁定依赖已准备，也不证明实际collector成功。应用镜像仍不能直接运行clean源码operator。

另查明 `scripts/isolated-source-window.mjs` 及原demo operator仅接受历史“四合同/10分钟/两小时”固定许可，不能更名或改JSON复用为当前两合同窗口。新两合同有限验收继续复用 `collectSelectedSourceOnce` 的每次1登录/80报表/180秒预算和原 `captureSource` 发布，按明确次数逐次调用，不借原无限schedule/backoff或旧四合同许可增加请求；最终次数/间隔/截止和目标由待批准执行单冻结。此处只核对原入口，没有修改它们或获得新采集额度。

本片验证为bundle verify、实际离线clone、72个冻结文件长度/hash零差异、3303 tracked文件、diff检查及独立只读复审无P1/P2。只增加本节与状态/接力说明，没有产品/SQL/测试或发布manifest变化；不重跑663的8项回归、类型/lint、精确guard或c9的182项完整发布。不把复用结果描述成本片新测试，也不声明新Hosted检查成功。最终远端交付时仍须核对当时精确HEAD及所需发布门禁。
