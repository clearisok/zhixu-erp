# PR #92 原版界面恢复证据（2026-10-11）

> 2026-10-12 恢复说明：用户已明确确认原 P6/精简详情/只读 Control Tower 人工验收 PASS。下述是修复时的原始证据；其中旧安全待修复状态已由合并 PR93/D103 取代。本轮联合回归见 [新证据](../order-material-pr93-integration/README.md)，原截图未覆盖。

**以下为 2026-10-11 当时人工验收 PENDING 的历史记录。** 全部截图为合成订单、合成 session 用户和临时 PostgreSQL 数据，不是实时艾诺科记录；未访问真实 511 张订单。原夜间截图的自动化结果不能代表用户视觉验收。

## P6 要求逐项对照

当前可读取的附件中没有 P6 图像，以下对照来自用户明确列出的 P6 要求及原 ServerOrderCenterPage/Toolbar/DataTable/CSS；不声称像素一致。

| P6 认可基准 | 修复证据 |
| --- | --- |
| 搜索、查询、生命周期、来源、排序紧凑横排 | 1440/1280 toolbar 为 flex/row，高 65px；所有控件纵向中心相同，修复前为 block/412px |
| 桌面只显示一张订单表格 | 原 DataTable 数量为 1；桌面 responsive-record-list 为 display:none |
| 表格铺满主要内容 | 表格与白色卡片宽度仅差 2px 边框；没有第二套列表 |
| 绿色侧栏、暖灰背景、白色容器 | 复用原正式 CSS 与 AppShell；正式列表组件和列表 CSS 未重写 |
| 390 使用原响应式移动展示 | records 为 grid，桌面表格隐藏；根页面无横向溢出 |
| 511 与 2 张订单的数据差异 | 仅保留 2 张合成订单；未接触真实数据，也未把数量差异当作 UI 问题 |

## 最终截图

| 页面 | 1440 | 1280 | 390 |
| --- | --- | --- | --- |
| 原正式订单列表 | [桌面](list-1440.png) | [桌面](list-1280.png) | [移动](list-390.png) |
| 精简订单详情 | [桌面](order-1440.png) | [桌面](order-1280.png) | [移动](order-390.png) |
| 原 Control Tower 只读分支 | [桌面](material-1440.png) | [桌面](material-1280.png) | [移动](material-390.png) |

附加：[展开技术详情](technical-1440.png)、[移动端底部折叠入口](order-bottom-390.png)、[移动采购来源金额](material-prices-390.png)。[修复前失败截图](before-1440.png) 保留为根因证据。

[修复前 computed styles](before-computed-styles.json) / [最终三页面三宽度 metrics](computed-styles.json)。技术详情关闭时 Chromium 仍可返回内部矩形高度，实际 checkVisibility=false 且正文不含隐藏事实；测试展开后验证 UUID、版本、更新时间，再折叠。不能单凭矩形高度推断是否显示。

## 硬验收与限制

真实私有 Chromium 7/7、115 断言、0 skipped；桌面单表格、移动布局、详情 3/1 列、默认折叠、颜色表两列完整、无标题重叠和页面横向溢出。物料搜索、展开事件、采购来源单价/金额和精确 UUID 返回通过。仅表格内部可横向滚动。

分码不在当前正式 DTO 中，页面明确显示尚未接线；不由颜色数量推算尺码。采购来源价格可见，销售价/工价/Quote 成本/利润不进入 Material DTO。旧 Order/Quote 金额 GET 暴露仍存在，独立权限 Gate 待批准，不能由本轮测试声明生产安全。

浏览器与 HTTP 仅使用本轮随机隔离 PG16、动态 loopback、私有 profile；无 Browser 业务存储写入或真实艾诺科请求，未触及 18443/18444。

## 人工复验（最多五步）

1. 在本任务工作树运行 `npx tsx features/ainuoke-material-progress/integration-preview/demo.ts`，使用其输出的临时地址与合成账号，打开独立浏览器 profile。
2. 以 1440、1280 检查原工具栏横排、只有一张订单表格、绿色侧栏及白色容器；以 390 检查原移动记录且无页面横向溢出。
3. 打开合成订单：检查基本信息、颜色、物料摘要；展开/折叠「来源与技术详情」，确认技术字段默认隐藏。
4. 进入物料跟进，搜索和展开采购/入库/出运/出库事件，移动端在明细表内部滚动查看来源单价/金额，然后返回同一订单。
5. 结束后 Ctrl+C，让驱动清理它拥有的临时环境；反馈人工 UI 验收结果。不要操作真实业务环境。