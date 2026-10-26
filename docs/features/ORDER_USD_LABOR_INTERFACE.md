# USD 工价采用：查询与浏览器原请求基础

2026-10-27，Gate8D1，实施 D162/D164 的配套读取与客户端协议；当前没有接入新操作界面。报价中心仍是唯一采用 owner，订单商业版本及原 CNY→USD 命令不另建模型。前置后端契约见 [Gate8C](ORDER_USD_LABOR_ADOPTION.md)，其冻结状态与历史证据保留。

## 查询与确认来源

在原 `/api/v1/quotes/order-labor-adoptions` 内增加 session-only GET：

- `/orders?quoteId=...&search=...&offset=0`：当前采用同一 Quote 的物理订单，合同类和加工类共用；20条分页、确定排序、文字搜索按字面匹配。返回工价汇总、状态和引用，不返回成衣售价、成本、产品快照或产品hash。已完成/取消/历史重复仅标只读。
- `/orders/:orderId/options?quoteId=...&revisionOffset=0`：核对精确订单/Quote、可信业务类型、稳定颜色及原商业依据。旧加工统一版按精确原消费读取为全单一行，不重建批次。报价修订20条分页；只为原CNY行的固定PV提供USD确认候选，CCT包括null优先。查询与写入共用确认解析器，不以当前币种推算历史确认。

候选仅表示有确认来源，不证明产品、可信后继或并发版本可采用；仍须原preview与commands重新完整核验。候选读取不填写用户的产品未变化确认，不生成请求或商业版本。严格拒绝未知/重复参数、非法offset、超长输入，响应最多1MiB。每次查询重新读取实际启用身份及quote.view/order.view/commercial.labor.view，不扩大售价/成本或写权限。

## 原回执及历史

原命令表不变，无schema迁移。recorded回执补充原声明订单和完整命令摘要，客户端必须同时匹配原actor作用域、requestId、orderId、摘要及版本结果；不能只凭一个UUID或HTTP成功清除本地原请求。

历史增加orderId外层绑定、ISO时间、actorUserId。发生时姓名只从精确匹配的不可变USD采用审计读取；无审计快照的no-op/拒绝显示未记录，不取当前姓名伪造历史。同一requestId由不同actor使用是合法的两条历史，不能按UUID全局去重。历史金额仍只按精确旧商业版本读取，旧加工统一版不使用今日价格补造。

## 浏览器边界与恢复

`features/quote-center/server/labor-adoption-client.ts`为浏览器安全的严格白名单协议层。只用同源session、no-store、有限响应读取及owner lease；不导入Node/PG运行时、业务计算、Browser仓储或旧价格。字符串枚举和数字状态不强制转换，原样数组/嵌套数组/错摘要/旧owner响应不能冒充结果。POST不会自动重试；202、网络错误或坏响应继续保留原请求，随后只GET核对。

`zhixu.server.usd-labor.pending.v1.<public-user-id>`只在sessionStorage保存同actor/tab的一条未核实原命令，含Quote上下文、原订单/颜色、版本、目标修订、用户确认/原因、请求UUID与previewHash。不保存结构化金额、CCT/报价响应、密码或token；用户主动输入的原因按原文保存。未来UI调用者须在完整写入并读回后才调用POST；低层client.submit本身不操作sessionStorage，本切片没有页面controller，不冒称调用顺序已做UI验收。不同订单/Quote不能覆盖未决命令；损坏/未来版本/非规范化字节/不可写保留并阻止新发送。只有匹配的终态回执才能显式确认并移除此精确键。

这不是离线业务库、跨标签页/设备备份或自动重发队列；关闭标签页可能丢失本机地址，Server命令和历史仍保留。没有localStorage/IndexedDB/Seed、旧namespace、Browser schema或备份迁移变化。现有体验站点未读取或清理。

## 当前状态与界面边界

精确S 60c2a6a2848978af1bb9ebe72184de97f4b14450的41项受影响检查、811项目、类型/lint/前后端构建及项目Vite浏览器bundle通过，静态终审0P1/P2；[冻结工程](../tasks/completed/2026-10-27-order-usd-labor-interface-engineering.md)保留初次38/36/2、附加构建器误选失败与精确分源。不是新UI交互验收；发布144与最终精确守卫按[验收收口](../tasks/completed/2026-10-27-order-usd-labor-interface-validation.md)和本机final.json分别记录。[阶段记录](../tasks/active/order-usd-labor-interface-2026-10-27.md)。

报价详情“关联订单”三步USD采用页签的具体交互确认仍pending，不能将已批准后端规则或等待时间冒称V2界面批准。因此本切片无DOM、CSS、导航入口或新UI像素/人工接受声明。后续界面和Server关账/税率更正继续独立推进。

最后核实main `869ee84dd0b31de6161011e4aa560678b244a64d`，本轮未fetch；前置Gate8C最终`46d29a8fae7252d0e2a909ed269b968faef9ebd1`。无真实Source、现有业务库/账号操作、合并、正式部署、持续调度或旧路径退役。Git远端STOP仍UNRESOLVED，新分支/SHA不解除；本地工程与远端交付分别记录。
