# 当前状态

核实：2026-10-13；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（PR107 已合并）。GitHub/实际代码为实时事实源；本文件随 main、PR、真实回执、环境和验收更新。旧日期/hash/结果/限制原文已[归档](tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)。

- **已合并工程**：#97 六角色可信 session/RBAC，#99–100 固定采集快照/首次完整订单绑定/调度与原P6接线，#101 正式登录，#102–105 无DB只读探测/审计/定向诊断，#106 QtyUnit 逐需求单位，#107 显式 1–25 新合同的受控接纳。#107 精确 head `31b5f28862d032fc954b3f831888005f14060a1c` 三项 CI 成功，Linux Source 44/44；合并不是部署。
- **用户决定**：D105 艾诺科四流持续展示后才上线宁波；暂不独立库存。已授权来源含采购价对首批六角色可见，织序金额按D103/D104。D109 原HTTP风险永久接受；D111 三行物料身份和 QtyUnit 适用于需求及四流已由用户确认。现有UI保持，真实账号由管理员以后创建。
- **真实证据**：历史两遍558个当前账号可见合同完整稳定；80合同物料抽样四流各有代表，62合同数量至少一项未知；未知保留null。三需求/四来源行单位见“个”，118/356/6对照已确认，356仍是一采购事件。不证明当前合同数固定、全公司权限、全量单位质量或所有未知原因。[来源证据](tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)、[单位确认](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-confirmed-2026-10-13.md)。
- **全量真实预检已完成**：工具 `4b4a09eac5ada875a452a743715f65e3e69719a1` 无DB完整读取当前账号可见558合同，约8分25秒；私有报告权限/hash已核对。颜色552可用/6无效；物料14,411需求，单位12,655已知/1,750缺失/6冲突。物料阶段约6分55秒/24.2MiB，在600秒/32MiB预算内；不是持续运行保证。四流数量未知仍保留，不将缺单位与未知数量混为因果。[完整脱敏证据](tasks/active/evidence/ainuoke-live-demo-readiness/real-full-preflight-2026-10-13.md)。
- **当前工程交付**：仍为 `feat/ainuoke-live-demo-readiness`；初版三次失败/完整状态误拦截与错误遮蔽已修复，历史证据保留。修复后24项/root817/基线71、类型/增量lint/Server build通过，UI变化0；初版扩展结果保留为历史范围。GitHub分支尚未送达/无PR；网络降级，精确远端CI待核实。[修复复审](tasks/active/evidence/ainuoke-live-demo-readiness/operator-wrapper-final-local-review-2026-10-13.md)，[任务](tasks/active/ainuoke-live-demo-readiness.md)。
- **未激活/未部署**：没有真实订单首绑、持续写入、真实账号改动或 Ningbo/18443/18444部署。Source/orderRead默认关闭，生产/关账Server路由未开放。旧环境不是最新能力证据；宁波旧预检仍按原日期阅读。
- **剩余缺口**：6个颜色无效/6个单位冲突的定向原因、缺单位和未知数量分类；明确新隔离本机目标及执行授权；首次持久快照与连续刷新、人工业务核对。已有订单主信息/颜色不自动刷新、完整分码UI未接；调度只刷新已绑定四流，不自动接纳新合同。capture完成后再等待间隔，不能承诺每5分钟更新。快照无自动清理、外部告警/systemd尚未安装。
- **下一步（AI建议）**：准备实际镜像、端口和新隔离资源归属证据，再明确授权独立本机账本首绑及持续展示。用户已调整执行方式：同范围已授权只读核查由Codex调用既有CredentialFile脚本，密码不进模型上下文，不重复本次全量读取。连续2–3轮刷新、3–5个代表订单核对后首轮真实演示。Excel先填基础配置和少量报价，无需全19Sheet；24小时/故障重启/六角色/备份恢复为宁波晋升建议Gate。历史Quote扩展UI失败未解决，不宣称全项目全绿。

恢复入口：[PROJECT_INDEX](PROJECT_INDEX.md)、[Server Source](features/AINUOKE_SERVER_SOURCE.md)、[宁波方案](ops/ningbo-rollout-plan.md)、Active D105–113。
