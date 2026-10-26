# Gate8F：0045/0046非空财务记录的整套持久化恢复

2026-10-27；branch codex/financial-recovery-fixture-main-869e；clean输入d68c25663ac42a8746e15f44f610653e7d6cba06，main869ee84dd0b31de6161011e4aa560678b244a64d沿用同日核实。原Git/ref STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED，不重复失败通道；PR130原61704afe22fe9fd0ea9f6625c6092fcbb9575dfc非本地新增代码。

## 缺口与范围

Gate8B/C分别验证过非空关账/工价采用PG恢复，原整套持久化镜像只含43迁移文件、最大0044。本阶段复用原persistent-local-trial和exact-target Backup/Restore，显式FINANCIAL_RECOVERY依赖DOMAIN_RECOVERY；新exact-source镜像包含当前45迁移文件、最大0046。没有第二套恢复工具、迁移改写、生产业务改变或UI接线。

合成输入：原可信SO先采用113CNY成衣价/1.125CNY工价；手工2027-01、13%和1.125件销售锁定；报价中心原可信修订明确确认4.25USD并采用，故意将新报价售价设9999但原订单售价与锁定历史须不变。手工2027-02、0%和7.25件双渠道，加工另3.125件/0USD独立服务，再锁定。月份/数量不由20.25累计完成推算。原CNY工价关账应阻断，无FX/默认13%/自动收入。

八表必须非空；新旧商业版本、颜色/执行方、锁定清单/历史、精确小数和各协议原UUID/hash/applied结果在重启、冷重建及独立恢复后相同。维护停写后全部public表及pg_sequences精确文本须在恢复启动/login前相同；新financial请求只查原GET，不重放。原source-ledger可同时启用，fake worker仍恰2次，不访问真实Source。

## 交付和保护

WIP14项回执正负测试及四文件lint已通过；随后只补完整labor命令样本和本地测试命令，精确source QA尚待。source commit、canonical archive逐blob核对和只读预审后，最多一次新镜像构建及一次owned全流程。实际失败保留原件及owned现场，不自动循环；未运行结果不预报PASS。原成功结果各归原source，不重复全仓/Hosted检查以省费用。最终精确守卫在收口完整HEAD运行，必要完整PR门禁仍保留。

3001/50426/59069/62426等旧环境、账号/库/对象/卷/备份/Browser全部保护。仅新nonce owned两个项目，成功仅清理本次资产，失败只停已成功prepare的本次服务并保留卷。0真实Source/凭据/绑定/激活/调度/远端写/Hosted/merge/正式部署/入口切换/旧路径退役。关账和USD具体UI仍pending，完整Goal active。原状态[逐字归档](../completed/2026-10-27-financial-recovery-input-state/receipt.json)；本机原件outputs/financial-recovery-20261027。

## 首次实际失败及独立修正验证边界

原22fe4e84镜像构建通过，actual6项4PASS/2FAIL，财务generator前TDZ中止；原件保留，未完成恢复。局部变量仅改名、新边界回归先红后7绿，独立复审0P1/P2。失败项目已停五容器/四卷保留；原276ref及50/179/27所选元数据保持。详见[准确记录](../completed/2026-10-27-financial-recovery-first-attempt.md)。后续新source checkpoint/归档并证明生产字节未变后，复用已构建镜像进行一次新nonce修正验证；testSource/imageSource分别记录，不直接重跑原工具、不重建镜像、不预报PASS。

## 修后全流程及诊断接续

S2 774264574191801147e2151b2b77ef5dc4d30f93修后唯一运行9项7PASS/2FAIL，非空财务、重启/冷重建和离线备份通过，恢复启动失败。一次单独有界补start同样code1/6289ms；所有原件和现场保留，见[冻结失败记录](../completed/2026-10-27-financial-recovery-startup-failure.md)。32网络和缺ingress支持容量推断，尚无明确daemon错误；不删旧网络/不改全局配置。

新增最小safeFailure分类只检查非零子进程的有界stderr，返回固定docker_address_pool_exhausted，不转发原文；身份错误优先，未知继续泛化。负控先红，23相关和两文件lint通过。独立审查指出新archive路径会改变bind/configHash，已停止该方案；不放宽身份校验。

新checkpoint后拟保留原S2全部tracked字节，仅在其ops目录增两个明确记账的唯一诊断文件：新Git blob分类器、只替换该import的原CLI拷贝。dirname/Compose/bind路径不变，执行前核对五服务hash、原容器/卷身份及全部原字节；不宣称诊断runner为0overlay。须完成窄审后仅对同一成功prepared的owned合成恢复目标单独记账一次start，区分tool/image来源，保留旧7/9；不重跑初始化/备份/完整演练，不先改IPAM或预报结果。

## 已执行的独立补验（不改写原失败）

S3/tool545fe97ad1eb14302c2d87ae3b975b9434414a2d安全分类单次诊断明确复现docker_address_pool_exhausted。仅为本owned恢复项目缺失ingress配置经18宿主路由/30Docker子网检验无重叠的10.253.244.0/28；原default/服务/卷/五hash不变，私密config另存，修正start27079ms READY。

独立读取PASS，27本机HTTP、15财务路径/10账本回执/原PNG，8表非空，0领域重放。原全表/sequence断言沿用S2已执行事实，不补造内存快照或称新全流程9/9。三个owned项目15容器已停，12卷和合成备份保留，旧55/183/29元数据及276refs保持。分源、失败、补验、限制和hash见[冻结证明](../completed/2026-10-27-financial-recovery-engineering.md)；完整HEAD守卫另记，Goal/UI/远端边界不变。
