# AI handoff

## 当前恢复点 — Release baseline guard（2026-10-12）

- 任务起点main：`4adbc30845f99368caa77d3431cc67a6440ac623`；独立worktree `C:/Users/Administrator/.codex/worktrees/release-baseline-guard/zhixu-ainuoke-api`，分支 `chore/release-baseline-guard`，起始clean。
- 用户授权：基线与能力清单、状态对齐、最小阻断检查、测试和唯一PR；禁止UI重设计、生产路由/数据库/18443/18444变更，不自动merge。
- [清单](release/baseline.json) / [检查与更新契约](features/RELEASE_BASELINE_GUARD.md) / [本任务结果与网络证据](tasks/active/release-baseline-guard.md)。
- PR91/92/93/94已MERGED，旧PR92 Draft描述已归档；D103已入main，但两环境最后记录镜像尚未包含。P6/PR91人工PASS是历史范围；真实Order/Material Source和生产路由未激活。
- 本PR只提供source/evidence guard，不是新的浏览器像素、生产发布或人工验收。后续完整UI回归、安全候选与Source接线必须独立任务。
- PR95复审修复从clean `b5411b68618e663d97ca50ac5bb9f49bc688193e`继续，main仍为上述4adbc。v2修复五项缺口并纳入R95-1…8反例；状态事实和PNG不重写。测试/复审/交付状态见任务证据，不能把首轮CI绿灯视为修复后CI结果。
- 修复checkpoint `b111d8cd5dcaac93652656076ec050744c449083`后补齐HTML/路由AST同类遗漏，最终本地807/807（含69专项）PASS。交付预检pushes=0进入NETWORK_DEGRADED；最后独立核实远端仍b5411b6。遵循一条普通PowerShell恢复命令，收到exact SHA后才更新PR交付结论并核验新CI。
- 最终工程/commit/远端PR结果记录于任务证据和GitHub；不循环写入本文件自身SHA。遇NETWORK_DEGRADED遵循AGENTS/PR94工具，不无界重试。

原PR91部署、PR92联合回归/继承dirty、PR94交付的日期/hash/结果/限制完整保留在[前序快照](tasks/completed/2026-10-12-release-baseline-predecessor-state.md)。不将其他worktree的历史dirty套用到本任务，不清理或stage它们。
