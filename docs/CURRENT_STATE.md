# 当前状态：独立 Git 预检修复与 CI 兼容收口

2026-10-20；main996dfedc12da3527343cd3ff2aa5eea35497e10e，codex/git-delivery-preflight-fallback，从main干净建立。唯一草稿[#127](https://github.com/clearisok/zhixu-erp/pull/127)；未合并。工具增强保持固定仓库、可信身份、祖先关系、本地状态、单次push与独立核实，传输失败可有界API预检；证书/认证/分歧不降级绕过。间歇TLS根因仍未完全确定，无持久配置修改。

5a9a2c7e7bd7a73f2e55c77dd697d5a5938d3a3b精确远端已核，source39375799649和baseline39375799568成功；team39375799693登录浏览器在跳转中读取旧CDP上下文失败。仅修测试只读等待，不重试点击/登录或吞应用错误；新Server构建与实际Chromium10/10通过。最终提交、交付、三新CI及复审仍须独立核实。[任务](tasks/active/git-delivery-preflight-fallback-2026-10-20.md)保留原e621/5a9失败、数字120误报复现及全部限制。

工具53/53、94/94基线、9/9来源权限投影、类型/Node/lint及原复审通过；本次不改这些blob或应用/权限/SQL/UI。根7bf3导航16f8d57d已三项精确CI成功，Gate4只读订单链在其独立分支开始；不混写共享摘要。不合并、正式部署、真实数据/来源操作或资产退役。用户长期授权只覆盖批准工程内有界恢复和CI，不降低核实或TLS安全。
