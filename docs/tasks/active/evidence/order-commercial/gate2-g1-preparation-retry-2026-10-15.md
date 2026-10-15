# Gate2：纳入Gate1未确认准备修复及独立复审

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。原树feat/order-commercial-versions从3deffc478fec2df2909499e5b053330b94997611/clean前向合入G1 7ef6e665886c937cb01cf82ed2700e33029746fe；不新建树、不重建PR、不rebase/reset/clean。源码、依赖、验收或远端状态变化时更新，旧工程证据保持原时点。

## 已确认远端及依赖

GitHub PR API核实PR110 open/draft、mergeable=true、base main064e3af、head3deffc。精确3deffc的Release baseline run38670428585、First team access run38670428582、Ainuoke server source run38670428678均success。它们不是本次合入的新提交CI，也不是main已合并、已部署、业务人工验收或真实来源激活。

G1的新修复已用实际Chromium+一次性PG复现准备POST提交后回执丢失、关闭弹窗再打开换请求号的问题，并以原payload重试只增加一条准备的负向测试收口。本轮保留原G1提交祖先和报告，前向带入同一源文件/测试/V1路径记录，避免G2继续携带旧缺陷。Source树48b63101及其既有交付命令保持不变。

## 独立代码复审范围

实际检查commercial-source.ts、commercial-version-service.ts、commercial-projection.ts、0015、旧Order CCT写服务、HTTP权限与现有负向测试。候选来自精确Quote/Revision/PriceVersion及CCT版本指纹；订单持有独立不可变采用快照，旧Order写价409拒绝，无采用不回退报价当前价。报价确认变化和单订单采用只影响明确目标，不静默更新其他订单。

CAS/actor-request唯一约束、事务内fresh权限与审计回滚、零与未知、报价删除后的历史快照、不同业务类型以及已完成/取消阻断有对应集成测试。价格采用Modal保留未确认Command并禁止改源/取消，不存在准备弹窗已发现的同类关闭重置入口。本轮未发现需要改变商业计算或0015的缺陷。

限制保持：完整Server生产/关账尚不存在，不把基础生命周期阻断说成完整关账冻结；原创建历史不改。已冻结/关账记录的真实升级或恢复必须另行具体案件授权。没有新汇率功能。准备请求恢复仍只覆盖同一挂载页面的弹窗开合。

## 冲突与状态修正

仅三份共享摘要冲突，双方原文按原SHA完整归档completed/2026-10-15-gate2-before-g1-preparation-retry.md。PROJECT_INDEX两版本可从原提交逐字恢复。G2的商业feature与0015未覆盖；ORDER_IDENTITY自动合并保留双方有效内容。BUSINESS_RULES中“Gate2尚未实现”与实际代码冲突，本轮只修正为独立分支已实现、未合并部署；已批准规则不变。

## 验证与交付

整合后商业/角色、准备与商业浏览器、类型/lint、Server/UI构建、root与基线门禁按实际日志补录，未执行前不预填PASS。G1报告6/817/71与G2旧报告4+5/824/78均是各自历史，不直接借用。

Git NETWORK_DEGRADED，按AGENTS不自动执行恢复推送，不换认证，不用文件API伪造提交。仅本地任务依赖merge；最终精确远端HEAD/新CI核实前REMOTE PENDING，不建议直接合并累计依赖。沿唯一PR110，不自动合并或部署。

仅合成账号、随机tmpfs PostgreSQL和新临时浏览器。未使用真实凭据、艾诺科HTTP、业务数据库、Source绑定/调度、宁波18443/18444；旧四单窗口不重启。G3/G4/G5及所有原始refs、私有报告保留，本次不自动把修复宣称已传播到其他分支。

## 本轮实际收口

本轮实际通过：商业/七角色29/29、订单身份Chromium6/6（含丢回执关闭重开）、商业Chromium4/4、typecheck、Server编译、显式Server/session/snapshot/writable构建、全源码lint（排除继承outputs私有生成物）、root824/824、基线78/78与精确main守卫（10页/17能力/9继承UI路径）。实际日志为outputs/gate2-g1-retry-{commercial,identity-ui,commercial-ui,typecheck,server-build,build,lint,root,baseline,guard}.log；仅本机忽略产物。没有以旧CI替代本次执行。

构建元数据仍为起点3deffc加本Phase未提交源码；测试输入与G1 7ef6e665的两个blob逐字相同。规范化LF的SHA256如下，提交后复核：

- features/order-center/components/server-order-preparation-card.tsx：f75bce79eca3dfade8163de3c464b479ff602e7b888293c5c9d6b9a0597c6eb6
- server/integration/order-identity-ui.integration.test.mjs：4fb7dff96e08ebe49dbd2d133ddf0d3f3801fa55d6455ceaa8988605f2bb25af

本地复审：Gate2核心采用/隔离边界已由对应测试实证，且现已纳入G1原请求修复。合并建议仍依赖PR109先收口、两PR新精确head交付及CI；PR110仍保留draft，不将本地merge视作main发布。不自动合并、推送恢复或部署。
