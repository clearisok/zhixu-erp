# 当前状态

> 2026-10-10：PR #91 用户验收修正（D-102）实施中：点击新建立刻保留 Server 草稿、默认类型/国家/预设及设置布局。新增0011未部署；18444仍为以下历史两步版。以下电脑端两步 Server 新建报价 **ENGINEERING PASS / PREVIEW UPDATE PASS / USER ACCEPTANCE PENDING**。基线 main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`，PR #89/#90 已合并；默认单主 Codex。明确授权的隔离18444已仅升级0010并更新app/gateway；不合并PR91，不更新18443。详情：[两步创建证据](tasks/active/quote-two-step-creation.md)。

## 当前工程能力

- **当前修正**：creation-defaults/原receipt/writer、全局默认值CAS及0011、详情只读制作摘要和设置布局正在验证；普通电脑不再要求两步表单，已有类型切换仍未实现。工程完成与 Preview/用户验收分开记录。
- **历史两步实现（D-102替代交互）**：D-099 原版组合列表、100px 列宽、个人偏好、受保护 Server 缩略图保留；类型/国家/预设 → 品牌/业务员/款号/名称/数量/成衣交期/备注 → 参数预检 → 原子草稿创建，成功进入现有详情。取消/返回不创建，多个预设不自动选首个，无预设允许参数待完善。
- 新 creation-options/preview/workflows/receipts 复用可信 session/RBAC、Quote Service/编号/Repository/事务/审计；旧 POST{} 兼容。预检和最终事务校验 active 同品牌业务员、预设国家/状态/版本；结果未知只查询原 token，不自动重复 POST。加工默认隐藏材料编辑，显式可查看/编辑内部材料；数据和原公式不变，成衣金额不冒称纯工价。
- 已有编辑、Revision/PV、Estimate、linked/unlinked 确认、附件、客户 Excel/ZIP、内部汇总及只读日志保留。完整功能/权限边界见 [QUOTE_CENTER](features/QUOTE_CENTER.md)、[PERMISSIONS](features/PERMISSIONS.md)。
- Intake/手机连续收集/转换、已有报价类型切换、Excel列筛选仍 NOT IMPLEMENTED；整单复制/删除、Revision删除、转订单及完整 Order/Scheduling/Closing UI 仍未启用。D-101 六条业务目标保留，普通两步创建只是其中本轮子集。

## 验证、候选与 Preview

- 18444实际运行源码 `bb451fe1895ef48eed7a8215dd1d88acd2cc0e9f`，不可变镜像66de；HTTPS/数据库、app、gateway健康，0001–0010 ledger current、checksum精确一致。复用本窗口已 **FULL RESTORE PASS** 的新完整备份，最终只读现场核对PASS后仅应用0010、仅替换app/gateway；数据库/对象服务容器、卷、网络、TLS和非身份配置保持。原27报价/3附件及关系/2账号完整读回，全部3对象大小与SHA不变；未新增演示数据。

- 初始工程验收（历史，不是本次打包重跑）：Chromium67/67、列表像素/图片27/27、创建25/25、相关API63/63、基础/CCT/空库28/28、auth/frontend83/83、npm679/679及质量/两种构建 PASS。P1/P2后Chromium68及本次打包验证分开记录，候选身份集中在任务证据。
- 新 forward-only0010 只增加预检和创建回执；非空0001–0009升级、全旧表读回、custom dump/隔离恢复/再升级 PASS。0001–0009历史文件未改；0010固定LF。正常Server启动仍 verify-only。
- **18444已更新，可人工验收**：[列表](https://localhost:18444/quote-center)、[两步新建](https://localhost:18444/quote-center/new)。本次实际只读Chromium：登录权限、两步前进/返回/取消零创建、组合/独立100px保存刷新、四档桌面布局及大图缩略图/触屏视图PASS。原图7770409字节，列表只下载256×192/4767字节缩略图。用户Browser个人设置未读取/清理；测试仅用临时profile。完整创建流程本轮未在Preview执行，等待用户人工验收。历史STOP和Docker Desktop路径表示差异的逐字段/文件SHA证明保留在任务证据；未自动回滚、恢复或初始化。
- 18443/旧3000–3002/真实库/COS/秘密/其他工作树均未操作；本轮人工 UI 验收 PENDING。历史Windows部署、D-099/订单/Source验证保留在 [历史状态与接力](tasks/completed/2026-10-10-pre-two-step-state-history.md)，不作为当前操作指令。

## 永久边界

D-096 历史导入 NOT REQUIRED，旧环境保留；D-097 Server不读旧业务/不回退mock或IndexedDB；D-098 Quote-first范围不扩张。默认Browser不变，正式Server需要显式authority和可信session/RBAC；精确Decimal/null/zero、CAS、审计、事务和历史不可变不变。工程、候选、Preview、真实部署和用户人工验收分别记录。
