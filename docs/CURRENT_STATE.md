# 当前状态

> 2026-10-11 / B：PR #91 已合并，main `fcf36e5eab6c78254f808c1cba38f3a63a66d4f8`。PR #92 Draft 普通 merge 后，原正式订单组件 → 物料摘要 → 原款式只读 Control Tower → UUID 返回的隔离工程验收通过。Source78/78、实际 HTTP/CCT/风险审计19/19、Chromium7/7（43断言）、npm757/757及质量构建通过；**SECURITY GATE PENDING / SYNTHETIC UI ACCEPTANCE PENDING**。既有金额读取漏洞未修复，生产路由与真实 Source 未启用。下方 PR91部署证据保留；本轮不改变18444或真实业务环境。[B接力与复验](tasks/active/order-material-night-integration.md)。

> 2026-10-10：PR #91 / D-102 第二轮反馈新版已按用户授权更新隔离18444，**PREVIEW UPDATE PASS / USER ACCEPTANCE PASS（2026-10-11 用户明确批准合并 PR #91）**。实际源码eb9530a/image1707a8e54159；18443、真实业务库/COS和订单工作树未动。

## 当前工程

- 同一可信 receipt/Quote writer/编号/事务/审计；双击防重，挂载/刷新不创建，未知结果只核对原 token。空草稿保留；类型只读，generic PUT不能绕过专用类型切换保护。
- 设置页只保留制作方案管理→新建默认值，复用原ManufacturingPreset及0011；同国多个工厂按明确ID选择，卡片同步默认国家，未选择不伪造参数。通用汇率仍在第一部分；默认变化不回写旧PV。停用/修改默认方案国家时明确清除当前默认组合。
- Server删除全局补充项UI，并停止未来新报价静默继承旧系统费用/工序说明；旧DTO精确金额/DB字段/历史保留，品牌/业务员及单据级能力、Browser旧行为不变。详情两块冗余区移除，保存状态保留在原头部；基础资料失败局部重试，不回退Browser。PV制作方案用横向卡片，保留权限/历史/CAS。
- 首次/主动恢复默认的Server列表铺满实际容器；旧个人v1像素不覆盖，手动拖宽后全部列保持像素，100px及正式缩略图保留。窄屏内部滚动，不改Foundation其他表格。
- 已有列表100px/偏好/正式缩略图、编辑、Revision/PV、Estimate、确认、附件、Excel/ZIP/内部汇总/日志保留。Intake、完整已有报价类型切换、Excel列筛选、整单复制/删除、Revision删除及转订单不在本轮。
- 本轮不新增或修改migration，复用已发布0011；新候选的0001–0011原始checksum兼容验证、非空disposable仅0011升级/重跑/旧数据保持PASS。正常启动verify-only。订单PR92文件交集为零，未操作其工作树。

## 验证与交付

源码eb9530a工程阶段实际完整Chromium78/78、列表/图片专项27/27、创建29/29、资料14/14、Revision/PV10/10、Estimate8/8、附件/资料迁移11/11、auth/frontend86/86、SSR9/9、npm679/679；typecheck/lint/Server及两种前端PASS，默认build-info browser/browser/writable/session。部署收口未重复上述工程测试/构建。40张合成截图见[工程索引](tasks/active/evidence/quote-pr91-second-acceptance/README.md)；本次另行实际执行备份/完整隔离恢复、运行身份/对象SHA和全新只读Chromium，结果PASS，见[部署证据](tasks/active/quote-two-step-creation.md#second-acceptance-preview-deployment-pass-2026-10-10)。

原分支 `feat/quote-two-step-creation`；工程从f2d7886继续，本次授权部署从local/remote/PR91 676035b / clean继续，main84c8c5b。工程checkpoint eb9530ac9a2e1b7f68299d97c4d424662a6622f7；与订单PR92文件交集为零，未访问其工作树。此前网络故障/STOP/部署证据保留，不改写成当前工程结果。

Linux候选 `zhixu-quote-two-step:eb9530ac9a2e-ux-20261010t141559z` / image1707a8e54159 **已部署18444**，HTTPS/编译/labels一致，server/server/writable/session。最终文档SHA不冒充镜像源码；[构建时完整身份](tasks/active/evidence/quote-pr91-second-acceptance/candidate.json)中的NOT DEPLOYED为当时历史状态。

## 环境与下一步

**18444当前运行eb9530a/1707a8e54159，0001–0011 current；本次未执行迁移。** 新备份 `pr91-second-2026-10-10T15-26-38-395Z`及完整隔离PG/对象/配置恢复PASS。暂停前无上传/创建/写事务，最终30报价/30Revision/PV、2账号、3附件/对象、3回执/67日志及所有业务表哈希保持；database/对象容器、卷/网络/TLS不变，仅app/gateway及白名单构建身份更新。历史28条备份仍保留但不充当本次恢复依据。

用户可继续使用[18444](https://localhost:18444/quote-center)；2026-10-11 用户已正式确认 PR #91 人工验收通过并授权合并。新隔离profile实测默认列表铺满、100px×8组合、拖宽不挤邻列、六种桌面/移动布局、详情去冗余和方案卡片PASS；既有手机大图原件7770409字节，列表实际下载256×192/4767字节缩略数据。现库0制作方案/0全局设置，诚实空态而非自动Seed。未创建报价或保存设置；单次正常登录/注销仅新增1 session/1登录记录。此前部署/STOP证据保留；汇率日期政策、影响预览与批量更新属于后续独立任务，PR #91 的验收与合并不代表该功能已实现。此次授权不涉及新的数据库/环境更新。

[历史部署接力](tasks/completed/2026-10-10-pr91-two-step-handoff-history.md)和[旧项目证据](tasks/completed/2026-10-10-pre-two-step-state-history.md)保留，旧“取消零创建”不再是当前普通电脑规则；工程PASS不是人工PASS。

D-096历史导入NOT REQUIRED；D-097无Browser业务回退、D-098 Quote-first、D-099原版视觉与Server能力底线、D-101剩余业务目标保持。默认Browser不变；新Server能力与真实部署分别记录。
