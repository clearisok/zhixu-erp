# 恢复点：#127 的事实回执与安全决策分离

2026-10-23；root唯一writer。当前branch codex/git-delivery-preflight-fallback，干净输入e2dc2704ba51da18e7d0b1c098a7a1657f59a40e，main完整e06162c70c9792895c30030216dc8c2a66368069。用户站立授权安全工程/单次Git恢复/PR与CI，不自动merge或部署。旧三摘要逐Git字节归档，先读CURRENT_STATE、[本阶段任务](tasks/active/pr127-main-forward-2026-10-23.md)及实际status。

当前改动只有git-delivery.mjs回执事实、4项相关期待及文档。deliveryState原blob保持e2；认证/TLS/分歧STOP、continueLocal=false、pushCategory和CLI非零不变。after.verified且sha精确等于target时remoteStatus为EXACT_HEAD_VERIFIED，且不给冗余recovery；不创建collision白名单，不重写旧结果或推断全局网络恢复。

新4项隔离Git先红后绿；首轮脚本因CRLF锚点失败，写码前停止，已单独记录。源码checkpoint dff2854f69e96f5ce39cd88785663c935e92b246已完整56/56工具、134/134发布、语法lint和精确e061门禁通过，零失败/取消/跳过；独立静态review无P1/P2。下一步最终文档commit及再次精确门禁；原#127原e2三CI全绿不能替代新提交结果。每个最终可靠目标一次既有工具交付，核实完整remoteSHA后更新唯一#127和新CI。未知dirty/身份/分歧停止相关动作，不force/reset/clean。

原7af应用构建/9API/10Chromium属于旧相同应用源码，本工具事实修正不重称新运行体验；213证据/46能力与全部冻结blob不变。7bf3的PR120+独立PR128 CI上下文工具由同一主控另行整合，不混入本切片。所有用户环境/账号/卷/Browser数据保护，不新读Source、绑定、激活、调度或部署。目标尚未完成，待决范围保持。
