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
