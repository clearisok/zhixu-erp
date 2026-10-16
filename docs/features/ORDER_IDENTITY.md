2026-10-17 当前规则以 [订单业务来源](ORDER_BUSINESS_SOURCE.md) / D-144 为准：取消负责人、认领、合同前准备及公开归一操作；旧记录保留。合同后维护来自报价或来自翻单，加工独立入口保持。以下旧日期内容为历史实现与证据。

# 订单身份与业务血统

2026-10-15当前：本地Gate4继承G1–G3，另有D129/0023准备关联与D130会话级原请求恢复。准备创建可带精确拟用报价上下文，合同后采用只补血统/关联、不创建SO或自动采用价格；加工身份由真实批次消费证明。原请求按用户/订单隔离保存，支持刷新后恢复、单独查回执及稍后核对，页面离开保护仍在。真实业务库/部署未操作。下方G1段落是当时历史，不覆盖本段及[准备采用](ORDER_PREPARATION_ADOPTION.md)的当前边界。最新依赖合入及验收见[本轮证据](../tasks/active/evidence/order-normalization/gate4-g3-preparation-retry-2026-10-15.md)。

2026-10-14 / main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5。D-121规则已批准，工程候选未部署。完整规则见[订单身份计划](../tasks/active/order-identity-program.md)。

0014新增sales_order_identity_profiles、sales_order_preparations，不回填旧订单或授权真实账号。可信合同类型由不可变creation_source和精确来源link/mirror证明，历史无法确认记录unclassified。加工类型为Gate3预留，未开放创建。原SO及交付计划保持。

GET/PATCH /api/v1/sales-orders/:uuid/identity：读取、认领、管理员转交（原因必填）、首单/翻单血统CAS。合同唯一约束保留；相同来源ID合同号变化、相同合同号来源ID变化均显式冲突。并发认领、事务审计失败、权限即时撤回、全局血统锁和循环检测有合成验证。首次profile从虚拟0经插入1到修改2，调用方只用返回version。

GET /api/v1/order-claimants：仅order.transfer可读公共ID/名称，目标须active且有order.view/order.claim。实际转交再次事务内复查。普通跟单无管理员转交权限。

POST /api/v1/order-preparations：精确字段requestId/referenceOrderId/quantity/deliveryDate/specificationChanges；actor/request幂等、payload冲突拒绝。GET要求referenceOrderId，可offset分页每页20；仅order.preparation.create可读。准备记录append-only，不创建SO、不分配SO号、不产生执行任务。页面不确定保存保留请求ID和原payload重试。报价版本候选/商业采用随Gate2，不冒称本Gate已建立关联。

现有列表原来源列补充待认领；详情复用Foundation新增认领/转交/血统/准备入口。身份不改变订单生命周期。新内部排产执行Gate尚不存在于Server，不能宣称已实现完整排产限制。本分支Gate2新增订单商业版本API：旧订单CCT读取只适配已采用快照、旧写入拒绝；报价侧CCT仍为确认来源。采用UI已隔离验证；完整回归及发布证据尚未收口，详见[订单商业版本](ORDER_COMMERCIAL_VERSIONS.md)，不得宣称Gate2发布完成。

验证：15项领域/HTTP/升级/约束测试；原六角色+跟单经理22项；首次绑定/受控新增19项；Chromium5项合成交互通过（最终样式重验通过）。此前UI测试失败为异步等待条件不正确，已按保存完成/弹窗出现等待；升级断言由版本号改为runner实际文件名返回。所有DB来自测试工具随机tmpfs容器，无真实Source/凭据使用。

新增脚本test:order-identity、test:order-identity-ui接入既有Source CI。运行时schema验证仍阻止未迁移数据库启动；迁移后旧镜像回退未获兼容承诺。历史商业冻结/归一另行Gate且真实执行另行授权。

更新时机：规则、API/schema、测试结果或发布状态变化时；GitHub精确commit/PR证据与本地工程分开记录。

完整结果与限制见[Gate1证据](../tasks/active/evidence/order-identity/gate1-results.md)。


2026-10-15后续后台：合同后采用准备/拟报价上下文已按D129/0023补齐，原创建历史/数量/价格/流水不改，手工血统编辑清当前准备引用并保留receipt。identity processing类型现在与列表一样核验合法批次消费及来源三ID，无证实标签为unclassified，不自动分类或回填。新API/权限/迁移/验收与UI剩余见[准备采用](ORDER_PREPARATION_ADOPTION.md)。上述G1阶段边界/日期证据不当作当前完整分支状态。
