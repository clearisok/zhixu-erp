# 接力：标签页图标同源修复

2026-10-31；base/main e37a131a7182a5488f440dcc8fde3ea66de1c6e4，分支fix/brand-shell-navigation，输入2432c955ccbb6651c496c1ada64c6461af504b60。[范围与证据](tasks/active/favicon-origin-2026-10-31.md)。

前一阶段交付及体验站已完成，outputs/pr138-completion.json为恢复点；三项CI全绿，PR138仍草稿未合并。实际镜像源码e460e5d0（2432后续只有测试/文档，等价证明已存）；不要误报当前仍e37或重跑旧交付。

新图标修复从实际公网HTML定位localhost绝对地址，RootLayout显式相对PNG。原mark-only SVG渲染64×64透明PNG，原品牌图片不变；需验证构建输出同源地址/PNG、完成本次精确守卫和一次推送、必要CI，再生成新镜像同步隔离体验站。后续使用独立新回执目录，不能覆盖旧部署/备份/CI记录；当前尚未部署新图标。

用户明确要求同步体验站，未批准合并。原账户/业务/旧资产保留，无新Source、迁移或清理。过程级直连Git经上轮验证可用，仍先有界核对；不改共享代理/TLS/auth。7bf3工作树不重建。旧接力[归档](tasks/completed/2026-10-31-favicon-input-state/AI_HANDOFF.md)。
