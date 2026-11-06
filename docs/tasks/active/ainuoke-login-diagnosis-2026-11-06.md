# 采集器登录拒绝：诊断补齐与单次真实对照

2026-11-06；用户批准实施本计划，最多1登录、0报表、30秒，无重试、不覆盖会话、不启用同步或升级staging。开始前分支feat/ainuoke-full-catalog-followup，HEAD a8340c4e3b7473c980e9542eaee9f94e937dc176，工作树干净。只读GitHub核实main仍cb5cc29baa49ed7115fdb6c9506b6a80356936ea。

## 已验证事实

- 原SDK将HTTP401/403及任何data.isOk=false统一归为invalid_credential；原实际采集trace未保存封闭登录原因，不能把该码解释为密码错误。
- 原站已保存公开DLogin脚本与SDK都使用GET loginsys2，userName/password/verifyCode/cltType/rememberMe/jsCode。网页初始is_cover_login为空，确认覆盖分支写1；SDK固定false。网页可携带旧Cookie/Token，采集器不复用网页会话并禁止重定向、忽略环境代理。没有证据证明这些差异导致本次失败；不修改认证请求或启用覆盖登录。
- 每次独立capture重新登录；client对象丢弃不等于服务端logout。此前退出网页后曾成功，后来无人网页登录仍失败，因此不能断言单纯网页冲突；会话/并发策略仍待上游证据。
- 宁波完整collector配置与最后remaining3冻结configHash一致（只输出布尔），operator镜像仍41b92948/source06d56d10。未发现运行中的采集容器或material-sync.py进程；旧worker持久状态仍PAUSED。无法据此排除其他机器/网页会话。
- 北京时间2026-11-06 14:53:13，唯一真实诊断HTTP200、305ms、isOk=true，成功。实际1登录/0报表/0重试/不覆盖；无数据库访问。使用原镜像和经哈希核对的诊断模块，只读挂载原受保护配置，无密码/Token/原响应落盘；临时容器已退出，reservation关闭。

## 修复

- login_evidence.py作为单次探针和实际DiagnosticTransport的共用纯分类器；登录事件增加内部可选loginEvidence，封闭记录responseShape/result/serverCode/serverHint。未知值始终unclassified/unrecognized，不保存任意原文或值。
- ProtectedTransport保存本次HTTP状态（包括200、401/403和重定向），每请求清空防止旧状态污染。实际采集的语义拒绝和畸形响应分别保留auth_error/schema_error。
- TypeScript入口严格校验新增白名单，兼容旧六字段回执，现有JSONB保存内部证据，无SQL迁移。对外diagnosticSummary的六字段与采集主envelope不变；权限、停止和重试规则不变。
- 未识别登录拒绝的说明改为“原因未识别，请查看登录诊断”，不要求盲改密码。

## 结论与限制

当前恢复登录，但此前拒绝根因尚未证实。没有为了“修好”而猜测修改请求或强制覆盖。单次成功不能代替持续稳定验收，也不自动解除认证暂停。下一步可准备剩余3张固定补验，实际采集需要新的明确范围；本次登录额度已经消耗。

真实探针所用文件哈希冻结在[回执](../../../artifacts/ainuoke-login-diagnosis-20261106/result.json)，后续仅补齐畸形响应trace分类，不重跑真实登录。608原历史、240/243第二轮进度及全部备份保持；staging仍5af85cd6、3张正式订单、同步PAUSED。未采集、未合并、未部署。

验证结果在本次收口追加；真实成功不代表根因已定位。

本地187项Python、5项诊断存储/兼容检查、类型、受影响TS lint及服务端编译通过；宁波镜像内25项离线诊断通过。首次Python假响应缺status引发1错，改为可选状态并全量187通过；首次源码门禁两项文档问题已修。发布回归初次176/182通过，6项受这两处文档影响；修正后仅复跑这6项，6/6通过，合计182项覆盖通过，原失败记录保留。复审为主执行者逐项检查，不冒称独立代理复审。交付状态以outputs/login-refusal-20261106/后续回执和PR当前HEAD检查为准，不借用旧CI。

诊断结论的证据限制：历史失败未保留足够的原始拒绝信息，无法事后还原上游规则。此次成功无需改请求，只修复确定存在的可观测性缺口；不以无故障窗口推断旧问题永久消失。Python和Node内部协议必须随同一候选发布，不向旧常驻worker单独覆盖新Python文件。
