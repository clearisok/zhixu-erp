# 当前入口：真实物料流水与款式物料跟进界面升级

先读[当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[物料业务展示任务及具体UI批准](tasks/active/material-business-view-2026-11-07.md)。D190区分真实流水与可比较需求差额；D187/D188自购/厂供业务规则保持。会话及持续同步见[演示入口及自动执行验收](tasks/active/local-ainuoke-automatic-2026-11-07.md)、[Server登录](features/SERVER_LOGIN.md)及D189；源字段见[物料模块](features/AINUOKE_IT_MATERIAL_SOURCE.md)及[Server来源](features/AINUOKE_SERVER_SOURCE.md)。

已知核实main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea，本轮未刷新远端。当前分支feat/material-followup-business-view；固定运行版本以CURRENT_STATE及私密runtime为准。工程、真实自动采集、远端CI和staging部署分别记录。

[617首次接入及业务验收](tasks/active/ainuoke-final-supply-rules-2026-11-07.md)；[上阶段状态](tasks/completed/2026-11-07-before-local-automatic/CURRENT_STATE.md)；[登录诊断](features/AINUOKE_LOGIN_DIAGNOSTICS.md)。仅本机，原数据库和所有旧资产保留，不部署staging。
