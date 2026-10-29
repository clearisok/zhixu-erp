# 成衣完整首页兼容契约

2026-10-29；补充既有 D152/D153/D159 成衣观察、目标及操作者契约，不增加真实请求、调度、绑定、发布或部署许可。比较基线 main `e11b3c3cbd1dcf751b6fa5cb16e9323fdc67ac9e`。

## 适用范围

保留的同合同 6086979 正向报表确实返回 `pageIndex=0,pageSize=0`，总数及返回行均为16。原正式 Python/Node 采集仅接受1/100，纯过滤证明却允许零哨兵，两者不兼容。最新一次失败的原文未保留，不能断言其确实为0/0，也不能把旧证明冒充新采集。

只在原 server-only、单合同、已通过独立 C1/C0/C1 过滤核验的有界收集器中增加 v2 路径：

- 实际请求仍固定6086979、精确 `ExpContractNo is`、`[内层]`、第一页100行。原1登录、2报表、3HTTP、180秒、每报表4MiB/累计8MiB及失败停止、不重试不变。
- transport成功执行后保存实际请求体的独立副本与报表序号；capture.v2只接受这份证据。Python按精确类型/结构比较期望请求，Node独立重建并核对，不信任worker预先投影的rows或paging。
- 只接受原响应1/100或成对0/0；混合值、第二页、缺失/非法元数据都拒绝。两种形态均须总数一致、完整返回且≤100行；不能用零哨兵解释任何后续分页。
- page.v2保存原始响应分页、实际请求体SHA256和序号；原文SHA保持不变。两遍各序号1/2、相同合同/来源、完整行集合与内容、时序/时效/行身份校验全部保留。不同schema不可混用。
- v1历史capture/page继续原严格分页，原snapshot/capture/observation ID不变。历史JSON存储仍用既有input.v1容器，不迁移、不回填、不伪造旧证据。恢复按原捕获时点核验，不重新赋予新鲜度。

## 读取与字段

公开capture trace可选包含封闭的pagingEvidence；客户端独立核验形状、序号、成对分页及完整首页范围。它只做响应形状检查，不冒称证明上游真正执行过滤。旧trace没有该字段仍可读；原颜色、Num/outdate、未知/空/负数量和冻结边界不变。

保留的真实报表还含 `createTime`。仅将这个已观察到的键加入私密源行白名单，保留其内容hash；不加入公开字段，不借作outdate、生产完成或关账日期，其他未知键继续拒绝。客户、金额和备注未新增到公开DTO。

代码：`garment_collection.py`、`garment_shipment_observations.py`、`garment-collection-worker.ts`、`garment-first-page.ts`、`garment-shipment-observations.ts`及既有前端client/model。没有新API、SQL迁移或第二套collector。

## 证据边界

原历史报表离线回放只用作字节/字段兼容夹具；为夹具构造的期望请求声明明确不是一次新执行证明。未访问Source或业务库、未发布旧数据。实际重新采集必须在修复交付并获具体新范围授权后进行；不得重用失败请求、延长旧期限或借新UUID自动重试。

本轮工程、复审及原真实窗口结果见[修复与发布状态](../tasks/completed/2026-10-29-garment-first-page-compatibility.md)。
