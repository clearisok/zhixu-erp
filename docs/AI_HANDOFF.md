# 恢复点：Gate8G2c年度同范围两项读取

2026-10-27；branch `feat/order-closing-month-plan`，clean输入81879ad66d5cb92088852ecfc0f2e48e3d027c13。main869ee84dd0b31de6161011e4aa560678b244a64d对象/祖先已核实，无fetch/远端写；原STOP未定，PR130旧head不含增量。先读D172、[年度契约](features/SERVER_CLOSING_ANNUAL_READ.md)、[阶段](tasks/active/closing-annual-read-2026-10-27.md)，输入状态逐字归档。

GET /api/v1/closing/year是RR只读，year明确；scope all/internal/outsource/unassigned、真实production状态和search且条件先筛选，再汇总12月/全年并分页。开放月实际采用价参考，confirmed/locked只取原manifest；不拿当前Quote/Source重算冻结。只两项CNY/USD，不换汇或另建价格；加工没有销售价，未知额null/incomplete与已知小计，confirmed0有效。待分月不塞当前年/月；unsupported默认月冻结的新SO仍pending可见。当前订单信息/生产只是参考，冻结身份另标。

复审修复：冻结行比较reviewBasis，confirmed更正须复核，locked保留提示；lockedSnapshotPreserved不是发生更正，只在laterCorrection时出issue。实测confirmed/locked同生产状态改量、无更正正控，金额都保留。frozen-only不依赖当前Source/商业资格。新23项、修后年度11项、旧月份37项PASS，重叠不相加；只读复审0P1/P2。初始PriceView bucket类型失败、复审前规范副本PASS与后续精确检查分开。最后规范副本/源码绑定、lint、提交与守卫看本机final.json，不借G2b163/G1发布或旧镜像结果。

下一片年度严格client、月份服务HTTP/原请求outbox、正式Server owner页面；勿直挂Browser hooks。已批准UI无需再问；Quote USD采用UI独立pending。全年总额与明细同范围，整单移动即使隐藏部分也完整预览；未决请求核对原ID，不自动重试。旧手工入口未整体退役，Source/归属更正仍后续，新镜像非空回执恢复和实际浏览器后才改能力。

当前68能力不变，Goal active。0真实Source/现有账号业务库/远端/Hosted/合并部署/切换退役；保留3001/50426/59069/62426/18443/18444、Browser数据、旧卷和备份。原Git/ref STOP原因未定，不在后续Gate重复推送。
