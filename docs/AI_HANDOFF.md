# 恢复点：来源账本非空恢复

2026-10-26；输入 a9653daad9c33b13499c33425ae8a86dd7ad2ac2，tree 691fdd9b695f7bc5a2d1b9b12a1c0f5fd629d9ce，分支 codex/persistent-cumulative-43-main-869e，工作树干净。main 869ee84dd0b31de6161011e4aa560678b244a64d；唯一草稿PR130远端仍61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，原三项CI通过、未合并。Git退出1的STOP_AUTH_OR_DIVERGENCE根因未定，远端Git/ref写冻结；用户普通PowerShell的早期约5秒TLS中断对照不能解除另一笔退出1的停止状态。

先读[阶段](tasks/active/source-ledger-recovery-2026-10-26.md)及outputs/source-ledger-recovery-20261026。只有独立预审后才能运行本阶段新owned演练；观察超时不重启原handle，不自动重试失败。

先提交源码、canonical archive逐blob核对、独立只读复审，再以原6d镜像运行一次新增输入。冷重建和恢复后比较两代非空观察、颜色/head/历史和精确数量字符串；固定评估时钟只验证持久化投影，不冒称真实经过时间的freshness验收。维护停写后比较全部public表hash和精确pg_sequences文本，必须在恢复启动/login前完成。新runtime尚未运行，不提前PASS。

原e3 9/9及124序列2/2继续按各自source保留，不能借用为本次新八表证据。完整G1–G8/R继续；稳定跨次成衣事件、更正和关账口径仍待后续。3001/50426/59069/62426等旧入口、账号、数据、卷、网络、对象、备份与Browser数据保持；无真实Source/凭据、push/API ref、CI、合并、部署、切换或退役。
