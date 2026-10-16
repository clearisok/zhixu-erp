# D143 复审修复与最终候选

核实2026-10-16；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。当前工程源码71b291762467c1efd19873438fef2abfd2954d23；同一工作树/分支，父PR115@db4236cf不改。GitHub为实时事实源，本文件以前向证据补充engineering-2026-10-16.md，不覆盖其旧源码/镜像或报告。

## 真实复现的工程缺口

8d源码检查JSON序列化字符串是否含秘密值。当合成密码含引号和反斜杠时，序列化会转义这些字符，字面包含检查漏检。Node实际红测Missing expected rejection；Python实际红测complete != failed。没有读取或使用真实密码，日志为selected-source-escaped-node-red及selected-source-escaped-python-red。

71b源码改为有界遍历解码后的字段名和值；Python同时检查本次SDK会话password/token/session，Node再次检查密码值并沿用secret-key检查。任何命中都拒绝bundle，不输出原文/秘密值，不重采；深度超限同样拒绝。没有改正常业务映射、数量、单位、权限、Source端点或UI。

## 结果

- 新Node/实际Python父子进程/一次性PG 13/13；全Python131/131，原连续来源70PASS/1既有Windows平台SKIP、原Source20PASS/1既有Windows平台SKIP。Windows跳过不是本机Linux验证；Hosted另核。
- 类型/定向lint通过。完整root898/898、基线94/94与实际main守卫（11页/44能力/56累计UI路径）通过；最后Hosted CI须固定最终文档提交，不能用本表代替。
- clean 71b源码镜像构建通过：build selected-source-20261016-71b29176；镜像sha256:8f4c0e5272394db15933a2a0c00c0e44933b4b5e42dbcfca8c92a59217aaacfc。无网络read-only检查容器核实精确Git/build/Server/session/snapshot，并实际运行含转义字符的Python保护测试。未启动app或数据库。
- 旧e369/8d镜像只保留历史，不作为待真实执行候选；活动提案/私有proposal以前向新版本指向71b，不改旧proposal或旧报告hash。
- worker返回封闭失败时有已尝试计数；父进程超时、域校验拒绝或无最终回执且无法核实计数时保持unknown，不能冒称0请求或用新ID自动重采。限制是每次显式调用的预算，不是持久授权或定时任务。

## 范围保持

本Phase0真实来源读取/凭据文件读取、0真实DB/账号/迁移/首绑/启用/部署/合并。两合同旧6086941一次许可已用完；历史报告只作过滤证明，不作新快照或整体单位/币种/银行实付确认。真实演示须按活动提案给出新资源和具体一次读写范围，另获确认。

更新时机：源码、范围、权限、真实授权、构建/CI或人工验收变化时新建证据，不覆盖本文件。
