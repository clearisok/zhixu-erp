# Gate2前向整合G1重试修复前的双方状态

2026-10-15；Gate2起点3deffc478fec2df2909499e5b053330b94997611；G1输入7ef6e665886c937cb01cf82ed2700e33029746fe；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。只合本地任务依赖，不合main。双方完整摘要及历史测试、失败、限制保留如下；PROJECT_INDEX两版本原文可按这两个commit读取。

## Gate2原文：docs/CURRENT_STATE.md

# 当前状态

核实2026-10-15；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。当前feat/order-commercial-versions，从2c6c2315d4b295dba2c6f73f651255f775790b99/clean整合G1最终1fcc440f00eeab962eb766161eab96ed5f67c6b4。本地依赖合入不等于合并main。

G1 [PR109](https://github.com/clearisok/zhixu-erp/pull/109)精确head已独立核实，source/team-access/baseline三CI成功、GitHub可合并，说明更新，未合并部署。修复包括严格旧ledger1–11、精确升级、新组件key与七角色完整UI测试。

G2保留0015独立订单商业版本、精确Quote/CCT候选及显式采用、旧订单共享写价拒绝、字段权限、七角色和只读历史预览。原29商业、19旧商业/API、4浏览器、完整PG261及源码817/基线78为既有分阶段证据，不能写成本次重跑。现显式升级/fresh-start最终ledger1–12/14/15，旧库样本仍1–11；没有漏过0015、动态放松清单或修改SQL。

本次冲突仅AI_HANDOFF/CURRENT_STATE，两方原文均归档保留；已核实来源/空系统/商业/身份回归；旧共享金额团队断言修订后26项通过。完整类型/lint、根824、基线78、实际main守卫、候选构建及商业4/身份5浏览器通过。具体初次失败及复验范围见[本轮证据](tasks/active/evidence/order-commercial/gate2-final-dependency.md)。远端精确送达/唯一PR及CI下一步核实，不冒称已完成。

G3、G4及后续工作树和提交保留，按各自源码证据阅读，旧文档“未开始”不代表它们不存在。G5独立继续，不阻塞订单身份主线。无真实数据库/账号/Source操作、宁波或18443/18444部署，不自动合并。GitHub为实时工程事实源；随main、PR、测试及授权变化更新。

## Gate1原文：docs/CURRENT_STATE.md

# 当前状态：PR109未确认准备重试修复，本地验收后待交付

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5已通过commit API重新核实。沿用feat/order-identity-and-contract-claim，起点1fcc440f00eeab962eb766161eab96ed5f67c6b4/clean。旧1fcc的Source、team-access、baseline三项CI均success，不冒称本次修复CI。

独立复查发现并实际复现：准备已提交但回执丢失后，关闭重开弹窗会清空原请求并可能重复建立准备。现只在无未确认请求时开始新准备，未确认原payload/requestId保留到成功回执；未改变布局、身份、SO数量、来源或执行流水。范围仅同一挂载页面内的弹窗开合，不承诺整页刷新/跨设备恢复。

本轮生产候选Chromium+一次性PG 6/6（含先失败后通过的真实丢回执场景）、root817/817、typecheck、增量eslint及显式Server/session/snapshot构建通过；发布基线71/71及精确main守卫PASS（10页/16能力/7条继承UI路径）。日志和[证据](tasks/active/evidence/order-identity/pr109-preparation-retry-2026-10-15.md)独立保留，旧PNG及冻结证据未覆盖。

PR109不自动合并，修复应先交付并通过新head CI。Git仍NETWORK_DEGRADED，按AGENTS不自动恢复/重复推送；PR详情connector本轮失败，不重申当前mergeable状态。最终本地hash与dirty见git log/status。

G1仍有旧共享CCT；G2–G4及G5本地分支保留，本次未自动修改其祖先或传播修复。后续整合需明确纳入本阶段提交再验收，不把G1当完整新流程上线。

Source树feat/ainuoke-payment-contract-probe@48b63101675f7773b63c7d820d4c1d60088ed9b4/clean原样保留。两个财务样本的个/CNY及三类金额口径已记录；新增两合同真实核验尚无许可，未读凭据/报表。旧四单窗口已结束，不重启；没有真实数据库/账号、首绑、调度、宁波18443/18444或部署操作。

旧状态及失败记录完整[归档](tasks/completed/2026-10-15-pr109-before-preparation-retry.md)。GitHub是实时工程事实源；源码、CI、来源授权、环境或人工验收变化时更新。


## Gate2原文：docs/AI_HANDOFF.md

# 当前接力：Gate2整合最终G1依赖

2026-10-15；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。当前feat/order-commercial-versions从2c6c2315d4b295dba2c6f73f651255f775790b99/clean，本地merge --no-ff --no-commit G1最终1fcc440；共同祖先def98f275。原G2商业逻辑及0015保留，不rebase/reset/clean；不是合并main或部署。

G1 PR109精确1fcc440三项最终CI成功、说明已更新，未合并。合入b497/a40/1fcc修复：旧<=11样本、精确升级/fresh-start、identity/material独立key及七角色页面覆盖。两份共享摘要冲突，双方全文分别存completed/2026-10-15-gate1或gate2-before-final-dependency-*，不抹去历史限制。

最终Source/fresh-start ledger必须1–12/14/15；最后0015_order_commercial_versions.sql，业务表仍0。G2原商业、权限、迁移、冻结证据不变；新G1报告原样保留其1–12/14范围，不把它冒称G2证据。

本地merge d358a3fdb55eac03da0ee6166a493c46a31e238a；初轮来源等90项82PASS/7FAIL/1Linux-SKIP，六角色旧共享金额断言及parent失败，改为Quote正向金额/未采用Order空/旧PATCH拒绝，团队+已采用矩阵26/26复验通过。完整类型/lint、根824、实际main守卫10页/17能力/9UI路径、基线78、显式Server构建PASS。身份浏览器5通过；商业初抢点失败，等待唯一可用按钮修复后4通过，候选buildId20261015-101223/source d358a3fd。最新结果gate2-final-dependency.md；旧完整PG261不是本次重跑。下一步最终commit、精确head守卫、安全交付、唯一依赖PR和CI，不重复创建或自动合并。网络规则不改，未知dirty STOP。

G3/G4/G5原工作树保留、整个Goal未完成；不操作真实账号/数据库/凭据/Source、宁波/18443/18444，不自动合并部署。

## Gate1原文：docs/AI_HANDOFF.md

# 当前恢复点：PR109原请求重试修复

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5通过GitHub commit API核实；feat/order-identity-and-contract-claim从1fcc440f00eeab962eb766161eab96ed5f67c6b4/clean开始。本轮只改准备弹窗重开时原请求保护及其测试/文档；旧摘要完整归档tasks/completed/2026-10-15-pr109-before-preparation-retry.md。

新增Chromium回归先在原产品源码确定失败：POST实际提交后丢回执，关闭重开数量变空。最小修复保留uncertain/requestId/原表单，busy禁另建。后测6/6，两个POST payload完全相同，PG仅增一准备、SO数不变；typecheck/增量lint/Server显式snapshot构建/root817通过。基线71/71和精确main守卫PASS（10页/16能力/7条继承UI路径）。源代码内容hash、构建元数据与限制见tasks/active/evidence/order-identity/pr109-preparation-retry-2026-10-15.md。

旧1fcc三CI成功：38664130099/38664129942/38664129923；不是新修复CI。两次PR详情connector Transport closed，不能报最新mergeable。Git仍NETWORK_DEGRADED，禁止自动恢复推送或文件API伪造提交；保持唯一PR109，不自动合并部署。最终提交和工作树状态用git核实，只提供当前准确安全交付命令。

Source树48b63101及原安全交付命令保持有效，不改其HEAD/dirty，不读凭据或上游。两合同固定查询尚需新的明确许可，旧次数耗尽；样本币种/单位确认仅精确两行，不扩大全表。旧四单窗口不重启，无真实DB或账号操作。

G2/G3/G4/G5和报价logout修复的原工作树、refs、历史报告全保留，未自动吸收本修复。后续按依赖顺序前向整合，复核同路径冲突，不能声称累计分支都已修复。G1共享CCT仍须G2替换；整页刷新后的准备请求恢复不在本次组件内修复范围。
