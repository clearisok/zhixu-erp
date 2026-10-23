# 恢复点：#127 在实际合并后的 main 上收口

2026-10-23；root 唯一 writer，既有 reviewer 只读。用户批准 #126 merge commit 与 #127
前向整合。实际 main `e06162c70c9792895c30030216dc8c2a66368069`；parents 精确为
`996dfedc12da3527343cd3ff2aa5eea35497e10e` 与
`0be89ff99a7339a68934ed94a56fdc32b11cc8ab`。tree已核对，原历史/分支保留。

当前复用 `C:/Users/Administrator/.codex/worktrees/git-delivery-preflight/zhixu-ainuoke-api`，
branch `codex/git-delivery-preflight-fallback`，干净输入37bd0e1e81810f46c1972f37630dc99b7fc9b18d。
唯一 PR #127 仍草稿，尚未合并。先读 CURRENT_STATE、
[本轮任务](tasks/active/pr127-main-forward-2026-10-23.md)、原工具任务和 RELEASE_BASELINE_GUARD。

真实 merge e061 仅四处文档/清单冲突；两侧三摘要已逐 Git 字节归档到
`tasks/completed/2026-10-23-pr127-forward-inputs/{37bd0e1e,e06162c7}/`。
213证据/46能力及其他非元数据清单字段完全一致；新清单 baselineSha 必须为实际e061。
发布守卫及其134回归来自 main；不改它们，不混入全项目候选的286证据/58能力/88UI路径。
原127的交付工具和两个CI兼容测试原样保留；不要通过放宽TLS、权限、回执或断言消除失败。

实际 merge checkpoint 为 `7af55486b4b668ece1add73a202bf8f01d2fc3ae`，parents37bd/e061。
工具53/53（158394.0935ms）、发布134/134（300753.775ms）、来源API9/9（7340.6715ms）、
私有Chromium登录10/10（17934.0384ms）均通过，零失败/跳过/取消；类型、定向lint及两个构建通过。
日志与build-info在 `outputs/pr127-forward-e061-20261023/`；56984/12560/2143/57198均终态，
不再poll。前端源码精确7af，buildId pr127-forward-7af55486-20261023，buildTime08:18:26+08。
独立静态review无P1/P2，reviewer未跑测试。最终只文档checkpoint后，仍须实际精确e061 guard、
一次安全交付、核实完整remoteSHA、更新同一#127及其新三CI/复审。不自动合并#127或其他PR。
standing安全Git恢复/CI授权有效，无须逐SHA重问；出现未知dirty/分歧/身份异常则保护现场。

7bf3仍为全项目主控验证引用bee4c632，原三CI绑定686，文档Release39841049038绑定bee；
都是终态，不重启。此次独立Source已从干净stable0c执行且成功（2登录/4报表）；额度已用完。
脱敏回执在7bf3 `outputs/pr126-main-forward-20261023/source-execution-receipt.json`，
原文在另一个受保护目录，禁止读取凭据、重采或把样本观察提升为全域过滤/正式激活。
本轮Source报告留其独立阶段，#127不发布原文或增加来源能力。

3001、50426及其他旧环境/卷/账号/Browser/业务库不动，无部署、入口切换、退役、绑定或
调度。覆盖v1/关账三问仍待；Num/outdate已确认。完整 Goal 未完成。
