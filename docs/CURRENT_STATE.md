# 当前状态

核实：2026-10-13；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（PR107 已合并）。GitHub/实际代码为实时事实源；本文件随 main、PR、真实回执、环境和验收更新。旧日期/hash/结果/限制原文已[归档](tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)。

- **已合并工程**：#97 六角色可信 session/RBAC，#99–100 固定采集快照/首次完整订单绑定/调度与原P6接线，#101 正式登录，#102–105 无DB只读探测/审计/定向诊断，#106 QtyUnit 逐需求单位，#107 显式 1–25 新合同的受控接纳。#107 精确 head `31b5f28862d032fc954b3f831888005f14060a1c` 三项 CI 成功，Linux Source 44/44；合并不是部署。
- **用户决定**：D105 艾诺科四流持续展示后才上线宁波；暂不独立库存。已授权来源含采购价对首批六角色可见，织序金额按D103/D104。D109 原HTTP风险永久接受；D111 三行物料身份和 QtyUnit 适用于需求及四流已由用户确认。现有UI保持，真实账号由管理员以后创建。
- **真实证据**：历史两遍558个当前账号可见合同完整稳定；80合同物料抽样四流各有代表，62合同数量至少一项未知；未知保留null。三需求/四来源行单位见“个”，118/356/6对照已确认，356仍是一采购事件。不证明当前合同数固定、全公司权限、全量单位质量或所有未知原因。[来源证据](tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)、[单位确认](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-confirmed-2026-10-13.md)。
- **当前工程任务**：`feat/ainuoke-live-demo-readiness` 从上述精确 main 干净工作树开始；全量无数据库预检及只输出计划的本机隔离目标，复用 collector / 正式 mapper / Material Projection。两个 worker 各600秒及现有分页/行数/32MiB/时效限制；真实运行尚未执行。合成22项定向回归、root817/817、基线71/71、Python69/69、Source20PASS/1skip、持续43PASS/1skip及typecheck/lint/Server/UI build通过；最终远端交付与精确PR CI待核实。[本机复审](tasks/active/evidence/ainuoke-live-demo-readiness/final-local-review.md)。[任务与操作边界](tasks/active/ainuoke-live-demo-readiness.md)。
- **未激活/未部署**：没有真实订单首绑、持续写入、真实账号改动或 Ningbo/18443/18444部署。Source/orderRead默认关闭，生产/关账Server路由未开放。旧环境不是最新能力证据；宁波旧预检仍按原日期阅读。
- **剩余缺口**：完整颜色及全量物料耗时/容量、全量单位/未知数量分类；明确新隔离本机目标及执行授权；首次持久快照与连续刷新、人工业务核对。已有订单主信息/颜色不自动刷新、完整分码UI未接；调度只刷新已绑定四流，不自动接纳新合同。快照无自动清理、外部告警/systemd尚未安装。
- **下一步（AI建议）**：工程/CI通过后用户私密运行全量预检；准备并明确授权独立本机账本首绑及持续展示。连续2–3轮刷新、3–5个代表订单人工核对后做首轮真实数据演示。Excel先填品牌/业务员/制作方案/报价设置和少量报价即可，不要求全19Sheet；24小时、故障/重启、六角色签收及备份恢复留作宁波晋升前Gate。历史Quote扩展UI失败未在本轮解决，不宣称全项目全绿。

恢复入口：[PROJECT_INDEX](PROJECT_INDEX.md)、[Server Source](features/AINUOKE_SERVER_SOURCE.md)、[宁波方案](ops/ningbo-rollout-plan.md)、Active D105–113。
