# 艾诺科登录诊断协议

## 2026-11-07 进程内会话复用（D185）

正式sync-run通过session-collector.ts启动一个私密NDJSON Python进程；不同订单仍独立capture/事务/回执，复用内存中的原JWT和会话信息。凭据只经stdin传入，JWT不跨stdout或持久化。配置/身份变化、认证拒绝或未知进程结果不自动重启。复用报表明确token_expired/auth_expired/401或isLogined=false时才允许一次重新认证及同页重读；403权限拒绝不重认证。每单最多1登录、80报表、180秒不变。

内部事件新增loginDetails：UTC时间、固定接口名loginsys2、isOk、businessCode、text1、message及errorMsg。只保留有界脱敏标量，清除请求凭据、响应认证字段、URL及疑似不透明凭证；不保存完整响应。兼容旧无details及首次不含errorMsg回执。业务API摘要不变。下文“任意返回文本不保留”由此限定字段替代。

真实验证2026-11-07北京时间00:36:09：PI2610-061登录HTTP200/344ms，isOk=false、businessCode=200、text1=-3；1登录0报表，第二张未执行。当次未保存errorMsg，不能反推具体提示。随后已补字段，未重复登录。已保存网页脚本仅对-2特殊覆盖确认；-3在成功分支还可出现，失败提示取errorMsg，故不能单凭-3断言密码/会话/限流。参见[执行记录](../tasks/active/ainuoke-session-lifecycle-2026-11-07.md)。

用户完成网页登录后00:40:53受控对照：errorMsg明确“已达到可用的用户数，不可登录”，HTTP200/292ms，仍isOk=false、text1=-3。新增精确提示分类user_capacity_exhausted；只凭-3仍不分类。未证明占用者或并发上限，不能自动踢出或绕过限制。

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

## 2026-11-07真实认证复用验收

固定本机617范围：PI2610-061首次登录1次/30报表成功，PI2611-057同进程0登录/28报表成功。后续固定队列继续使用同一sessionCollector；准确累计以任务记录/诊断回执为准。先前实际“已达到可用的用户数，不可登录”的具体额度范围仍未知，恢复成功不等于确定原因。

正式sync-run可带--source-ids固定列表（1–1400、不得重复/空值、必须绑定）只消费已有/手动队列，不排自动刷新；默认未指定范围的连续同步逻辑保持。逐单事务不启动新登录。用户预览只读账号不提升；本机独立限权验收账号走正常登录与来源刷新接口。
