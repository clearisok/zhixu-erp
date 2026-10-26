# Gate8C USD工价采用：本地验收收口

2026-10-27。后端切片本地通过；不等同远端交付、界面完成、部署或人工业务接受。

分支 `codex/order-usd-labor-adoption-main-869e`；最后核实 main `869ee84dd0b31de6161011e4aa560678b244a64d`，本轮未 fetch。应用初始源码 S `34547801fd818f5f6777809f11c09ddd574688c2`，最终源码 S4 `7afc5bb3a38784bd44dc539dbf1104143ae49fb2`；冻结文档 Q `faa39dee4388d3eba9378a30d7ce925b8231bcec`；清单及本轮发布检查 HEAD M `86b0f2d0f4fca5a2e03353153dabb2a21ffd82b2`。本页和共享摘要的随后提交只更新记录，不改应用、SQL或冻结清单。最终提交的精确守卫另存 `outputs/order-usd-labor-adoption-20261027/final.json`，未生成前不宣称最终 HEAD 已通过。

## 实际结果与来源

- 按[冻结工程证明](2026-10-27-order-usd-labor-adoption-engineering.md)分源替换受影响文件组，192项定向检查通过；这不是S4上一次性全组运行的说法。811项项目检查、根类型、相关lint、Server与前端构建通过。初次类型、构建runner和旧升级夹具失败及修复后的检查原件保留，不重复计数。
- M上 `npm run check:release-baseline -- --base-sha 869ee84dd0b31de6161011e4aa560678b244a64d` 实际PASS，148799ms；11页、68项能力、61个累计UI路径，errors为空。这是源码/证据守卫，不是新浏览器像素验收。
- M上 `npm run test:release-baseline` 实际144/144，422024ms，fail/cancel/skip均0。本阶段Hosted运行0；不重跑无关已通过测试。
- 独立只读静态终审0剩余P1/P2。复核原518条证据与67项能力完整保留，新增后521/68；三个冻结文档及九份原件hash一致，决策链可追溯到已核实main。审查者未执行测试，以上测试由实现者运行。
- 旧50容器、179卷、27网络及111条旧refs所选元数据保持；不冒称旧业务内容审计。数据库验证仅使用新的owned合成隔离库，包括非空升级、HTTP/并发、原子性、备份恢复和旧快照保护。

## 业务与发布边界

仅实现D162/D164的CNY→USD明确工价采用。原USD只允许金额及完整凭据相同的no-op；越界混合选择整单拒绝。报价中心命令复用订单商业版本，保留原产品、成衣售价、批次、旧版本与锁定关账，不换汇、不直接重标币种、不开放一般USD→USD调工价。

完整Goal仍active。USD采用界面、Server关账界面和税率更正尚未交付，不能把后端通过写成完整业务闭环。没有操作既有体验环境、Browser数据、真实账号/业务库、真实Source、绑定/激活/调度、合并、部署、切换或旧路径退役。

Git/ref写0、Hosted运行0。PR130最后已核实远端仍为 `61704afe22fe9fd0ea9f6625c6092fcbb9575dfc`，旧CI不代表本阶段。原Git退出1的 `STOP_AUTH_OR_DIVERGENCE` 根因仍UNRESOLVED，不能因新分支或新SHA自行解除。

## 发布检查本机原件

目录 `outputs/order-usd-labor-adoption-20261027`；`publish-checks.json`保留两个命令、实际HEAD与结果，`guard.json`和`release-tests.json`保留独立回执。

- `guard.log` SHA256：`3d3f563ea839f46237d1e231fd9dbd4ac9e1faab833a9129211cf293d2e7e31d`
- `release-tests.log` SHA256：`dfcb423a299035946c1a6803232ddef5fa58d531031be92d05829062833f2ee8`

[契约](../../features/ORDER_USD_LABOR_ADOPTION.md)；[阶段恢复点](../active/order-usd-labor-adoption-2026-10-27.md)。冻结工程证明中的发布检查“待定”是Q时点事实，由本页前向补充，不覆盖旧证据。
