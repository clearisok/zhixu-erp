# 恢复点：独立 Git 交付预检工具 PR #127

2026-10-20；main996dfedc12da3527343cd3ff2aa5eea35497e10e，分支codex/git-delivery-preflight-fallback。5a9a2c7e7bd7a73f2e55c77dd697d5a5938d3a3b已一次安全上传/API精确核实；source39375799649与baseline39375799568成功，team39375799693在登录浏览器深链跳转时CDP上下文失效。仅适配只读等待的三个精确瞬态错误，原150轮/错误抛出/权限断言不变、不重放mutation。全新Server构建/合成库与Chromium10/10通过；语法/lint/精确守卫/只读review后提交交付，再核最终三CI，不冒称全绿。

工具53、基线94及来源权限9/9此前通过，相关代码/测试blob未变化。旧数字120误报的确定性复现、旧CI失败与原SHA保留于[工具任务](tasks/active/git-delivery-preflight-fallback-2026-10-20.md)。仅工具与CI兼容测试，无应用、权限、SQL、价格或UI变化。Git纯传输异常可一次固定GitHub API预检，证书/认证/分歧仍STOP、正常push有界且独立postflight，不称网络永久修复。

7bf3独立Gate4不覆盖；导航16f8d57daf900802a2f3b6c3c41d878dbd6cdd9f已精确送达，source39374706787、team39374709996、baseline39374712862全部成功。持续授权覆盖安全Git恢复，不再逐次询问；不合并/关闭PR、不正式部署、不改真实账号/业务库/来源或共享TLS配置，保留既有运行环境。
