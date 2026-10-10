# 当前状态

> 2026-10-10：电脑端两步 Server 新建报价 **ENGINEERING PASS / USER ACCEPTANCE PENDING**。基线 main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`，PR #89/#90 已合并；默认单主 Codex。本任务不合并、不部署。详情：[两步创建证据](tasks/active/quote-two-step-creation.md)。

## 当前工程能力

- D-099 原版组合列表、100px 列宽、个人偏好、受保护 Server 缩略图保留；类型/国家/预设 → 品牌/业务员/款号/名称/数量/成衣交期/备注 → 参数预检 → 原子草稿创建，成功进入现有详情。取消/返回不创建，多个预设不自动选首个，无预设允许参数待完善。
- 新 creation-options/preview/workflows/receipts 复用可信 session/RBAC、Quote Service/编号/Repository/事务/审计；旧 POST{} 兼容。预检和最终事务校验 active 同品牌业务员、预设国家/状态/版本；结果未知只查询原 token，不自动重复 POST。加工默认隐藏材料编辑，显式可查看/编辑内部材料；数据和原公式不变，成衣金额不冒称纯工价。
- 已有编辑、Revision/PV、Estimate、linked/unlinked 确认、附件、客户 Excel/ZIP、内部汇总及只读日志保留。完整功能/权限边界见 [QUOTE_CENTER](features/QUOTE_CENTER.md)、[PERMISSIONS](features/PERMISSIONS.md)。
- Intake/手机连续收集/转换、已有报价类型切换、Excel列筛选仍 NOT IMPLEMENTED；整单复制/删除、Revision删除、转订单及完整 Order/Scheduling/Closing UI 仍未启用。D-101 六条业务目标保留，普通两步创建只是其中本轮子集。

## 验证、候选与 Preview

- PR91 P1/P2修复及工程证据保留。新bb451fe不可变Linux候选 **CANDIDATE COMPATIBILITY PASS**：只在临时打包上下文恢复已发布0008原始字节，前9份checksum与18444 ledger一致；非空disposable只升级0010、旧表读回/重跑skip/创建重放/重启回执PASS。Git历史SQL和业务源码不改。本轮定向12+25及database-ops2/evidence6项、typecheck/lint/镜像构建PASS，历史Chromium68不冒称重跑。**PREVIEW UPDATE NOT AUTHORIZED**：18444仍healthy/d2a3509f/27报价/3附件/2账号，0010未执行；旧26报价/2对象备份不新鲜，须另行授权新备份、隔离恢复、维护窗口和配套升级。详见任务证据。

- 初始工程验收（历史，不是本次打包重跑）：Chromium67/67、列表像素/图片27/27、创建25/25、相关API63/63、基础/CCT/空库28/28、auth/frontend83/83、npm679/679及质量/两种构建 PASS。P1/P2后Chromium68及本次打包验证分开记录，候选身份集中在任务证据。
- 新 forward-only0010 只增加预检和创建回执；非空0001–0009升级、全旧表读回、custom dump/隔离恢复/再升级 PASS。0001–0009历史文件未改；0010固定LF。正常Server启动仍 verify-only。
- **18444 未更新，0010 未对 Preview 执行**。因新增migration，须先审阅本轮证据并另行批准可恢复备份/Preview迁移及app/gateway更新；现有演示账号、报价、附件及偏好全部保留。现有地址不是两步功能已部署的证明。
- 18443/旧3000–3002/真实库/COS/秘密/其他工作树均未操作；本轮人工 UI 验收 PENDING。历史Windows部署、D-099/订单/Source验证保留在 [历史状态与接力](tasks/completed/2026-10-10-pre-two-step-state-history.md)，不作为当前操作指令。

## 永久边界

D-096 历史导入 NOT REQUIRED，旧环境保留；D-097 Server不读旧业务/不回退mock或IndexedDB；D-098 Quote-first范围不扩张。默认Browser不变，正式Server需要显式authority和可信session/RBAC；精确Decimal/null/zero、CAS、审计、事务和历史不可变不变。工程、候选、Preview、真实部署和用户人工验收分别记录。
