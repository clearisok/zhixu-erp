# Issue174 v2 脱敏演练与合成浏览器证据

[测量/测试汇总](measurements.json)包含容量、同负载DML/WAL/耗时、实际恢复/普通角色保护、资源和情景模型；[迁入计数](migration-counts.json)包含145张原表的原始/保留/未迁入数量。这里只保存聚合值和证据SHA，不含业务行、原始响应、筛选UUID、附件对象或凭据。[简明决策报告](../../issue174-v2-phase12-results.md)区分实测、模型和远端未交付。

2026-11-25，`material-history-ui.integration.test.mjs`：9/9通过。桌面1440px及手机390px覆盖原订单历史、上下文、真实起点/此前缺口提示、只读、请求取消和权限撤销。全部为自有临时PG与合成账号；没有访问Staging、共享DEV浏览器数据或艾诺科。

渲染构建源：`26d82759c909112c1af1ca660a8fa7543d171388`。最终代码checkpoint `8dfe2fcf051ca0d22ef33204564ea189c9c8df45` 的两条UI路径仍为同一Git blob：

- `features/order-center/components/material-history-dialog.tsx`：`4ea5bb8cb07fd01b43f8dd30258db3819092887d`。
- `features/order-center/server/material-history-client.ts`：`c34ac39ba06149f15211790e1d7a92837971a684`。

[桌面](history-desktop.png) · [手机](history-mobile.png)。这是V1功能语义的工程验证，不是部署、人工业务接受或新的视觉批准；没有覆盖任何旧截图/冻结ID。精确影响见[UI记录](../../../../release/ui-changes/issue174-source-history-epoch-20261124.json)。
