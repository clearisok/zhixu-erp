# Gate2 最终 Gate1 依赖整合

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；分支feat/order-commercial-versions，从2c6c2315d4b295dba2c6f73f651255f775790b99/clean本地合入G1最终1fcc440f00eeab962eb766161eab96ed5f67c6b4。共同祖先def98f275；没有合并main、rebase、reset、clean或真实操作。

G1 PR109精确head已独立验证，source38664129942/team38664129923/baseline38664130099均SUCCESS，可合并，仍未合并。该状态不代表G2已交付。G1新增的三份报告保留原本1–12/14范围；G2升级及fresh-start必须精确1–12/14/15，最后0015_order_commercial_versions.sql，不以动态文件数放松断言。旧升级样本仅1–11，账号public_id/password_hash与幂等核对保持，业务表仍0。

冲突仅AI_HANDOFF/CURRENT_STATE，双方原文分别归档到completed/2026-10-15-gate1或gate2-before-final-dependency-*。商业版本0015、D122、字段权限与冻结证据保留。详情identity/materials独立key来自G1，不改变布局或商业卡片；没有将后续G4/G5代码混入本分支。

本轮完整类型和Server编译通过。来源/空系统/商业/身份/团队组合初轮90项：82PASS、7FAIL、1Windows平台条件SKIP（六角色金额断言及父测试失败）。原因是team-access旧测试仍期待未采用SO读取共享当前Quote价，与批准D121矛盾；没有恢复旧产品行为。

修复后团队与已采用商业七角色矩阵共26/26PASS：在Quote CCT验证合法金额按角色可见；未采用Order对包括管理员在内均current=null且不回退金额；旧Order PATCH管理员409、其余角色403。已有采用订单矩阵仍验证逐字段权限和旧写价拒绝，保留账号管理、会话撤销、CAS、并发和secret断言。此前通过的来源/空系统/商业/身份结果保留各自范围，不称最后一次全90重跑。

下一步：本地merge checkpoint、最新类型/lint/根回归、实际main门禁及78基线、显式Server候选和商业4/身份5浏览器；新证据补充后唯一依赖PR和精确CI。历史完整PG261及旧截图不冒称本轮重跑；不覆写旧冻结文件/hash，不操作真实库/账号/Source、宁波或18443/18444，不自动合并或部署。

更新时机：依赖head、main、实际测试/PR及发布授权变化。代码与测试：team-access.integration.test.ts、ainuoke-server-source.integration.test.ts、fresh-start.integration.test.ts、server-sales-order-detail-page.tsx；旧证据见gate2-results.md与gate2-premerge-review.md。