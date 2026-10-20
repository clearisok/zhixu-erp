# 当前恢复点：价格与来源稳定化

基线 main `996dfedc12da3527343cd3ff2aa5eea35497e10e`；分支 `codex/price-source-stabilization`。用户仅批准两项修复、文档校准和新本机合成体验，测试/CI/复审/PR交付；不自动合并、正式部署或真实数据操作。

先读[任务证据](tasks/active/price-source-stabilization-2026-10-19.md)、CURRENT_STATE 和实际 git status。工程61e35af、冻结证据5052439：两缺陷修复前失败已复现，HTTP/服务保护与无副作用回归通过，898项目+94基线+34数据库+6 Chromium及类型/lint/构建通过。首轮冻结文档漂移已用前向证据修正，稳定重跑通过。只使用交付后精确 PR HEAD 的 CI；PR状态以远端实时结果为准。

隔离验收运行源码5052439，入口127.0.0.1:59069，PID43468/容器zhixu-pg-it-db35c84363de；精确回执与合成账号见任务记录。保留原始历史和旧环境，只操作自己新建的临时 PG；不读取真实凭据、既有 DB 或 Browser 缓存。留给用户的来源维护订单和待消费加工批次未操作。旧接力棒[逐字归档](tasks/completed/2026-10-19-pre-stabilization/AI_HANDOFF.md)。
