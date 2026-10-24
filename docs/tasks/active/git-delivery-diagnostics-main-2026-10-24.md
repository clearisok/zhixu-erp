# Git交付分类与诊断：实际main的独立加性修复

2026-10-24。root唯一writer，既有server_convergence_review只读复核。该切片为持续Server收敛任务的交付工具前置，不替代完整G1–G5。

## 现场与授权边界

GitHub API重新核实实际main=e01a11952b648024c0bd6bf4259de429374981e2，#123已按用户批准merge，原历史/分支保留；#125仍原ca05d3e75d3b28be44184a5ef645c9f24e6f38d3草稿。其最新本地整合9e36c6e9f4eceae4c91585538d47eaa25ec4555d的134发布、42API、2数据库工具、双构建/产物和最终精确main守卫已各自验收。

9e的正常Dry Run返回READY_DRY_RUN/NORMAL，随后只执行一次原PowerShell交付工具。返回同时为STOP_AUTH_OR_DIVERGENCE、remoteStatus=EXACT_HEAD_VERIFIED、完整9e、pushes=1；该版本没有push退出码诊断。原文错误未保存，不能反推认证/分歧/关键词误分类中哪项是本次根因。回执保存在ignored outputs/pr125-main-e01a-forward-20261024/delivery-9e36c6e9.json，原STOP不变，不重推，不绕过它移动#125引用，没有新Actions。

用户常设“以后都自动授权不要再问我”允许本任务必要工程/Git恢复，仍不授权共享认证/TLS/代理修改、自动merge、部署、真实账号/业务库/来源/退役。当前只做独立本地工具修复。

## 基线与最小实现

从干净9e保护原codex/pr125-main-e01a-forward后，新建codex/git-delivery-diagnostics-main-e01a于真实main e01a。没有继承dirty或reset/clean。原main三摘要按Git原字节[归档](../completed/2026-10-24-git-delivery-diagnostics-inputs/)，清单只前移main/日期，原222证据、46能力及截图/运行维度不改。

原717bbab20a55faeeecf52f30c0546aafa0e4aa1d已有相关工具实现与66项验收，但包含未合并累计业务，不能整体合入main。本片仅加性复用四文件并保留main后加的保护：

- scripts/git-delivery-state.mjs：独立remoteVerified才可认exact送达；已证实分歧优先；区分明确拒绝和成功ref里的普通词。
- scripts/git-delivery.mjs：共用拒绝判定；正常post-push decision添加pushDiagnostic，仅exitCode/category/timedOut/elapsedMs白名单字段。不输出stderr/stdout、URL、token、Cookie或凭据。
- 两份现有git-delivery测试：保留main三条STOP+exact用例和preflight exact状态断言，新增合法ref/未核实远端/显式拒绝/TLS/EOF/脱敏覆盖。

TLS身份/配置仍最优先。明确authentication failed、permission/access denied、Username拒绝、HTTP401/403及[rejected]/[remote rejected]即使exit0仍STOP；conflict/diverg/rejected/non-fast-forward等普通ref词仅在失败命令中判拒绝。正常成功仍需独立精确SHA，TLS EOF警告继续NETWORK_DEGRADED；超时/启动/输出上限不能冒充健康成功。所有早退、transport-only matching-refs fallback、dirty/仓库/分支/祖先/一次push限制保持。exact STOP继续不提供-Execute恢复命令。

诊断只覆盖正常post-push decision，不声称每个local-change/postflight/关系读取早退都增加字段。新增分类不能追溯修改9e原回执，也不证明网络永久修好。

## 验证过程与当前恢复点

首次定向red：3项1pass/2fail，175.4585ms，复现成功ref和不完整证明的误判。初步加性移植69/69通过，188977.5962ms，0fail/cancel/skip；定向lint通过。原red和初步green均保留。

独立复审指出exit0的显式认证/权限拒绝不可一并豁免。新增定向red2/2失败、181.0011ms，证明这个缺口；随后用两入口共用的纯判定修正，并补全真实自有临时裸仓中zero-exit refusal+exact的负向场景。最终完整工具75/75通过，202051.5703ms，fail/cancel/skip均0；定向lint通过。原65852已终态，所有red/初步green/最终green分别保留；不把初步69当最终版结果。独立只读复审确认显式拒绝P2关闭、无新增P1/P2。

本片没有应用/SQL/UI/依赖变化，不重跑旧业务/数据库/完整浏览器/镜像套件，也不重派旧失败Hosted CI。最终源码checkpoint、必要发布134及精确e01a守卫、复审各自记录。未执行新远端写入；继续保护9e、717、0ba、1028等原引用和所有运行资产。仅测试自己的临时裸仓，不触碰真实业务数据库或来源。
