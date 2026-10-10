# 合成正式组件验收证据（2026-10-11）

Actual ServerOrderCenterPage → ServerSalesOrderDetailPage executionOnly → shared Control Tower read display. 私有 Chromium + 动态 loopback API + disposable PG16；synthetic users/orders/Source only。7/7、43 assertions PASS；不是生产开放或真实艾诺科同步。详细范围：[任务报告](../../order-material-night-integration.md)。

| 宽度 | 订单详情 | 物料及展开事件 |
| --- | --- | --- |
| 1440 | [截图](order-1440.png) | [截图](material-1440.png) |
| 1280 | [截图](order-1280.png) | [截图](material-1280.png) |
| 390 | [截图](order-390.png) | [截图](material-390.png) |

横向表格在卡片内滚动，document width不溢出。合同身份窄屏可见，采购单价/金额来自 Source，不推算或换汇；单位未确认，不混加物料数量。商业字段安全Gate与真实账号/团队范围配置PENDING。
