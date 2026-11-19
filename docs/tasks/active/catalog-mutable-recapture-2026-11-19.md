# 6086103 mutable field recovery — Issue157

2026-11-19，用户明确批准代码、隔离测试和PR；不得合并、部署或解除真实Staging暂停。Refs [Issue157](https://github.com/clearisok/zhixu-erp/issues/157)。基线main `1ab40fd39b035e471f5557903c026dd36d3bab8e`，分支`fix/catalog-mutable-recapture`，起始工作树clean，未改其他工作。远端fetch已核实；开放PR136是独立Git工具任务。

历史事实：11:02:45北京时间，batch `cc1cacad-0de3-46f6-807a-3778b9d586dc`，630行/13页，两遍added/removed/identityChanges均0、scopeChanged=false、changedFields=[Price]。失败原行没有持久化，不能恢复具体合同、价格、存在性或类型变化。旧比较器同schema Price值差走non-identity分支；Price出现/消失走identity/scope分支。不能据此断言历史一定是字段缺失。

实施契约：身份id/BillNo来自映射与数据库绑定唯一约束；InsideOrderNo原保护不放宽。七个已有可变字段加Price允许重采；仅既有hsid大小写变体保留窄例外，未知字段和结构严格阻断。Price仅分类，不回写、舍入、换算或用作Quote商业价。

重采复用持久任务1/5分钟退避、最多3次总采集（初次+两次重采）。定向页读取只作诊断，随后重新执行完整before/details/after；绝不拼旧页或直接接受最后一次读数。原每次56/80报表、4000行、180秒预算不扩大；额外定向页计入预算，预算不足失败关闭。第三次仍不稳定返回mutable_field_unstable，保留旧成功，阻断共享目录依赖。当前自动合同任务全部需要新完整6086103；独立合同只有自己的新完整采集通过才能继续，不能绕开目录用旧数据。

0059只新增append-only诊断表，保存逐字段存在性/类型/原值/哈希/合同/前后页、源采集时刻、真实请求时间（不可获取为null）、重试与决定；定向页保留安全业务投影和全行/响应哈希。未知字段/姓名原值不记录；价格与合同可定位，仅现有受控DB运维权限，无公开新API。失败主回执保留diagnosticsPersisted，写诊断失败不替换主错误且阻止自动再采。

Gate1：分类、真实SDK定向读协议、现有队列/目录接线；30/30定向测试、根typecheck、server build通过。尚须隔离PostgreSQL完整状态流转、全部回归、lint/build/基线、远端交付及PR。真实Staging未操作，现有暂停/112失败/259到期的历史读证不能冒称当前新采样。

部署后受控恢复设计（本轮不执行）：保留暂停/旧回执；新完整6086103双遍、分页与Price稳定证据；其他报表健康；DB/migration0059/认证/管理员/清理/租约/未知结果检查；通过正式Gate后Supervisor启动及真实新心跳。旧Price聚合错误不足以自动清暂停；需审查后的受控来源恢复操作。到期队列使用现有去重、独占worker lease、批量/并发限制和30分钟策略，不手动造259任务。回滚只回退应用组件并保留0059表与证据，不执行破坏性down migration。
