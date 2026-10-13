# AI handoff

核实：2026-10-13；GitHub main 8b3f3d811d05182ea1a7f3214eae9d530056fa04。此工作树在 feat/ainuoke-targeted-diagnostics，草稿 PR #105 以开放 PR #104 head b43b78bee72a496219bd4872245ad28109f421c4 为 base。开始前重新核对 PR/head、git status 和当前代码；不要把聊天记录当事实源。

本轮范围只有定向只读诊断：一遍 6086103 精确销售合同号查当前 InsideOrderNo，最多三个指定合同完整 6087050。用户在普通 PowerShell 隐藏输入凭据，2026-10-13 回传成功。助手核对本机受限、Git 忽略的报告和仅三行的截图对照表；公开脱敏结果见 [真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)，执行边界见 [任务](tasks/active/ainuoke-targeted-diagnostic.md)。不要提交 outputs/ 的合同号、来源身份、物料或凭据。

目标三行 118/356/6 均找到对应名称、颜色、规格、采购单号、日期；356 两来源行归并同一采购事件，不能相加为 712。物料编码仅在私有 API 报告，截图未显示，仍待上游界面核对。三行无可信 API 单位，截图“个”不自动成为正式映射；人工业务确认 0/3，正式单位映射 0/3。62 合同未知数量的总体根因仍未知，投影保持 unknown/null。

首次普通终端运行在 Set-Acl 因缺 SeSecurityPrivilege 而于登录前失败；修复为只读检查受限 ACL 后真实重试成功。工程修复 head cef2e5653524bb65a80b8f9787e0ab937390d88b 已精确推送，手动 Source CI run 38339696861 全成功。此次真实证据文档提交后仍需按最终 head 复核 CI。PR #104/#105 不自动合并；未改正式计算、UI、真实账号/数据库、Source 激活或部署。

下一步：完成本次脱敏证据提交与最终 CI/PR #105 复审；用户在本机三行表核对物料编码/规格，确认界面“个”的业务含义。若 6087050 没有可信单位字段，另找受授权只读字段来源；只在字段身份与业务语义确认后另开最小映射 PR 和负向测试。真实绑定、持续采集、全量颜色/规模与宁波上线各需独立 Gate。
