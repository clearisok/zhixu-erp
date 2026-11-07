# 当前入口：本机只读演示直接进入及617单自动同步

先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[演示入口及自动执行验收](tasks/active/local-ainuoke-automatic-2026-11-07.md)。会话入口见[Server登录](features/SERVER_LOGIN.md)及D189；需求与流水口径见[D187/D188](DECISION_LOG.md)、[物料模块](features/AINUOKE_IT_MATERIAL_SOURCE.md)及[Server来源](features/AINUOKE_SERVER_SOURCE.md)。本机显式启用只读自动会话、自动目录建单与分档执行，其他环境默认不变。

已知核实main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea，本轮未刷新远端。入口任务分支feat/local-demo-auto-session；固定运行版本以CURRENT_STATE及私密runtime为准。工程、真实自动采集、远端CI和staging部署分别记录。

[617首次接入及业务验收](tasks/active/ainuoke-final-supply-rules-2026-11-07.md)；[上阶段状态](tasks/completed/2026-11-07-before-local-automatic/CURRENT_STATE.md)；[登录诊断](features/AINUOKE_LOGIN_DIAGNOSTICS.md)。仅本机，原数据库和所有旧资产保留，不部署staging。
