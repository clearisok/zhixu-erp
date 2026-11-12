# 本机验收：总览从颜色开始

2026-11-12，用户明确要求删除整列，已替代上一轮仅隐藏文字的展示。branch feat/material-followup-dense，产品构建5bef8388d75f2e983c9397976dc6687c35f4f480，buildId local-material-color-first-20261112。仅本机；未推送/PR/CI/部署，不改源站/数据库/数量/同步。

[打开6230-938／PI2610-181](http://127.0.0.1:63054/order-center/style-progress/detail?orderId=aa46192f-23b0-4fd9-9a37-55acc7703783)，已有标签F5。沿用preview.real-orders只读自动进入；hidden PID42352继续运行，原63051/617库及宁波owner保留。

## 实际结构

总览表DOM没有任何data-column=name的表头或单元格，13表头+每条13单元格，首列颜色固定左侧。顺序：颜色、规格、门幅、克重、需求数量、单位、已采购、已入库、待入库、多余仓、物料出运、状态、操作。分组跨列按可见字段动态计算，总览默认11+2=13；状态/操作继续右侧固定。名称完整保留在原demand、分组、行可访问标签、详情及原名称搜索，不删除字段或修改关联。

厂供及四个流水标签继续原结构，不复用删除名称后的主表结构；原业务数量、状态、单位和来源时间不变。颜色在总览列设置中不可隐藏，旧隐藏颜色偏好忽略，未清空旧存储key。隐藏其他列及恢复列继续可用。

## 实机验收

- 8项受影响显示测试通过，包括无名称DOM、精确13列、原身份/分组保留；原数量/单位/零值/来源语义测试继续通过。
- 类型、受影响eslint及Server构建通过。基线检查结果见outputs/material-dense-local/color-first-guard.log，不等同远端发布门禁或人工接受。
- 真实浏览器：分组顺序/单组及全部收放、颜色及物料名称搜索、类型筛选、显示列恢复、密度重载、8抽屉页签、原只读到料、来源核实、其他3张订单通过。
- 六视图仍10自购/3厂供/4采购/2入库/2出运/2出库；真实HTTP progress.rows与改前完全相等，0业务写/0艾诺科请求。
- 1920/1600/1366及等效125%缩放、紧凑/标准、横向初始/最右位置共24组命中检查通过；状态、操作和分组动作可见且未相互覆盖；隐藏状态再恢复通过。
- 1920和1600首屏均10条自购；1366首屏7条。13px正文，1920总览不需要横向滚动，窄窗口仅中间数据滚动，操作始终可用。

[修改前1920](D:/WeaveOps-Local/material-dense-20261111/seven-after-interactive-1920.png)／[修改后1920](D:/WeaveOps-Local/material-dense-20261111/color-first-after-interactive-1920.png)。
[修改后1600](D:/WeaveOps-Local/material-dense-20261111/color-first-after-interactive-1600.png)／[修改后1366](D:/WeaveOps-Local/material-dense-20261111/color-first-pinned-1366.png)。
回执在受保护演示根：color-first-after-interactive-results.json、color-first-pinned-results.json；日志在工作树outputs/material-dense-local。

仅产品Tower/CSS、相应单测及批准/基线/交接文档修改；无后台或业务数据改动。真实来源仍11月11日14:44历史资料，单位及多余仓缺失继续真实显示。等待本机人工反馈，不部署staging。

收口守卫首轮发现新增D193说明尚未前向冻结，以及新交接省略完整main SHA；不改历史证据哈希，新增决策版本记录supersedes旧版本并补齐精确基线后重验。失败日志保留color-first-guard.log。

最终源码/证据守卫在8e3dc2c7ce1b95eeca4d5e3e7a847d2aa1e5c5cd通过：baseline6dc17c64、12页、68能力、3累计UI路径、0错误；首轮文档漂移已通过前向冻结修复，原失败日志保留。无远端CI或部署。
