# 艾诺科登录诊断协议

2026-11-06；前向补充AINUOKE_SERVER_SOURCE，不修改该文档已冻结的历史证据。

## 内部数据流

ProtectedTransport → DiagnosticTransport → BudgetTransport → 原AinuokeClient。单次登录探针和实际合同采集共用login_evidence.py纯分类器。ProtectedTransport每次请求重置HTTP状态，保留真实状态；禁止重定向与环境代理，原认证参数不变。

原六字段kind/reportId/page/elapsedMs/outcome/httpStatus继续支持。只有login事件可追加loginEvidence：
- responseShape：data_object / object_without_data_object / non_object。
- result：accepted / rejected / malformed，表示isOk的结构/声明；最终认证有效性仍由SDK验证Token和Session结构。
- serverCode：absent / cover_confirmation / unrecognized，仅text1精确-2映射覆盖确认信号。
- serverHint：unclassified / session_exists / verification_required / credentials_rejected / account_unavailable / throttling_hint / cover_confirmation_required；固定提示匹配，矛盾或未知提示不推断。

TypeScript入口严格检查键和值，再写入现有attempt.requests JSONB。旧回执无需补造字段；对外diagnosticSummary仍六字段，无迁移、不新增外部API。原invalid_credential兼容码保留，未知拒绝不等同密码错误；中文说明显示原因未识别。

## 安全与停止

不记录凭据、URL、Headers、Cookie、Token、任意返回文本或完整响应。认证失败、未知返回、证书及身份问题沿用D180停止规则，不能依据hint恢复或自动覆盖登录。诊断成功只证明当次登录；会话丢弃不等于服务端注销。

单次诊断默认1登录/0报表/30秒/0重试；成功也不进入采集，不访问数据库、不启用目标。真实请求须有具体范围；见[本次任务与回执](../tasks/active/ainuoke-login-diagnosis-2026-11-06.md)。

部署兼容：新的Python内部trace须与新的TypeScript白名单校验器一起发布；不能只覆盖旧调度服务的Python模块。新Node兼容旧回执，旧Node会拒绝新字段。此次宁波只运行独立零报表探针，未把模块替换到常驻worker。
