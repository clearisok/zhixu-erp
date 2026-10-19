# Gate4：最新依赖、历史保护复审与防降级验证

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5已通过GitHub commit API重新核实。复用order-normalization-preview工作树：原feat/order-normalization-preview@afb71f921b5645ed83f03d46a784d1e30f8325f2/clean保留，切到既有feat/order-effective-attribution@036fe521ba16a7b5193d1c68cc1f6cc76626709a/clean，前向整合G3 4da3590b46e201857223c09bb951331196ba352a（含G2/G1最新修复）。无新工作树、重复PR或main合并；源码、依赖、测试、远端及授权变化时更新。

GitHub workflow API核实旧036fe521的Release baseline38674140024、First team access38674139960、Ainuoke server source38674140003均success。PR112详情connector失败Transport closed，本轮不重新断言其head/mergeable。旧CI不是本次合入验收；不自动合并/部署。

## 实际复审

检查有效归属解析与写锁、执行服务的目标/方案/证据/私有permit绑定、默认unavailable覆盖、独立生产/财务复核、原请求回执与纠正场景及对应测试。未知引用/Browser或外部覆盖不能当0；有限预览hash不是执行令牌。缺具体permit默认拒绝，HTTP体不能授予自己执行权。原身份/创建来源/绑定/流水不搬移或合计；历史别名的新执行由服务和已声明SQL fence保护。

现有测试覆盖来源归属在采集期间变化则整个发布回滚、完整组及相关血统、双边执行/冻结需独立复核、撤权重授不复活签名、审计或外部lease复查失败回滚、归一后新增流水阻止旧纠正、暂停及未知schema失败关闭。本轮不把已声明Server表的保护扩大为任意外部系统或禁用触发器的保证；真实备份引用和permit格式也不等于已经执行真实恢复演练。

## 防降级处理

G4的D130准备组件比早期G1修复更完整：按用户/订单的sessionStorage outbox、刷新恢复、单独回执核验、稍后核对和离开保护。因此依赖合并冲突不能整份采用G1旧组件。组件完整保留原036fe521内容，LF规范化SHA256为5f58929b67aec9a77d462baf2b49c01e5b867f968001286c872617047755a679。

新增丢回执负向测试仍保留，按现有交互验证：X不丢弃未确认请求；“稍后核对”关闭后从“继续核对”重开；fieldset禁改、原payload重试，数据库仍仅一条准备且SO数不变。HTML禁用使用:disabled检查fieldset继承。没有改产品组件、布局、SQL、来源代码或执行策略，既有D130审批及冻结截图保留。

五处冲突为三摘要、ORDER_IDENTITY和准备组件；双方原文/日期/hash/测试限制完整归档completed/2026-10-15-gate4-before-g3-preparation-retry.md。身份feature顶部明确当前D129/D130行为，下方G1内容作为历史，不把早期“只同页恢复”当当前边界。

## 验证与交付边界

归属/执行/准备客户端、身份/准备/复核浏览器、类型/源码lint、Server和显式候选构建、root/基线及精确main守卫按本轮实际日志补录，不借旧CI或旧840/78作为新通过。其他原工作树、G5及Source48b63101/clean不变。

Git NETWORK_DEGRADED，按AGENTS不自动恢复推送/换认证/文件API伪造提交；沿唯一PR112，核实新精确远端SHA/CI及前序依赖后再给合并建议。真实执行默认关闭，没有加载真实Adapter/permit；未读凭据或艾诺科报表，不操作真实归一、业务DB/账号、Source首绑/调度、宁波18443/18444或部署，旧四单窗口不重启。所有数据库与浏览器验证仅随机tmpfs合成库/临时profile。

## 本轮实际收口

本轮实际通过：有效归属/SQL保护45/45、执行/完整证据30/30、准备客户端10/10共85项，身份6/6＋准备10/10＋独立复核11/11共27浏览器，typecheck、Server编译、显式Server/session/snapshot/writable构建、全源码lint（排除继承outputs私有生成物）、root840/840、基线78/78及精确main守卫PASS（10页/26能力/28继承UI路径）。日志为outputs/gate4-g3-retry-{attribution,execution,preparation-client,identity-ui,preparation-ui,review-ui,typecheck,server-build,build,lint,root,baseline,guard}.log，只留本机忽略目录。未借用旧CI/PG261或单纯检查返回标签。

产品组件与原036fe521 blob逐字相同，归属/执行/来源服务及SQL相对原HEAD无差异。构建元数据gitCommit=036fe521、buildId=20261015-205206；测试/文档含本Phase未提交增量。所验两个blob的LF规范化SHA256为：

- features/order-center/components/server-order-preparation-card.tsx：5f58929b67aec9a77d462baf2b49c01e5b867f968001286c872617047755a679
- server/integration/order-identity-ui.integration.test.mjs：dbde9b8e278d4ac2dc69eaa471d575fec1c0880e2479e4e1cb92d6140d433d85

复审结论：本地依赖对齐通过且未降低G4保护。仍需前序PR新提交收口、本阶段精确远端SHA和CI；不以旧PR112结果替代，不建议越过依赖合并累计代码，真实执行许可与覆盖始终保持单独边界。
