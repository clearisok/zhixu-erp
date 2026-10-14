2026-10-14 / D-116 后续：用户确认两笔重复采购均真实有效；只排除颜色及所有数量均空的占位，具名未知保留。既有六合同离线重放3份恢复usable、3份共9条具名未知仍invalid；未知不填0，单位别名未确认。见[治理更新](tasks/active/source-anomaly-followup-2026-10-14.md)。本阶段起点7b02cbd clean，main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5未刷新。两分支用户交付均pushes=0，REMOTE PENDING；只推进本地工程，真实Source未激活。

2026-10-14 / GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`：PR108 head `8b89de59dd405395da1dde4b6dde5f125141deb9` 开放未合并。本轮独立分支只读追查单位/颜色/负数量/空物料；具体原因与真实演示阻塞见 [异常治理](tasks/active/source-anomaly-followup-2026-10-14.md)。旧摘要均为历史时点，真实 Source 未激活。

# AI handoff

2026-10-13 / 最新接力：用户授权合并 PR #106，GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`。独立工作树 `ainuoke-controlled-new-contracts`、分支 `feat/ainuoke-controlled-contract-intake` 从该精确提交开始，D-112 工程与本机验证已完成：root 817/817、发布基线 71/71、Python 25/25、持续来源 43 PASS / 1 Windows 跳过、typecheck/lint/Server/UI build 通过。精确重试现校验已存 Contract/Color Mirror，避免只凭审计收据误通过。只添加显式新合同，旧订单主信息/颜色不自动刷新；真实来源、业务 DB、宁波/18443/18444 均未操作。交付与合并前复审须以该分支唯一 PR 的精确远端 SHA 和 CI 结果核实，尤其 Linux CLI 全流程；本任务不自动合并。[任务](tasks/active/ainuoke-controlled-new-contracts.md)。下文为历史接力。


核实：2026-10-13；GitHub main 8b3f3d811d05182ea1a7f3214eae9d530056fa04。此工作树在 feat/ainuoke-targeted-diagnostics，草稿 PR #105 以开放 PR #104 head b43b78bee72a496219bd4872245ad28109f421c4 为 base。开始前重新核对 PR/head、git status 和当前代码；不要把聊天记录当事实源。

本轮范围只有定向只读诊断：一遍 6086103 精确销售合同号查当前 InsideOrderNo，最多三个指定合同完整 6087050。用户在普通 PowerShell 隐藏输入凭据，2026-10-13 回传成功。助手核对本机受限、Git 忽略的报告和仅三行的截图对照表；公开脱敏结果见 [真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)，执行边界见 [任务](tasks/active/ainuoke-targeted-diagnostic.md)。不要提交 outputs/ 的合同号、来源身份、物料或凭据。

目标三行 118/356/6 均找到对应名称、颜色、规格、采购单号、日期；356 两来源行归并同一采购事件，不能相加为 712。物料编码仅在私有 API 报告，截图未显示，仍待上游界面核对。三行无可信 API 单位，截图“个”不自动成为正式映射；人工业务确认 0/3，正式单位映射 0/3。62 合同未知数量的总体根因仍未知，投影保持 unknown/null。

后续受保护报告出现QtyUnit候选：目标采购四来源行均为“个”，原三物料身份/数量与归并事件不变，四来源行身份因新字段改变。该报告mtime 2026-10-13T03:24:45.2988793Z，来源语义仍未确认；不能据字段名改正式映射。公开脱敏证据见 [QtyUnit 复核](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。本机后续私有请求已缩至目标单，若无证据缺口无需再要求用户重复读取。
首次普通终端运行在 Set-Acl 因缺 SeSecurityPrivilege 而于登录前失败；修复为只读检查受限 ACL 后真实重试成功。工程修复 head cef2e5653524bb65a80b8f9787e0ab937390d88b 已精确推送，手动 Source CI run 38339696861 全成功。此次真实证据文档提交后仍需按最终 head 复核 CI。PR #104/#105 不自动合并；未改正式计算、UI、真实账号/数据库、Source 激活或部署。

下一步：完成本次脱敏证据提交与最终 CI/PR #105 复审；用户在本机三行表核对物料编码/规格，确认界面“个”的业务含义。若 6087050 没有可信单位字段，另找受授权只读字段来源；只在字段身份与业务语义确认后另开最小映射 PR 和负向测试。真实绑定、持续采集、全量颜色/规模与宁波上线各需独立 Gate。
