# 当前：6086103 Price可变字段有界重采候选

2026-11-19，main已核实1ab40fd39b035e471f5557903c026dd36d3bab8e（PR156已按用户确认合并）；本轮fix/catalog-mutable-recapture，Refs [Issue157](https://github.com/clearisok/zhixu-erp/issues/157)。仅获代码、隔离测试和PR授权，不合并、不部署、不解除真实暂停。

Price纳入已确认可变业务字段，保留存在性/类型/原值差异，不舍入/拼页/取任一遍。复用现有1/5分钟退避和总计三次采集；先定向读取异常页，再进行全新完整before/details/after，所有原预算不扩大。三次仍不一致明确mutable_field_unstable并保全旧成功，身份/范围/未知字段/分页/未知结果保护保留。全部合同采集依赖完整6086103，不能拿旧目录无条件继续；独立合同须有自己的新完整证明。

新增0059 append-only差异/定向页/决定；原失败、成功、暂停和业务资料不迁改。历史批次仅剩Price字段名，不能还原具体价格/合同/差异类型。当前旧暂停没有自动解除路径；后续经审查批准部署后，须新完整来源证据、正式Recovery Gate、Supervisor及真实心跳受控恢复。259到期订单沿现有去重/租约/并发限制自然调度。

Gate1 e011406af24f28ce0caf2022123333547297ade5已精确送达远端。基础定向30/30、typecheck/server build通过；新增隔离Docker/PostgreSQL四个完整流转通过（首轮测试时钟先于新采集被正确拒绝，修正测试时间后通过），Python六项定向测试和IPC补充通过。最终完整回归、lint/前后端build/发布基线、精确远端PR交付尚未完成；不宣称最终PASS。

真实Staging本轮未读写或采集；既有来源暂停保持，112失败/259到期为此前读证，不冒称最新实时核实。[任务与受控恢复设计](tasks/active/catalog-mutable-recapture-2026-11-19.md)；[接力](AI_HANDOFF.md)；[此前UI状态](tasks/completed/2026-11-19-before-catalog-recapture/CURRENT_STATE.md)。
