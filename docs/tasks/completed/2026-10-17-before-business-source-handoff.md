# 当前恢复点：两合同隔离演示执行已完成

核实2026-10-16；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。同一ainuoke-live-readiness树、feat/ainuoke-selected-source-once，开始时clean/HEAD `0dfd51e798768530d1e6134e6019f57b39645197`、唯一依赖草稿PR116；不重建工作树、不重复PR、不自动合并。原接力逐字归档 [执行前 AI_HANDOFF](tasks/completed/2026-10-16-before-selected-demo-execution-ai_handoff.md)。先读CURRENT_STATE、[执行报告](tasks/completed/2026-10-16-selected-demo-execution.md)、[冻结证据](tasks/completed/evidence/2026-10-16-selected-demo-execution.json)，不要沿用旧“0真实操作/尚未授权”结论。

用户已具体批准全新两合同空库演示及一次额外首绑补读。业务源码71b291762467c1efd19873438fef2abfd2954d23，镜像8f4c0e5272394db15933a2a0c00c0e44933b4b5e42dbcfca8c92a59217aaacfc，build selected-source-20261016-71b29176；不是main构建。新实例zhixu-selected-demo-20261016-r2的2 SO、7合成账号、2物料快照、2财务快照已落地。7角色API读回、订单/颜色/事件/财务DOM及过期后物料历史通过；当前时效仍10分钟。真实业务内容/凭据不得进入Git。

本机私有操作目录为outputs/isolated-private-3a6aefbe-bcf9-4bbe-92a7-d3bd226a7cfe（protected、Gitignored）。先读其r2-sealed-resources.json、app-manifest.json、snapshot-statistics.json和既有receipt；不要直接运行run-r2的source/initialize/prepare或finance操作。操作PG旧ID已由封口替换，当前PG无host端口，原62317不可再用；同一新volume完整保留。app仅127.0.0.1:62316，只读、无来源凭据/worker/scheduler，2026-10-16T10:08:03.203Z到期自动停止，不自动续。当前时间或服务状态变化须只读重核，文档不是持续监控。

原bindings回执unresolved、计数未知；补读bindings-recovery-1、materials、payments均completed，额度全用完。不重读、不换request ID、不扩合同、不续四单窗口。原报告包装深度缺陷经合成红/绿验证后用合法原envelope解决；本机网络/迁移换行问题只改新实例只读挂载，无SQL/迁移台账/共享网络修改。只读API/离线副本可继续核对；离线HTML未在应用内浏览器渲染（file协议被拦截），不可用绕过方式预览。

运行演示不等于业务人工验收。财务12/9行在过期前已展示；ERP财务历史读取尚缺，离线阅读副本含本次来源事实且明确历史非实时。建议下一独立PR解决财务历史阅读；不抬高当前Source maxAge，不把旧快照当当前库存/银行实付。S2仍9项来源单位为空，四流未知量和财务单位/币种不作全局补值。未动真实账号/现有业务库/宁波/18443/18444，旧四单容器保持停止。

本Phase只新增脱敏执行文档，生产代码、UI、SQL未改。最终新文档commit/远端/CI必须分别核实；原0df三CI绿的证据不能冒称新提交已绿。GitHub是实时事实源，更新时保留本文件及原证据历史。
