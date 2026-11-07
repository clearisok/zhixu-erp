# 当前入口：本机617单分档自动同步

先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[自动执行及验收](tasks/active/local-ainuoke-automatic-2026-11-07.md)。需求与流水口径见[D187/D188](DECISION_LOG.md)、[物料模块](features/AINUOKE_IT_MATERIAL_SOURCE.md)及[Server来源](features/AINUOKE_SERVER_SOURCE.md)。本机显式启用自动目录建单与分档执行，其他环境默认不变。

已知核实main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea，本轮未刷新远端。分支feat/local-ainuoke-automatic-sync；固定业务运行版本bb0cc79f1fa12cbb6f1586dc5036633a28a02c1d。工程、真实自动采集、远端CI和staging部署分别记录。

[617首次接入及业务验收](tasks/active/ainuoke-final-supply-rules-2026-11-07.md)；[上阶段状态](tasks/completed/2026-11-07-before-local-automatic/CURRENT_STATE.md)；[登录诊断](features/AINUOKE_LOGIN_DIAGNOSTICS.md)。仅本机，原数据库和所有旧资产保留，不部署staging。
