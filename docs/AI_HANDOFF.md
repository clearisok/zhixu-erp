# 当前恢复点：价格与来源稳定化

基线 main `996dfedc12da3527343cd3ff2aa5eea35497e10e`；分支 `codex/price-source-stabilization`。用户仅批准两项修复、文档校准和新本机合成体验，测试/CI/复审/PR交付；不自动合并、正式部署或真实数据操作。

先读[任务证据](tasks/active/price-source-stabilization-2026-10-19.md)、CURRENT_STATE 和实际 git status。两个缺陷的修复前失败已复现，后端和浏览器回归已跑；新 HTTP 覆盖及完整质量门禁、冻结文档绑定、精确源码隔离体验与新 PR CI 按任务记录收口，不沿用旧 CI 冒称新通过。

保留原始历史和旧环境。新演示只用自己的临时 PG 容器；不读取凭据、既有 DB 或 Browser 缓存。旧接力棒[逐字归档](tasks/completed/2026-10-19-pre-stabilization/AI_HANDOFF.md)。
