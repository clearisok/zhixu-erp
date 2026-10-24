# Server当前登记事实的交期覆盖

原2026-10-22技术契约，2026-10-24当前受控前移，D155；承接D043、D151与BUSINESS_RULES的累计交期比较。
这是独立的后台只读契约，不覆盖已冻结的生产执行阶段文档。
实际源码、验收和交付见[阶段任务](../tasks/active/server-delivery-coverage-current-2026-10-24.md)。

既有GET `/api/v1/production-scheduling/orders/:id`追加`deliveryCoverage`，原字段不变。
同一次READ ONLY REPEATABLE READ内读取有效DeliveryPlan、原物理SO排单及一次执行映射，
继续要求fresh `order.view + schedule.view`。没有新表、写接口、金额授权或UI；
原客户端可忽略新增字段，此兼容经过真实HTTP验证。

`production-delivery-coverage.v1`明确`basis=current_registered_facts`：

- `completedQuantity`：全部当前登记产出，含已取消排单，保持原执行方/订单归属。
- `outstandingPlannedQuantity`：未取消且执行未结束任务的正剩余量，复用D151数量投影。
- `checkpoints`：按日期排序、同日合并，保留全部`planIds`；分别给出当日及累计需求、
  截点前预计剩余、当前登记产出加预计剩余的可比较供给、非负缺口。供给只累计一次。
- `undatedPlans`：未知日期需求保留ID与数量；`assessment`为assessed、partially_assessed
  或unassessed。没有有效日期为未评估，不以Source日期代替。

本投影不是历史准时率、日生产量、可出库库存、成衣出货或关账。累计产出不按一个实际
结束日期分配到某天，也不扣减6086979观察。超产保持真实数量，缺口最低为零。
Source数量/日期、客户交期和生产执行owner均不修改；原商业版本与金额不读取。
历史alias单独计算；sourceOwner的镜像读取不意味着将其排单、交期或产出搬到有效根订单。

继续完整读取至500条排单/1000条有效交期；超界或整个详情超过1MiB明确422，不截断。
数量采用精确十进制字符串/BigInt，沿既有十进制表示边界拒绝超量，不转JS number。
生产planVersion只代表生产集合，不能作为独立DeliveryPlan集合的并发令牌。

本阶段不加入Browser的七天预警或任意晚排单启发式，不新增风险页面。真实来源、
部署、人工接受和完整生产/出货/关账闭环分别验收，不能由本后台工程提升状态。

## 当前范围和后置验收

原144f→0e546四核心路径输入与当前相同，package/workflow只追加本轮测试；原生产执行6184契约和PG容量/客户端中文提示保持冻结。483be后续客户端接收coverage的断言依赖另一个UI/client切片，不带入此阶段，当前兼容测试仍证明旧客户端忽略新增字段。新source实际验收后另冻结，不借原ff8b结果。无schema/前端/Python变化，不重复构建、截图/浏览器或未变811；发布134仅按工具/fixture范围复用，动态文档清单已变不称新134 PASS，最终累计PR两发布命令仍须重跑。
