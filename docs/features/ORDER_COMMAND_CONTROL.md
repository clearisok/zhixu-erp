# 正式订单新命令暂停与兼容回退

核实2026-10-15；GitHub API main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。本地feat/order-effective-attribution，阶段起点6f181d3bc5af0271c1a0949b2be0ef3a1713bbd6。GitHub是实时事实源；本文随schema、命令入口、运行配置、回退演练或main变化更新。仅合成/一次性验收，未真实激活。

## 已批准边界

用户D121计划要求回退先关闭新创建/价格采用，保留所有已产生身份和版本，不能假设旧镜像直接适用新schema。落实该要求，不更改订单两条创建路径、报价语义、权限、汇率或UI。暂停不是全库只读，不替代真实备份恢复或归一案件授权。

## 当前实现

0021创建单行sales_order_command_control及不可变版本事件。默认enabled保持既有受权命令行为；frozen暂停新Server SO、订单商业版本/当前头、归一/纠正账本/当前头，以及旧订单CCT关联或金额写入。无HTTP控制写接口；DB操作者改变模式须准确version+1、不同模式与原因，事件记录current_user，原子提交。直接伪造事件、编辑/删除历史或删除控制行拒绝。

写入触发器FOR SHARE锁控制行至事务结束。暂停的UPDATE等待已有新命令事务完成；不能把等待当即时中断或假称已暂停。暂停提交后新命令拒绝；旧RR快照不能读过期enabled行放行。控制更新不反向取得归属advisory锁，避免行锁/归属锁反转。既有0020有效owner保护继续独立生效。

ZHIXU_ORDER_COMMAND_MODE严格接受enabled/frozen，默认enabled。这是单个当前Server进程的限制，不能解除数据库frozen，也不能代替全实例暂停。server/index传入配置并在监听日志标记；未修改任何真实环境变量。API新加工消费、价格采用和归一执行均预检，事务内SQL再次兜底；并发后才暂停的加工批次仍逐项返回明确order_commands_frozen，不制造孤立SO。

GET /api/v1/order-command-state仅可信身份+fresh order.view读取，无查询选择器、金额、DB账号、理由或密码；返回合成后的mode、runtimeMode、databaseMode/databaseVersion。状态不可用时新HTTP命令503，不能默认开启。客户端body/header不能改变配置；readonly预览、旧身份与价格、归一回执仍可读取。

## 继续允许的工作

当前暂停仅针对正式Server新创建/采用/归一。报价准备、加工批次登记/确认/取消、认领/血统及已有效SO的其他既有操作仍按原RBAC/生命周期/归属约束处理。已绑定订单的Source快照刷新继续允许；首次绑定或受控新增需要新SO时拒绝，原事务回滚。已存在绑定/商业采用的内部精确重试可返回原回执，不产生新写入；HTTP POST新命令仍统一关闭，客户端可用已有GET核实历史。

旧订单关联CCT暂停时不能改；没有订单关联的Quote CCT可以继续确认。该控制不覆盖Browser DEV localStorage/IndexedDB、legacy /api/*模型、账号管理或任意外部生产/财务writer，不能宣称全库维护冻结。Source真实范围/调度仍需原授权，模式enabled不授予来源激活。

## 回退实证与限制

order-command-rollback.integration.test.ts从精确main导出到自有临时目录，使用本机锁定依赖编译原Server，运行它原有migration verifier与index。旧bundle缺少0014及之后迁移，在一次性新schema中拒绝启动，退出1；权限/账号/所有业务行逐表不变，没有监听或bootstrap。没有复制新migration目录来绕过旧校验。

镜像SQL是Git LF字节；演练将原Git blob与前向migration组合，不用Windows旧文件CRLF校验差异冒充结构不兼容。兼容的前向bundle可通过只读迁移验证，并在frozen状态保留原身份查询。本测试不是原Docker镜像重建、旧Browser/legacy兼容认证或真实目标恢复演练；回退应选已验证兼容新schema的版本并关闭新命令，不能直接切回未知旧镜像。

## 未来真实暂停的具体授权清单

真实数据库控制更新也属于写入，本轮不执行。操作前需列出目标fingerprint、DB名/端点、实际运行SHA、所有Server/CLI writer、当前mode/version和已验证兼容候选；范围只有该控制行及一条不可变控制事件，不碰业务行。使用带expectedVersion的UPDATE并验证恰好一行，设置有界lock_timeout，等待已有命令提交后复核frozen/version与事件。

响应丢失只读查询当前版本及事件，不换目标盲重试。恢复enabled须新的具体授权/原因/CAS及兼容验收；暂停不自动到期重开。实际重启、流量切换、备份/恢复、宁波及18443/18444操作仍各自需要授权，本文不提供自动执行真实操作脚本。

## 工程验收

18项暂停/实际旧Server回退演练通过；归一执行30、归属45、加工35、Source接纳43PASS/1Windows skip、完整PG/API261均通过。完整类型、lint及Server编译已通过，源码/基线收口结果见阶段任务；没有真实写入、远端CI或人工验收。初次新增测试误把decimal string当number、候选batch.id当batchId及子进程环境类型声明错误已修正；没有改业务输出迎合测试。
