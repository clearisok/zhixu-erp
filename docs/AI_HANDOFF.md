# 恢复点：独立 release document merge guard

2026-10-20；main `996dfedc12da3527343cd3ff2aa5eea35497e10e`；分支 `codex/release-document-merge-guard` 从该 main 干净建立。只按精确路径提取 b4c47f13 的 guard/test/feature 三文件，不整体 cherry-pick a12825ef；不包含业务累计代码或220项组合清单。main 的213项证据和manifest保持原样。原摘要/接力逐字归档。

当前待独立运行116项基线、语法/lint及精确996守卫，再由唯一reviewer复审、提交本工具最终SHA。不能借用组合分支的验收。NETWORK_DEGRADED 仍保留；Gate1/add2的一次上传已用完且远端精确核实，不再次推送。新工具及组合验证引用的恢复交付需具体范围；不修改共享代理/TLS配置或自动重试。

组合分支 `codex/server-pr-integration` 的可靠恢复提交 `b4c47f1356205e1f064f714ce1fb51efb58e2823` 已本地通过，旧62426固定ops/镜像不依赖本checkout。完成工具切片后安全切回并继续Gate3路由闪屏；不创建重复累计业务PR。若触发CI，只能点名source、team-access、release-baseline三个验收workflow，并核每次run.head_sha；绝不触发deploy-production。所有PR维持未合并，旧环境/账号/业务数据和来源范围不变。
